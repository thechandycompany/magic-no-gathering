/* tests/report.js — shared result bookkeeping + printing for the simulations. */
"use strict";
var harnessLib = require("./harness");

var MAX_EXAMPLES = 3;

function newResult(name) {
  return {
    name: name,
    stats: { games: 0, cpuTurns: 0, endTurns: [], outcomes: {}, outcomesBySeats: {}, cpuEliminations: {}, byMode: {} },
    exceptions: [],          // [{message, frame, gameFrame, where}]
    knownFailures: {},       // type → {count, games:Set, examples:[]}
    notes: [],
    dom: []
  };
}

function tally(map, key) { map[key] = (map[key] || 0) + 1; }

function describeWhere(w) {
  var parts = [];
  if (w.mode) parts.push("mode=" + w.mode);
  parts.push("game=" + w.game, "seed=" + w.seed);
  if (w.seats) parts.push("seats=" + w.seats);
  parts.push("turn=" + w.turn, "step=" + w.step);
  if (w.opp) parts.push("opp=" + w.opp);
  return parts.join(" ");
}

function knownFailure(res, type, where, detail) {
  var e = res.knownFailures[type];
  if (!e) e = res.knownFailures[type] = { count: 0, games: new Set(), examples: [] };
  e.count++;
  var gameKey = (where.mode || "") + ":" + where.game;
  if (!e.games.has(gameKey) && e.examples.length < MAX_EXAMPLES) e.examples.push(describeWhere(where) + " — " + detail);
  e.games.add(gameKey);
}

function exception(res, err, where) {
  var stack = err && err.stack ? err.stack : String(err);
  res.exceptions.push({
    message: err && err.message ? err.message : String(err),
    frame: harnessLib.firstFrame(stack),
    gameFrame: harnessLib.gameFrame(stack),
    where: describeWhere(where)
  });
}

function median(xs) {
  if (!xs.length) return NaN;
  var s = xs.slice().sort(function (a, b) { return a - b; }), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function mean(xs) { return xs.length ? xs.reduce(function (a, b) { return a + b; }, 0) / xs.length : NaN; }
function pct(n, d) { return d ? (100 * n / d).toFixed(1) + "%" : "n/a"; }

function printMap(title, map, total) {
  var keys = Object.keys(map).sort();
  if (!keys.length) return;
  console.log("  " + title + ":");
  keys.forEach(function (k) { console.log("    " + k.padEnd(44) + String(map[k]).padStart(6) + (total ? "  (" + pct(map[k], total) + ")" : "")); });
}

function print(res) {
  var s = res.stats;
  console.log("\n=== " + res.name + " simulation ===");
  res.notes.forEach(function (n) { console.log("  note: " + n); });
  console.log("  games completed: " + s.games + (s.cpuTurns ? "   CPU turns simulated: " + s.cpuTurns : ""));
  if (s.endTurns.length) console.log("  game-end turn: median " + median(s.endTurns) + ", mean " + mean(s.endTurns).toFixed(2) + ", min " + Math.min.apply(null, s.endTurns) + ", max " + Math.max.apply(null, s.endTurns));
  var totalOutcomes = Object.values(s.outcomes).reduce(function (a, b) { return a + b; }, 0);
  printMap("outcomes", s.outcomes, totalOutcomes);
  var cpuWins = Object.keys(s.outcomes).filter(function (k) { return /^player-killed/.test(k); }).reduce(function (a, k) { return a + s.outcomes[k]; }, 0);
  if (cpuWins) {
    console.log("  CPU wins by commander damage: " + pct(s.outcomes["player-killed:commander-damage"] || 0, cpuWins) +
      "   by life: " + pct(s.outcomes["player-killed:life"] || 0, cpuWins) +
      (s.outcomes["player-killed:poison"] ? "   by poison: " + pct(s.outcomes["player-killed:poison"], cpuWins) : ""));
  }
  printMap("outcomes by seat count", s.outcomesBySeats);
  printMap("CPU eliminations by cause", s.cpuEliminations);
  Object.keys(s.byMode).forEach(function (mode) {
    var m = s.byMode[mode];
    console.log("  [" + mode + "] games " + m.games + ", end turn median " + median(m.endTurns) + " mean " + mean(m.endTurns).toFixed(2) +
      " · " + Object.keys(m.outcomes).sort().map(function (k) { return k + " " + m.outcomes[k]; }).join(", "));
  });

  console.log("  exceptions: " + res.exceptions.length);
  var grouped = {};
  res.exceptions.forEach(function (e) {
    var key = e.message + " @ " + e.frame;
    if (!grouped[key]) grouped[key] = { count: 0, first: e };
    grouped[key].count++;
  });
  Object.keys(grouped).forEach(function (k) {
    var g = grouped[k];
    console.log("    EXCEPTION x" + g.count + ": " + g.first.message);
    console.log("      at " + g.first.frame + (g.first.gameFrame && g.first.gameFrame !== g.first.frame ? "  (game frame: " + g.first.gameFrame + ")" : ""));
    console.log("      first seen: " + g.first.where);
  });

  var types = Object.keys(res.knownFailures).sort();
  console.log("  invariant failures (KNOWN FAILURES): " + types.length + " type" + (types.length === 1 ? "" : "s"));
  types.forEach(function (t) {
    var e = res.knownFailures[t];
    console.log("    KNOWN FAILURE " + t + ": " + e.count + " occurrence" + (e.count === 1 ? "" : "s") + " in " + e.games.size + " game" + (e.games.size === 1 ? "" : "s"));
    e.examples.forEach(function (x) { console.log("      e.g. " + x); });
  });

  if (res.dom.length) {
    var total = res.dom.reduce(function (a, d) { return a + d.count; }, 0);
    console.log("  WARNING engine→DOM touches: " + total + " calls from " + res.dom.length + " call sites");
    res.dom.slice(0, 25).forEach(function (d) {
      console.log("    " + d.api + "(" + Array.from(d.args).join(", ") + ") x" + d.count + "  at " + d.frame);
    });
    if (res.dom.length > 25) console.log("    ... " + (res.dom.length - 25) + " more call sites");
  } else {
    console.log("  engine→DOM touches: none");
  }
}

module.exports = { newResult: newResult, tally: tally, knownFailure: knownFailure, exception: exception, print: print, median: median, mean: mean };
