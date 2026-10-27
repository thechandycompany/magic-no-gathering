/* =====================================================================
   tests/sim-adventure.js — Solo Adventure simulation.

   For every mode in js/data/modes.js, plays N seeded games (env
   SIM_ADV_GAMES, default 100) through the adventure engine:
     startEnemyTurn()  → scripted enemy-turn resolution → startPlayerTurn()
     → scripted player (0-2 creatures/turn, 2-8 damage, kills one token)
     → checkEnd() → S.turn++
   The enemy-turn resolution mirrors js/ui/inputs.js resolveEnemyTurnInputs
   with default inputs (Slay kills a creature, wipes leave 0 survivors,
   all attack damage is taken). That function lives in the UI layer, so it
   is re-implemented here rather than loaded.

   The engine's showEnemyTurn/showPlayerTurn/endGame write to the DOM;
   those touches go to the shim and are reported as warnings.
   ===================================================================== */
"use strict";
var harnessLib = require("./harness");
var report = require("./report");

var MAX_TURNS = 60;
// The scripted player varies (from its own PRNG, separate from the engine's)
// so different seeds explore different board states: 2-8 damage, 0-2 creatures.
var PLAYER_DAMAGE_MIN = 2, PLAYER_DAMAGE_MAX = 8;

function run(options) {
  options = options || {};
  var gamesPerMode = options.games || parseInt(process.env.SIM_ADV_GAMES, 10) || 100;
  var h = harnessLib.createHarness();
  var ctx = h.ctx;
  var res = report.newResult("adventure");
  var modes = Object.keys(ctx.MODES || {});
  res.notes.push("modes: " + modes.join(", ") + " · " + gamesPerMode + " games each");
  res.notes.push("enemy-turn resolution is re-implemented from js/ui/inputs.js resolveEnemyTurnInputs (UI layer, not loaded)");

  modes.forEach(function (mode, mi) {
    var modeStats = res.stats.byMode[mode] = { games: 0, endTurns: [], outcomes: {} };
    for (var g = 0; g < gamesPerMode; g++) {
      var seed = 50000 + mi * 10000 + g;
      h.seed(seed);
      var playerRng = harnessLib.mulberry32(seed ^ 0x9e3779b9);
      var where = { mode: mode, game: g, seed: seed, turn: 0, step: "setup" };
      var fail = function (type, detail) { report.knownFailure(res, mode + ":" + type, where, detail); };
      try {
        // freshState for every mode must work (smoke) ...
        ctx.S = h.call("freshState", mode);
        ctx.gameOver = false;
        ctx.turnInput = null;
        ctx.undoStack = [];
        if (ctx.S.mode !== mode) fail("freshState-mode-mismatch", "asked " + mode + " got " + ctx.S.mode);
        checkInvariants(ctx, fail);
        var ended = false;
        for (var turn = 1; turn <= MAX_TURNS && !ended; turn++) {
          var S = ctx.S;
          where.turn = S.turn;
          /* ---- enemy turn ---- */
          where.step = "enemy";
          h.call("startEnemyTurn");
          if (ctx.S !== S) { fail("state-replaced", "S object replaced during enemy turn"); S = ctx.S; }
          if (ctx.gameOver) { ended = true; break; }
          resolveEnemyTurn(h, S);
          checkInvariants(ctx, fail);
          if (h.call("checkEnd")) { ended = true; break; }
          S.tokens.forEach(function (t) { t.summoningSick = false; });

          /* ---- player turn ---- */
          where.step = "player";
          h.call("startPlayerTurn");
          if (S.phase !== "player") fail("phase-not-player", "S.phase=" + S.phase + " after startPlayerTurn");
          h.call("adjust", "creatures", Math.floor(playerRng() * 3));
          h.call("jumpToStep", ctx.TURN_STEPS.COMBAT);   // lets the CPU react (evaluateCpuResponse)
          // Damage escalates by +1 every 5 turns so stalemates (e.g. Hard Ulvar's +6 loyalty income) still end.
          h.call("damageLoyalty", PLAYER_DAMAGE_MIN + Math.floor(playerRng() * (PLAYER_DAMAGE_MAX - PLAYER_DAMAGE_MIN + 1)) + Math.floor(S.turn / 5));
          var kills = 1 + Math.floor(playerRng() * 3);
          for (var k = 0; k < kills && S.tokens.length; k++) {
            // kill the highest-power enemy creature
            var best = 0;
            S.tokens.forEach(function (t, i) { if (h.call("tokenPower", t) > h.call("tokenPower", S.tokens[best])) best = i; });
            var out = h.call("removeEnemyBattlefieldToken", best);
            if (out && !out.commanderReturn) h.call("sendToEnemyGraveyard", out.token);
          }
          checkInvariants(ctx, fail);
          if (h.call("checkEnd")) { ended = true; break; }
          S.turn++;
          if (h.call("checkEnd")) { ended = true; break; }
        }
        var S2 = ctx.S;
        if (!ended || !ctx.gameOver) {
          fail("game-did-not-terminate", "no result after " + MAX_TURNS + " turns (loyalty " + S2.loyalty + ", life " + S2.player.life + ", tokens " + S2.tokens.length + ")");
          report.tally(modeStats.outcomes, "timeout");
          report.tally(res.stats.outcomes, mode + ":timeout");
        } else {
          var won = S2.mode === "horde" ? S2.loyalty <= 0 && S2.tokens.length === 0 : S2.loyalty <= 0 || (S2.mode === "voltron" && S2.commanderDamageToEnemy >= 21);
          var cause = won ? "player-won" : S2.mode === "voltron" && S2.commanderDamage >= 21 ? "player-killed:commander-damage" : "player-killed:life";
          report.tally(modeStats.outcomes, cause);
          report.tally(res.stats.outcomes, mode + ":" + cause);
          modeStats.endTurns.push(S2.turn);
          res.stats.endTurns.push(S2.turn);
        }
        modeStats.games++;
        res.stats.games++;
      } catch (e) {
        report.exception(res, e, where);
        report.tally(modeStats.outcomes, "exception");
      }
    }
  });
  res.stats.uiStubCalls = Object.assign({}, h.uiCalls);
  res.dom = h.domSummary();
  return res;
}

