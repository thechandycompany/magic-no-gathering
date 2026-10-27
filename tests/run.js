/* =====================================================================
   tests/run.js — entry point for `npm test`.

   Runs the Commander, Adventure and CPU-AI behaviour simulations and
   prints a summary.
   Exit code:
     1  if any simulation threw an exception (always fatal)
     1  if --strict and any invariant failed (KNOWN FAILURES)
     0  otherwise
   ===================================================================== */
"use strict";
var report = require("./report");
var simCommander = require("./sim-commander");
var simAdventure = require("./sim-adventure");
var simAi = require("./sim-ai");

var strict = process.argv.includes("--strict") || process.env.SIM_STRICT === "1";
var started = Date.now();
var results = [];

[["commander", simCommander], ["adventure", simAdventure], ["ai", simAi]].forEach(function (entry) {
  try {
    results.push(entry[1].run());
  } catch (e) {
    // The simulation itself failed to start (e.g. a script failed to load).
    var r = report.newResult(entry[0]);
    report.exception(r, e, { game: "-", seed: "-", turn: "-", step: "load" });
    results.push(r);
  }
});

results.forEach(report.print);

var exceptions = results.reduce(function (n, r) { return n + r.exceptions.length; }, 0);
var knownTypes = results.reduce(function (n, r) { return n + Object.keys(r.knownFailures).length; }, 0);
var domSites = results.reduce(function (n, r) { return n + r.dom.length; }, 0);

console.log("\n=== SUMMARY ===");
console.log("  exceptions:              " + exceptions + (exceptions ? "  ← FAIL" : ""));
console.log("  known-failure types:     " + knownTypes + (knownTypes ? (strict ? "  ← FAIL (--strict)" : "  (not fatal; run with --strict to fail)") : ""));
console.log("  engine→DOM call sites:   " + domSites + (domSites ? "  (warning)" : ""));
console.log("  time:                    " + ((Date.now() - started) / 1000).toFixed(1) + "s");

var failed = exceptions > 0 || (strict && knownTypes > 0);
console.log(failed ? "\nRESULT: FAIL" : "\nRESULT: PASS");
process.exitCode = failed ? 1 : 0;
