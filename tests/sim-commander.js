/* =====================================================================
   tests/sim-commander.js — Commander Battle simulation.

   Plays N seeded games (env SIM_GAMES, default 300) with 1–4 CPU seats.
   Each round mirrors js/ui/commander-ui.js:
     runCpuPhase → advanceCpuQueue → (CPU turn) → resolveResponseAndContinue
   with a scripted "player" who takes all incoming attack damage, plays one
   creature per turn and deals a fixed amount of damage back each turn.

   Invariants are checked after setup and after every CPU / player step.
   Exceptions abort the game and are fatal; invariant violations are
   collected as KNOWN FAILURES (fatal only with --strict).
   ===================================================================== */
"use strict";
var harnessLib = require("./harness");
var report = require("./report");

var MAX_TURNS = 40;
var PLAYER_DAMAGE_PER_TURN = 5;

function run(options) {
  options = options || {};
  var games = options.games || parseInt(process.env.SIM_GAMES, 10) || 300;
  var h = harnessLib.createHarness();
  var ctx = h.ctx;
  var res = report.newResult("commander");
  var phased = h.has("executeOpponentMainPhase") && h.has("executeOpponentCombat") && h.has("executeOpponentEndStep");
  res.notes.push("CPU turn API: " + (phased ? "executeOpponentMainPhase → executeOpponentCombat → (damage) → executeOpponentEndStep" : "executeOpponentTurn (single call)"));

  var isDead = function (opp) { return ctx.isOpponentDead(opp); };

  for (var g = 0; g < games; g++) {
    var seed = 1000 + g;
    var seats = (g % 4) + 1;
    h.seed(seed);
    var where = { game: g, seed: seed, seats: seats, turn: 0, step: "setup", opp: null };
    var fail = function (type, detail) { report.knownFailure(res, type, where, detail); };
    var outcome = null, endTurn = null;
    try {
      var gs = h.call("createCommanderBattle", seats);
      ctx.gameState = gs;
      if (h.has("ensureCommanderEffectState")) h.call("ensureCommanderEffectState", gs);
      var eliminated = new Set();
      var markEliminations = function () {
        gs.opponents.forEach(function (o) { if (isDead(o)) eliminated.add(o.id); });
      };
      checkInvariants(ctx, gs, fail, eliminated);

      for (var turn = 1; turn <= MAX_TURNS && !outcome; turn++) {
        where.turn = turn;
        /* ---- CPU phase (runCpuPhase builds the queue once, like the UI) ---- */
        gs.phase = "cpu";
        var queue = gs.opponents.filter(function (o) { return !isDead(o); });
        for (var qi = 0; qi < queue.length && !outcome; qi++) {
          var opp = queue[qi];
          where.step = "cpu"; where.opp = opp.name.split(",")[0];
          // advanceCpuQueue: eliminations + battle end check
          markEliminations();
          var end = h.call("checkCommanderBattleEnd", gs);
          if (end.over) { outcome = end; break; }
          // advanceCpuQueue does NOT re-check isOpponentDead before running the queued CPU.
          if (eliminated.has(opp.id)) fail("eliminated-opponent-acted", "queued at round start, killed earlier this round, still takes a turn (advanceCpuQueue does not re-check)");
          var lifeBefore = opp.life;
          var result = cpuTurn(h, opp, gs, phased, fail);
          if (opp.life > lifeBefore && eliminated.has(opp.id)) fail("eliminated-opponent-revived", "life went from " + lifeBefore + " to " + opp.life);
          opp.tokens.forEach(function (t) { t.summoningSick = false; });
          res.stats.cpuTurns++;
          checkInvariants(ctx, gs, fail, eliminated);
        }
        if (outcome) break;
        markEliminations();
        var endAfterCpu = h.call("checkCommanderBattleEnd", gs);
        if (endAfterCpu.over) { outcome = endAfterCpu; break; }

        /* ---- Player phase (startPlayerPhase + scripted player) ---- */
        where.step = "player"; where.opp = null;
        gs.phase = "player";
        if (!phased) gs.opponents.forEach(function (o) { o.tokens.forEach(function (t) { t.attacking = false; }); });
        gs.player.creatures = (gs.player.creatures || 0) + 1;
        var living = gs.opponents.filter(function (o) { return !isDead(o); }).sort(function (a, b) { return a.life - b.life || a.index - b.index; });
        if (living.length) {
          var tgt = living[0];
          tgt.life = Math.max(0, tgt.life - PLAYER_DAMAGE_PER_TURN);
          tgt.damageLog.player = (tgt.damageLog.player || 0) + PLAYER_DAMAGE_PER_TURN;
          tgt.lastAttacker = "player";
        }
        checkInvariants(ctx, gs, fail, eliminated);
        markEliminations();
        var endAfterPlayer = h.call("checkCommanderBattleEnd", gs);
        if (endAfterPlayer.over) { outcome = endAfterPlayer; break; }
        gs.turn++;
      }
      endTurn = where.turn;
      if (!outcome) {
        fail("game-did-not-terminate", "no winner after " + MAX_TURNS + " turns");
        report.tally(res.stats.outcomes, "timeout");
      } else {
        var cause;
        if (outcome.won) cause = "player-won";
        else {
          var cmd = Object.values(gs.player.commanderDamageReceived || {}).some(function (d) { return d >= 21; });
          var poison = (gs.player.poison || 0) >= 10;
          cause = cmd ? "player-killed:commander-damage" : poison ? "player-killed:poison" : "player-killed:life";
        }
        report.tally(res.stats.outcomes, cause);
        report.tally(res.stats.outcomesBySeats, seats + " CPU · " + cause);
        res.stats.endTurns.push(endTurn);
      }
      gs.opponents.forEach(function (o) {
        if (!isDead(o)) return;
        var how = o._deckedOut ? "deck-out" : Object.values(o.commanderDamageReceived || {}).some(function (d) { return d >= 21; }) ? "commander-damage" : (o.poison || 0) >= 10 ? "poison" : "life";
        report.tally(res.stats.cpuEliminations, how);
      });
      res.stats.games++;
    } catch (e) {
      report.exception(res, e, where);
      report.tally(res.stats.outcomes, "exception");
    }
  }
  res.stats.uiStubCalls = Object.assign({}, h.uiCalls);
  res.dom = h.domSummary();
  return res;
}

