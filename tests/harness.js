/* =====================================================================
   tests/harness.js — headless loader for the game engine.

   Loads every non-UI <script> from "Magic No Gathering.html" (in HTML
   order) into a Node `vm` context with:
     - a seeded PRNG (mulberry32) replacing Math.random
     - auto-generated no-op stubs for every function defined in js/ui/*
       (the engine calls some of them as globals), with a few overrides
     - a minimal document/window/localStorage shim that records every
       engine→DOM touch so tests can report them as warnings

   Node built-ins only. No dependencies.
   ===================================================================== */
"use strict";
var vm = require("vm");
var fs = require("fs");
var path = require("path");

var ROOT = path.resolve(__dirname, "..");
var HTML_FILE = path.join(ROOT, "Magic No Gathering.html");
var DEFAULT_CALL_TIMEOUT_MS = 2000;

/* ---------- script list (kept in sync with the HTML) ---------- */
function parseScriptList() {
  var html = fs.readFileSync(HTML_FILE, "utf8");
  var re = /<script\b[^>]*\bsrc\s*=\s*["']([^"'?#]+)[^"']*["'][^>]*>/gi;
  var out = [], m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}
function isUiScript(src) { return /^js\/ui\//.test(src.replace(/^\.\//, "")); }

/* ---------- PRNG ---------- */
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- stack helpers ---------- */
function relPath(p) { return p.split(ROOT + path.sep).join(""); }
/** First stack frame that points into the game's own js/ files (skips tests/). */
function gameFrame(stack) {
  var lines = String(stack || "").split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.indexOf(ROOT) === -1) continue;
    if (line.indexOf(path.join(ROOT, "tests")) !== -1) continue;
    return relPath(line.trim().replace(/^at\s+/, ""));
  }
  return null;
}
/** First "at ..." frame of any stack, with repo paths made relative. */
function firstFrame(stack) {
  var lines = String(stack || "").split("\n");
  for (var i = 0; i < lines.length; i++) {
    if (/^\s*at\s/.test(lines[i])) return relPath(lines[i].trim().replace(/^at\s+/, ""));
  }
  return "(no stack)";
}

/* ---------- discover UI functions to stub ---------- */
function functionNamesIn(code) {
  var names = new Set(), re = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g, m;
  while ((m = re.exec(code))) names.add(m[1]);
  return names;
}

/* ---------- DOM shim ---------- */
function makeDomShim(record) {
  function makeClassList() {
    var set = new Set();
    return {
      add: function () { for (var i = 0; i < arguments.length; i++) set.add(arguments[i]); },
      remove: function () { for (var i = 0; i < arguments.length; i++) set.delete(arguments[i]); },
      toggle: function (c, force) { var on = force === undefined ? !set.has(c) : !!force; if (on) set.add(c); else set.delete(c); return on; },
      contains: function (c) { return set.has(c); }
    };
  }
  function makeElement(id) {
    var el = {
      id: id || "", tagName: "DIV", textContent: "", innerHTML: "", innerText: "", className: "",
      hidden: false, disabled: false, value: "", checked: false, style: {}, dataset: {},
      children: [], childNodes: [], parentNode: null, onclick: null,
      classList: makeClassList(),
      addEventListener: function () {}, removeEventListener: function () {},
      appendChild: function (c) { return c; }, removeChild: function (c) { return c; },
      insertBefore: function (c) { return c; }, insertAdjacentHTML: function () {},
      prepend: function () {}, append: function () {}, replaceChildren: function () {},
      remove: function () {}, focus: function () {}, blur: function () {}, click: function () {},
      setAttribute: function () {}, getAttribute: function () { return null; }, removeAttribute: function () {},
      hasAttribute: function () { return false; },
      querySelector: function () { return makeElement(); },
      querySelectorAll: function () { return []; },
      closest: function () { return null; }, matches: function () { return false; },
      contains: function () { return false; },
      scrollIntoView: function () {}, getBoundingClientRect: function () { return { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }; }
    };
    return el;
  }
  function touch(api, arg) {
    record(api, arg, new Error().stack);
  }
  var body = makeElement("body"), docEl = makeElement("html");
  var document = {
    body: body, documentElement: docEl, activeElement: body, readyState: "complete",
    getElementById: function (id) { touch("document.getElementById", id); return makeElement(id); },
    querySelector: function (sel) { touch("document.querySelector", sel); return makeElement(); },
    querySelectorAll: function (sel) { touch("document.querySelectorAll", sel); return []; },
    getElementsByClassName: function (c) { touch("document.getElementsByClassName", c); return []; },
    createElement: function (tag) { touch("document.createElement", tag); var e = makeElement(); e.tagName = String(tag).toUpperCase(); return e; },
    createTextNode: function () { return makeElement(); },
    addEventListener: function () {}, removeEventListener: function () {}
  };
  return document;
}

function makeLocalStorage() {
  var store = new Map();
  return {
    getItem: function (k) { return store.has(String(k)) ? store.get(String(k)) : null; },
    setItem: function (k, v) { store.set(String(k), String(v)); },
    removeItem: function (k) { store.delete(String(k)); },
    clear: function () { store.clear(); },
    key: function (i) { return Array.from(store.keys())[i] || null; },
    get length() { return store.size; }
  };
}

/* ---------- harness ---------- */
/**
 * createHarness(options) → {
 *   ctx, scripts, seed(n), call(name, ...args), fn(name), has(name), eval(code),
 *   domTouches: [{api,arg,frame}], uiCalls: {name: count}, logs: [string],
 *   domSummary() → [{api,arg,frame,count}]
 * }
 */