/* Mirror of resolveEnemyTurnInputs with default inputs. */
function resolveEnemyTurn(h, S) {
  if (S.pendingDecl === "slay" && S.player.creatures > 0) {
    h.call("adjust", "creatures", -1);
    h.call("gainLoyalty", 1);           // default slayToughness = 1
  }
  if (S.pendingDecl === "wipe" || S.pendingDecl === "conclaveWipe") h.call("setStat", "creatures", 0);
  var power = h.call("totalPower");
  var commander = h.call("voltronCommander");
  var cmd = S.mode === "voltron" && commander && commander.attacking ? Math.min(power, h.call("tokenPower", commander)) : 0;
  if (power > 0) {
    h.call("adjust", "life", -power);
    if (cmd > 0) S.commanderDamage += cmd;
  }
}

function checkNumber(fail, label, v) {
  if (typeof v !== "number" || !isFinite(v)) fail("non-finite:" + label, "value " + String(v));
  else if (v < 0) fail("negative:" + label, "value " + v);
}

function checkInvariants(ctx, fail) {
  var S = ctx.S;
  checkNumber(fail, "loyalty", S.loyalty);
  checkNumber(fail, "player.life", S.player.life);
  checkNumber(fail, "player.creatures", S.player.creatures);
  checkNumber(fail, "turn", S.turn);
  checkNumber(fail, "commanderDamage", S.commanderDamage || 0);
  checkNumber(fail, "attackPower", S.attackPower || 0);
  S.tokens.forEach(function (t) {
    var p = ctx.tokenPower(t), tt = ctx.tokenToughness(t);
    if (typeof p !== "number" || !isFinite(p)) fail("non-finite:tokenPower", t.name + " " + p);
    if (typeof tt !== "number" || !isFinite(tt)) fail("non-finite:tokenToughness", t.name + " " + tt);
  });
  if (S.mode === "voltron" && S.voltronDeck) {
    ["voltronDeck", "voltronHand", "voltronBottom"].forEach(function (k) {
      Object.keys(S[k] || {}).forEach(function (c) { checkNumber(fail, k + "." + c, S[k][c]); });
    });
    ["voltronLandsInPlay", "voltronRampInPlay", "voltronExplosiveInPlay", "voltronMana", "commanderTax"].forEach(function (k) { checkNumber(fail, k, S[k] || 0); });
    var commanders = S.tokens.filter(function (t) { return t.kind === "commander"; }).length;
    if (commanders > 1) fail("multiple-commanders-on-field", String(commanders));
    if (commanders === 1 && S.commanderZone) fail("commander-on-field-and-in-zone", "");
    if (Array.isArray(S.voltronOtherDeck) && S.voltronDeck.other !== S.voltronOtherDeck.length) {
      fail("voltronDeck.other!=voltronOtherDeck.length", "voltronDeck.other=" + S.voltronDeck.other + " voltronOtherDeck.length=" + S.voltronOtherDeck.length);
    }
  }
}

module.exports = { run: run };

if (require.main === module) {
  var r = run();
  report.print(r);
  process.exitCode = r.exceptions.length ? 1 : 0;
}