/* One CPU turn + combat resolution, mirroring advanceCpuQueue + resolveResponseAndContinue. */
function cpuTurn(h, opp, gs, phased, fail) {
  var ctx = h.ctx;
  var all = h.call("allPlayersForTargeting", gs);
  var result, endStep = null;
  if (phased) {
    var main = h.call("executeOpponentMainPhase", opp, all) || {};
    var combat = h.call("executeOpponentCombat", opp, h.call("allPlayersForTargeting", gs)) || {};
    result = Object.assign({}, combat, { actions: [].concat(main.actions || [], combat.actions || []) });
  } else {
    result = h.call("executeOpponentTurn", opp, all);
  }
  if (!result || !Array.isArray(result.actions)) { fail("bad-turn-result", "turn result missing actions[]"); return result; }
  if (result.actions.some(function (a) { return a.deckOut; })) opp._deckedOut = true;

  // Board wipes aimed at the player: scripted player always clears the board.
  result.actions.forEach(function (a) {
    if (a.boardWipe === "symmetric" || (a.boardWipe === "targeted" && a.wipeTarget === "player")) gs.player.creatures = 0;
  });

  if (result.target === "player") {
    var attackers = opp.tokens.filter(function (t) { return t.attacking; });
    var actualPower = attackers.reduce(function (s, t) { return s + t.p; }, 0);
    var cmdr = attackers.find(function (t) { return t.kind === "commander"; });
    var declared = actualPower;                          // player takes everything
    var declaredCmd = Math.min(cmdr ? cmdr.p : 0, declared);
    var prev = h.call("applyCpuDamagePrevention", declared, declaredCmd);
    if (prev.damage > 0) {
      gs.player.life = Math.max(0, gs.player.life - prev.damage);
      opp.damageLog.player = (opp.damageLog.player || 0) + prev.damage;
    }
    if (prev.commanderDamage > 0) {
      gs.player.commanderDamageReceived[opp.id] = (gs.player.commanderDamageReceived[opp.id] || 0) + prev.commanderDamage;
    }
  } else if (result.target) {
    var defender = gs.opponents.find(function (o) { return o.id === result.target; });
    var atk = opp.tokens.filter(function (t) { return t.attacking; });
    if (defender && defender.id === opp.id) fail("cpu-attacked-itself", opp.id);
    if (defender && ctx.isOpponentDead(defender) && atk.length) fail("cpu-attacked-eliminated-opponent", opp.id + " → " + defender.id);
    if (defender && !ctx.isOpponentDead(defender) && atk.length > 0) {
      var c = h.call("resolveCpuCombat", opp, defender, atk);
      var p = h.call("applyCpuDamagePrevention", c.damageToDefender, c.commanderDamage);
      if (p.damage > 0) {
        defender.life = Math.max(0, defender.life - p.damage);
        defender.damageLog[opp.id] = (defender.damageLog[opp.id] || 0) + p.damage;
        defender.lastAttacker = opp.id;
      }
      if (p.commanderDamage > 0) defender.commanderDamageReceived[opp.id] = (defender.commanderDamageReceived[opp.id] || 0) + p.commanderDamage;
      c.defenderCreaturesKilled.forEach(function (dead) {
        var i = defender.tokens.indexOf(dead);
        if (i >= 0) removePermanent(h, defender, dead, i);
      });
      c.attackerCreaturesKilled.forEach(function (dead) {
        var i = opp.tokens.indexOf(dead);
        if (i >= 0) removePermanent(h, opp, dead, i);
      });
    }
  }
  if (phased) endStep = h.call("executeOpponentEndStep", opp);
  return result;
}

