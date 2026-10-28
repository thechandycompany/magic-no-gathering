/* =====================================================================
   tests/sim-commander.js — Commander Battle simulation.

   Plays N seeded games (env SIM_GAMES, default 300) with 1–4 CPU seats,
   using the same turn-flow code as js/ui/commander-ui.js
   (js/engine/commander-turn.js):
     beginCommanderRoundQueue → nextCommanderSeat (skips eliminated CPUs)
     CPU seat: executeOpponentMainPhase → resolveCpuResponse("main")
               → executeOpponentCombat → resolveCpuResponse("combat")
               → executeOpponentEndStep
     your seat: playerDrawStep → applyPlayerTurnInputs → computePlayerAttack
               → applyPlayerCombat
   The scripted player resolves spells aimed at its board, counters some
   commander casts, blocks the biggest attacker when it can, attacks with up
   to two 2/2 creatures and deals 5 extra damage to the weakest CPU.

   Invariants are checked after setup and after every CPU / player turn.
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
  res.notes.push("turn flow: js/engine/commander-turn.js (resolveCpuResponse, computePlayerAttack, applyPlayerCombat), the same code the UI runs");
  res.stats.cpuTurns = res.stats.cpuTurns || 0;

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
      h.call("ensureCommanderEffectState", gs);
      var eliminated = new Set();
      var markEliminations = function () {
        gs.opponents.forEach(function (o) { if (isDead(o)) eliminated.add(o.id); });
      };
      checkInvariants(ctx, gs, fail, eliminated);
      h.call("beginCommanderRoundQueue", gs);

      while (!outcome && gs.turn <= MAX_TURNS) {
        where.turn = gs.turn;
        markEliminations();
        var end = h.call("checkCommanderBattleEnd", gs);
        if (end.over) { outcome = end; break; }
        var seat = h.call("nextCommanderSeat", gs);
        if (seat === null) {
          gs.turn++;
          if (gs.turn > MAX_TURNS) break;
          h.call("beginCommanderRoundQueue", gs);
          continue;
        }
        if (seat === "player") {
          where.step = "player"; where.opp = null;
          gs.phase = "player";
          playerTurn(h, gs, fail);
          checkInvariants(ctx, gs, fail, eliminated);
          continue;
        }
        var opp = gs.opponents.find(function (o) { return o.id === seat; });
        where.step = "cpu"; where.opp = opp.name.split(",")[0];
        gs.phase = "cpu";
        if (eliminated.has(opp.id)) fail("eliminated-opponent-acted", "nextCommanderSeat returned an opponent eliminated earlier");
        var lifeBefore = opp.life;
        cpuTurn(h, opp, gs, g, fail);
        if (opp.life > lifeBefore && eliminated.has(opp.id)) fail("eliminated-opponent-revived", "life went from " + lifeBefore + " to " + opp.life);
        res.stats.cpuTurns++;
        checkInvariants(ctx, gs, fail, eliminated);
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

/* One CPU seat, exactly as the UI runs it (window 1 → combat → window 2 → end step). */
function cpuTurn(h, opp, gs, game, fail) {
  var ctx = h.ctx;
  var main = h.call("executeOpponentMainPhase", opp, h.call("allPlayersForTargeting", gs)) || {};
  if (!Array.isArray(main.actions)) { fail("bad-turn-result", "main phase result missing actions[]"); return; }
  if (main.actions.some(function (a) { return a.deckOut; })) opp._deckedOut = true;
  if (ctx.isOpponentDead(opp)) return;

  /* Window 1: spells aimed at your board, counters. */
  var mainResult = { stage: "main", actions: main.actions };
  var mainResponse = { stage: "main", playerRemoval: [], counters: [] };
  h.call("pendingPlayerRemovalActions", mainResult).forEach(function (entry) {
    mainResponse.playerRemoval.push({ key: entry.key, countered: false, creaturesLost: entry.action.boardWipe ? gs.player.creatures : 0 });
  });
  var counteredCommander = false;
  if (game % 5 === 0) {
    h.call("counterableCpuActions", mainResult).forEach(function (entry) {
      if (entry.action.type === "commander") { mainResponse.counters.push(entry.key); counteredCommander = true; }
    });
  }
  h.call("resolveCpuResponse", opp, mainResult, mainResponse);
  if (counteredCommander && ctx.commanderOnField(opp)) fail("countered-commander-stayed", opp.id + " commander still on the battlefield after counter");
  if (h.call("checkCommanderBattleEnd", gs).over || ctx.isOpponentDead(opp)) return;

  /* Combat declaration. */
  var combat = h.call("executeOpponentCombat", opp, h.call("allPlayersForTargeting", gs)) || {};
  if (combat.target && combat.target === opp.id) fail("cpu-attacked-itself", opp.id);
  var defender = combat.target && combat.target !== "player" ? gs.opponents.find(function (o) { return o.id === combat.target; }) : null;
  if (defender && ctx.isOpponentDead(defender) && combat.attackPower > 0) fail("cpu-attacked-eliminated-opponent", opp.id + " → " + defender.id);

  /* Window 2: blocks and damage. */
  if (combat.attackPower > 0 && combat.target) {
    var result = { stage: "combat", target: combat.target, attackPower: combat.attackPower, commanderAttacking: combat.commanderAttacking,
      planeswalkerTargetId: combat.planeswalkerTarget ? combat.planeswalkerTarget.id : null, actions: combat.actions };
    var response = { stage: "combat" };
    if (combat.target === "player" && gs.player.creatures > 0) {
      var biggest = opp.tokens.filter(function (t) { return t.attacking; }).sort(function (a, b) { return b.p - a.p; })[0];
      if (biggest) { response.blocks = [{ uid: biggest.uid, blockerToughness: 2 }]; response.playerDeaths = biggest.p >= 2 ? 1 : 0; }
    }
    var preview = h.call("previewCpuResponse", opp, result, response);
    var lifeBefore = gs.player.life;
    var defenderLifeBefore = defender ? defender.life : null;
    h.call("resolveCpuResponse", opp, result, response);
    if (preview.attack && lifeBefore - gs.player.life !== Math.min(lifeBefore, preview.attack.playerDamage)) {
      fail("preview-mismatch:player", "preview " + preview.attack.playerDamage + " applied " + (lifeBefore - gs.player.life));
    }
    if (preview.cpuCombat && defender && defenderLifeBefore - defender.life !== Math.min(defenderLifeBefore, preview.cpuCombat.damage)) {
      fail("preview-mismatch:cpu", "preview " + preview.cpuCombat.damage + " applied " + (defenderLifeBefore - defender.life));
    }
  }
  if (ctx.isOpponentDead(opp)) return;
  h.call("executeOpponentEndStep", opp);
}