function createHarness(options) {
  options = options || {};
  var callTimeout = options.callTimeoutMs || DEFAULT_CALL_TIMEOUT_MS;
  var domTouches = [];
  var uiCalls = Object.create(null);
  var logs = [];
  var maxLogs = options.maxLogs || 200;
  var rng = mulberry32(1);

  function recordDom(api, arg, stack) {
    domTouches.push({ api: api, arg: arg == null ? "" : String(arg), frame: gameFrame(stack) || "(unknown)" });
  }

  var document = makeDomShim(recordDom);
  var sandbox = {
    console: options.console || { log: function () {}, info: function () {}, warn: function () {}, error: function () {}, debug: function () {} },
    document: document,
    localStorage: makeLocalStorage(),
    sessionStorage: makeLocalStorage(),
    navigator: { userAgent: "node-sim" },
    location: { href: "file://sim", reload: function () {} },
    setTimeout: function () { return 0; },   // timers never fire headless
    clearTimeout: function () {},
    setInterval: function () { return 0; },
    clearInterval: function () {},
    requestAnimationFrame: function () { return 0; },
    alert: function (msg) { recordDom("window.alert", msg, new Error().stack); },
    confirm: function (msg) { recordDom("window.confirm", msg, new Error().stack); return true; },
    prompt: function (msg) { recordDom("window.prompt", msg, new Error().stack); return null; },
    getComputedStyle: function () { return {}; },
    matchMedia: function () { return { matches: false, addEventListener: function () {}, addListener: function () {} }; },
    addEventListener: function () {}, removeEventListener: function () {},
    __rand: function () { return rng(); }
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;

  var ctx = vm.createContext(sandbox);

  var scripts = parseScriptList();
  var engineScripts = scripts.filter(function (s) { return !isUiScript(s); });
  var uiScripts = scripts.filter(isUiScript);

  /* Stub every function the UI defines (engine definitions loaded later win). */
  var engineCode = engineScripts.map(function (s) { return fs.readFileSync(path.join(ROOT, s), "utf8"); }).join("\n");
  var engineDefs = functionNamesIn(engineCode);
  var uiNames = new Set();
  uiScripts.forEach(function (s) { functionNamesIn(fs.readFileSync(path.join(ROOT, s), "utf8")).forEach(function (n) { uiNames.add(n); }); });
  var overrides = {
    askConfirm: function () { return Promise.resolve(true); },
    askNumber: function (t, def) { return Promise.resolve(def == null ? 0 : def); },
    currentTurnInputKey: function () { return ""; },
    playerEffectSummary: function () { return ""; },
    escapeHtml: function (v) { return String(v == null ? "" : v); },
    logCommander: function (msg) { if (logs.length < maxLogs) logs.push(String(msg)); },
    toast: function () {}
  };
  // A few globals the engine expects even though no ui function is named after them.
  ["renderTokens", "render", "renderLog", "toast", "logCommander", "saveState", "renderBoardView", "cmdSnapshot", "showCommanderGame"].forEach(function (n) { uiNames.add(n); });
  uiNames.forEach(function (name) {
    if (engineDefs.has(name)) return;
    var impl = overrides[name];
    sandbox[name] = function () {
      uiCalls[name] = (uiCalls[name] || 0) + 1;
      return impl ? impl.apply(null, arguments) : undefined;
    };
  });

  /* Globals declared by UI files that the engine reads (outside the IIFE). */
  vm.runInContext("var gameState = null; var turnInput = null; Math.random = function(){ return __rand(); };", ctx, { filename: path.join(ROOT, "tests", "prelude.js") });

  engineScripts.forEach(function (src) {
    var file = path.join(ROOT, src);
    vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
  });

  var callScript = new vm.Script("__simRet = globalThis[__simName].apply(null, __simArgs);", { filename: path.join(ROOT, "tests", "call.js") });

  return {
    ctx: ctx,
    scripts: scripts,
    engineScripts: engineScripts,
    skippedScripts: uiScripts,
    domTouches: domTouches,
    uiCalls: uiCalls,
    logs: logs,
    seed: function (n) { rng = mulberry32(n); logs.length = 0; },
    has: function (name) { return typeof ctx[name] === "function"; },
    fn: function (name) { return ctx[name]; },
    eval: function (code) { return vm.runInContext(code, ctx, { timeout: callTimeout }); },
    /** Call a global engine function with a wall-clock timeout (catches infinite loops). */
    call: function (name) {
      if (typeof ctx[name] !== "function") throw new Error("Engine function not defined: " + name);
      ctx.__simName = name;
      ctx.__simArgs = Array.prototype.slice.call(arguments, 1);
      callScript.runInContext(ctx, { timeout: callTimeout });
      var ret = ctx.__simRet;
      ctx.__simRet = undefined; ctx.__simArgs = undefined;
      return ret;
    },
    domSummary: function () {
      var map = new Map();
      domTouches.forEach(function (t) {
        var key = t.api + "|" + t.frame;
        var e = map.get(key);
        if (!e) { e = { api: t.api, frame: t.frame, args: new Set(), count: 0 }; map.set(key, e); }
        e.count++; if (e.args.size < 4) e.args.add(t.arg);
      });
      return Array.from(map.values()).sort(function (a, b) { return b.count - a.count; });
    }
  };
}

module.exports = {
  ROOT: ROOT,
  createHarness: createHarness,
  parseScriptList: parseScriptList,
  mulberry32: mulberry32,
  firstFrame: firstFrame,
  gameFrame: gameFrame
};