function removePermanent(h, owner, token, index) {
  if (token.uid != null && h.has("removeOpponentPermanentByUid")) return h.call("removeOpponentPermanentByUid", owner, token.uid, "graveyard");
  return h.call("removeOpponentPermanent", owner, "token:" + index, "graveyard");
}

/* ---------- invariants ---------- */
function checkNumber(fail, label, v, allowNegative) {
  if (typeof v !== "number" || !isFinite(v)) { fail("non-finite:" + label, "value " + String(v)); return; }
  if (!allowNegative && v < 0) fail("negative:" + label, "value " + v);
}

function checkInvariants(ctx, gs, fail, eliminated) {
  var p = gs.player;
  checkNumber(fail, "player.life", p.life);
  checkNumber(fail, "player.creatures", p.creatures);
  if (p.handSize != null) checkNumber(fail, "player.handSize", p.handSize);
  if (p.librarySize != null) checkNumber(fail, "player.librarySize", p.librarySize);
  if (p.poison != null) checkNumber(fail, "player.poison", p.poison);
  Object.keys(p.commanderDamageReceived || {}).forEach(function (k) { checkNumber(fail, "player.commanderDamageReceived", p.commanderDamageReceived[k]); });

  var uids = new Map();
  gs.opponents.forEach(function (opp) {
    checkNumber(fail, "opp.life", opp.life);
    ["landsInPlay", "rampInPlay", "explosiveInPlay", "commanderTax", "gear", "graveyardCount", "exileCount"].forEach(function (k) {
      if (opp[k] != null) checkNumber(fail, "opp." + k, opp[k]);
    });
    if (opp.poison != null) checkNumber(fail, "opp.poison", opp.poison);
    if (opp.heldMana != null) checkNumber(fail, "opp.heldMana", opp.heldMana);
    checkNumber(fail, "opp.mana", ctx.manaAvailable(opp));
    Object.keys(opp.hand || {}).forEach(function (k) { checkNumber(fail, "opp.hand." + k, opp.hand[k]); });
    Object.keys(opp.deck || {}).forEach(function (k) { checkNumber(fail, "opp.deck." + k, opp.deck[k]); });
    checkNumber(fail, "opp.handSize", ctx.opponentHandSize(opp));
    checkNumber(fail, "opp.deckSize", ctx.opponentDeckSize(opp));
    Object.keys(opp.commanderDamageReceived || {}).forEach(function (k) { checkNumber(fail, "opp.commanderDamageReceived", opp.commanderDamageReceived[k]); });

    // Typed library must track the generic "other" count.
    if (opp.deck && typeof opp.deck.other === "number" && Array.isArray(opp.otherDeck) && opp.deck.other !== opp.otherDeck.length) {
      fail("deck.other!=otherDeck.length", opp.id + ": deck.other=" + opp.deck.other + " otherDeck.length=" + opp.otherDeck.length);
    }
    if (opp.hand && typeof opp.hand.other === "number" && Array.isArray(opp.typedHand) && opp.hand.other < opp.typedHand.length) {
      fail("hand.other<typedHand.length", opp.id + ": hand.other=" + opp.hand.other + " typedHand=" + opp.typedHand.length);
    }
    if (ctx.commanderOnField(opp) && opp.commanderZone) fail("commander-on-field-and-in-zone", opp.id);
    var commanders = opp.tokens.filter(function (t) { return t.kind === "commander"; }).length;
    if (commanders > 1) fail("multiple-commanders-on-field", opp.id + ": " + commanders);

    opp.tokens.forEach(function (t) {
      if (typeof t.p !== "number" || !isFinite(t.p)) fail("non-finite:token.p", t.name + " p=" + t.p);
      if (typeof t.t !== "number" || !isFinite(t.t)) fail("non-finite:token.t", t.name + " t=" + t.t);
      if (t.uid != null) {
        if (uids.has(t.uid)) fail("duplicate-token-uid", t.uid + " (" + uids.get(t.uid) + " / " + opp.id + ":" + t.name + ")");
        else uids.set(t.uid, opp.id + ":" + t.name);
      }
    });
    if (eliminated.has(opp.id) && !ctx.isOpponentDead(opp)) fail("eliminated-opponent-revived", opp.id + " life=" + opp.life);
  });
}

module.exports = { run: run };

if (require.main === module) {
  var r = run();
  report.print(r);
  process.exitCode = r.exceptions.length ? 1 : 0;
}