/* Your seat: draw, play (an untracked creature, plus a tracked card every other turn), attack. */
function playerTurn(h, gs, fail) {
  var ctx = h.ctx;
  h.call("playerDrawStep", gs);
  if ((gs.player.tokens || []).some(function (t) { return t.attacking; })) fail("player-creature-still-tapped", "tracked attacker did not untap");
  h.call("applyPlayerTurnInputs", gs, { creaturesPlayed: 1 });
  if ((gs.turn || 0) % 2 === 0) h.call("addPlayerCreatures", gs, { name: "Sim Bear", p: 3, t: 3, kws: gs.turn % 4 === 0 ? ["Vigilance"] : [], commander: gs.turn === 2 }, 1 + (gs.turn % 3 === 0 ? 1 : 0));
  var living = gs.opponents.filter(function (o) { return !ctx.isOpponentDead(o); }).sort(function (a, b) { return a.life - b.life || a.index - b.index; });
  if (!living.length) return;
  var tgt = living[0];
  var rows = [];
  var tracked = ctx.trackedPlayerCreatures(gs.player);
  tracked.forEach(function (t) { if (!t.attacking) rows.push({ uid: t.uid, name: t.name, p: t.p, t: t.t, kws: t.kws, targetId: tgt.id, commander: !!t.commander }); });
  for (var i = 0; i < Math.min(2, ctx.untrackedPlayerCreatures(gs.player)); i++) rows.push({ p: 2, t: 2, kws: i === 0 ? ["Trample"] : [], targetId: tgt.id, commander: false });
  if (rows.length) {
    var lifeBefore = tgt.life;
    var outcome = h.call("computePlayerAttack", gs, rows);
    var expected = outcome.perOpp.reduce(function (s, e) { return s + e.damage; }, 0);
    h.call("applyPlayerCombat", gs, outcome);
    if (lifeBefore - tgt.life !== Math.min(lifeBefore, expected)) fail("player-attack-mismatch", "expected " + expected + " applied " + (lifeBefore - tgt.life));
  }
  if (!ctx.isOpponentDead(tgt)) h.call("applyPlayerCombat", gs, { perOpp: [{ oppId: tgt.id, damage: PLAYER_DAMAGE_PER_TURN }] });
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
  var trackedCount = (p.tokens || []).filter(function (t) { return t.p != null; }).length;
  if ((p.creatures || 0) < trackedCount) fail("player-creatures-below-tracked", "creatures " + p.creatures + " < tracked " + trackedCount);
  if ((p.tokens || []).filter(function (t) { return t.commander; }).length > 1) fail("player-two-commanders", "more than one tracked commander");
  if (p.handSize != null) fail("player-hand-tracked", "player.handSize should not exist");
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
