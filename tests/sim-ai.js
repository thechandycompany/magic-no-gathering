/* =====================================================================
   tests/sim-ai.js — CPU Commander AI behaviour over seeded games.

   Scenarios (per CPU power level 1-5, aggression/interaction 0.5):
     goldfish  1 CPU vs a player who does nothing (no creatures, no damage)
     pod       4 CPUs vs the sim-commander scripted player (1 creature a turn,
               5 damage a turn to the lowest-life CPU) who also tries to
               destroy the biggest CPU commander every third turn
   plus a few knob variants (aggression / interaction 0 and 1) in the pod.

   Behaviour assertions (KNOWN FAILURES, fatal with --strict):
     lethal-not-taken       a CPU with lethal available attacked someone else
                            (or held back what it needed)
     player-overtargeted    3+ CPUs attacked the player in one round without lethal
     wipe-while-ahead       a CPU cast a board wipe while leading the table
   Reported: median kill turn, % commander-damage wins, player-targeted
   share, wipes per game, CPU interaction (protection response) rate.

   Also: Dawnmarch Legion goldfish + pod and a mixed-deck pod at PL3 (settings.decks).

   Env: SIM_AI_GOLDFISH (games per level, default 80), SIM_AI_POD (default 40).
   Seeds: goldfish 70000 + level*1000 + game, pod 80000 + level*1000 + game,
   knobs 90000 + variant*1000 + game, Legion goldfish 95000 + game,
   Legion pod 96000 + game, mixed pod 97000 + game.
   ===================================================================== */
"use strict";
var harnessLib = require("./harness");
var report = require("./report");

var MAX_TURNS = 40;
var PLAYER_DAMAGE_PER_TURN = 5;

function median(list) {
  if (!list.length) return NaN;
  var s = list.slice().sort(function (a, b) { return a - b; });
  var m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function pct(n, d) { return d ? (100 * n / d).toFixed(1) + "%" : "n/a"; }

/* Simple seeded PRNG for the scripted player (separate from the engine's). */
function playerRng(seed) {
  var a = (seed * 2654435761) >>> 0;
  return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function newBucket(label) {
  return { label: label, games: 0, killTurns: [], playerWins: 0, timeouts: 0, cmdKills: 0, lifeKills: 0,
    attacks: 0, attacksOnPlayer: 0, rounds: 0, wipes: 0, removalAttempts: 0, protectedRemovals: 0,
    responseChances: 0, removalResponses: 0, heldManaTurns: 0, strategies: {}, intentChecks: 0, intentHits: 0, cpuRemovals: 0, playerRemovals: 0 };
}

/**
 * Plays one game. scenario: {seats, goldfish, settings}.
 */
function playGame(h, res, bucket, seed, scenario) {
  var ctx = h.ctx;
  h.seed(seed);
  var rng = playerRng(seed);
  var where = { game: bucket.games, seed: seed, seats: scenario.seats, turn: 0, step: "setup", opp: null, mode: bucket.label };
  var fail = function (type, detail) { report.knownFailure(res, type, where, detail); };
  var gs = h.call("createCommanderBattle", scenario.seats, { cpu: scenario.settings, decks: scenario.decks || "gruul-voltron" });
  ctx.gameState = gs;
  if (h.has("ensureCommanderEffectState")) h.call("ensureCommanderEffectState", gs);
  if (!gs.settings) gs.settings = { cpu: scenario.settings };
  var isDead = function (o) { return ctx.isOpponentDead(o); };
  var outcome = null;

  for (var turn = 1; turn <= MAX_TURNS && !outcome; turn++) {
    where.turn = turn;
    gs.phase = "cpu";
    if (h.has("beginCommanderRound")) h.call("beginCommanderRound", gs);
    bucket.rounds++;
    var playerAttackersThisRound = 0, lethalOnPlayerThisRound = false;
    var queue = gs.opponents.filter(function (o) { return !isDead(o); });
    for (var qi = 0; qi < queue.length && !outcome; qi++) {
      var opp = queue[qi];
      if (isDead(opp)) continue; // the UI agent fixes this in the real queue; don't let it skew AI numbers
      where.step = "cpu"; where.opp = opp.name.split(",")[0];
      var end = h.call("checkCommanderBattleEnd", gs);
      if (end.over) { outcome = end; break; }

      var intent = h.has("cpuIntentPreview") ? h.call("cpuIntentPreview", opp, gs) : null;
      var all = h.call("allPlayersForTargeting", gs);
      var aheadBefore = h.has("cpuIsAhead") ? aheadMargin(h, opp, all) : null;
      var main = h.call("executeOpponentMainPhase", opp, all) || { actions: [] };
      if (isDead(opp)) continue;
      (main.actions || []).forEach(function (a) {
        if (!a.boardWipe) return;
        bucket.wipes++;
        if (aheadBefore != null && aheadBefore >= 3) fail("wipe-while-ahead", opp.id + " cast " + a.wipeName + " leading the table by " + aheadBefore.toFixed(1));
        if (a.boardWipe === "symmetric" || (a.boardWipe === "targeted" && a.wipeTarget === "player")) gs.player.creatures = 0;
      });

      all = h.call("allPlayersForTargeting", gs);
      var lethalTargets = independentLethalTargets(h, opp, all, gs);
      var combat = h.call("executeOpponentCombat", opp, all) || {};
      var attackers = opp.tokens.filter(function (t) { return t.attacking; });
      if (combat.attackPower > 0) {
        bucket.attacks++;
        bucket.strategies[opp.currentStrategy] = (bucket.strategies[opp.currentStrategy] || 0) + 1;
        if (intent) { bucket.intentChecks++; if (intent.targetId === combat.target) bucket.intentHits++; }
        if (combat.target === "player") { bucket.attacksOnPlayer++; playerAttackersThisRound++; }
      }
      resolveCombat(h, opp, gs, combat, attackers);
      // The attack counts as taking lethal when its target is now out of the game.
      var killedTarget = combat.target && combat.attackPower > 0 && (combat.target === "player"
        ? h.call("isPlayerDead", gs)
        : isDead(gs.opponents.find(function (o) { return o.id === combat.target; })));
      if (killedTarget && combat.target === "player") lethalOnPlayerThisRound = true;
      if (lethalTargets.length && !killedTarget) {
        var chosen = lethalTargets.find(function (l) { return l.id === combat.target; });
        var strategy = opp.currentStrategy;
        if (!chosen) fail("lethal-not-taken", opp.id + " could kill " + lethalTargets.map(function (l) { return l.id + "(" + l.kind + ")"; }).join(",") + " but attacked " + combat.target + " [" + strategy + "]");
        else fail("lethal-not-taken", opp.id + " attacked " + chosen.id + " (" + chosen.kind + " lethal) for " + combat.attackPower + " without killing [" + strategy + "]");
      }
      h.call("executeOpponentEndStep", opp);
      opp.tokens.forEach(function (t) { t.summoningSick = false; });
    }
    if (playerAttackersThisRound > 2 && !lethalOnPlayerThisRound) fail("player-overtargeted", playerAttackersThisRound + " CPUs attacked the player in round " + turn);
    if (outcome) break;
    var endAfterCpu = h.call("checkCommanderBattleEnd", gs);
    if (endAfterCpu.over) { outcome = endAfterCpu; break; }

    /* ---- scripted player ---- */
    where.step = "player"; where.opp = null;
    gs.phase = "player";
    if (!scenario.goldfish) {
      gs.player.creatures = (gs.player.creatures || 0) + 1;
      var living = gs.opponents.filter(function (o) { return !isDead(o); }).sort(function (a, b) { return a.life - b.life || a.index - b.index; });
      if (living.length) {
        var tgt = living[0];
        tgt.life = Math.max(0, tgt.life - PLAYER_DAMAGE_PER_TURN);
        tgt.damageLog.player = (tgt.damageLog.player || 0) + PLAYER_DAMAGE_PER_TURN;
        tgt.lastAttacker = "player";
      }
      // Every third turn: try to destroy the biggest CPU commander (6+ power).
      if (turn % 3 === 0) {
        var victims = gs.opponents.filter(function (o) { return !isDead(o) && ctx.commanderOnField(o) && ctx.commanderOnField(o).p >= 6; })
          .sort(function (a, b) { return ctx.commanderOnField(b).p - ctx.commanderOnField(a).p; });
        if (victims.length && rng() < 0.9) {
          var v = victims[0], cmdr = ctx.commanderOnField(v);
          bucket.removalAttempts++;
          var response = h.call("cpuRespondToRemoval", v, cmdr);
          if (response) bucket.protectedRemovals++;
          else h.call("removeOpponentPermanentByUid", v, cmdr.uid, "graveyard");
        }
      }
    }
    var endAfterPlayer = h.call("checkCommanderBattleEnd", gs);
    if (endAfterPlayer.over) { outcome = endAfterPlayer; break; }
    gs.turn++;
  }
  bucket.games++;
  var stats = gs.aiStats || {};
  bucket.responseChances += stats.removalResponseChances || 0;
  bucket.removalResponses += stats.removalResponses || 0;
  bucket.heldManaTurns += stats.heldManaTurns || 0;
  bucket.cpuRemovals += stats.cpuRemovals || 0;
  bucket.playerRemovals += stats.playerRemovals || 0;
  if (!outcome) { bucket.timeouts++; return; }
  if (outcome.won) { bucket.playerWins++; return; }
  bucket.killTurns.push(where.turn);
  var cmd = Object.values(gs.player.commanderDamageReceived || {}).some(function (d) { return d >= 21; });
  if (cmd) bucket.cmdKills++; else bucket.lifeKills++;
}

/** How far this CPU leads the table (score - best other); negative when behind. */
function aheadMargin(h, opp, all) {
  var mine = h.call("archenemyScore", opp);
  var best = -Infinity;
  all.forEach(function (p) { if (p.id !== opp.id && !h.call("isEliminatedTarget", p)) best = Math.max(best, h.call("archenemyScore", p)); });
  return best === -Infinity ? 0 : mine - best;
}

/**
 * Lethal opportunities computed independently of the AI's own planner:
 * player with no creatures and ready power ≥ life; commander damage so far +
 * a ready commander's power ≥ 21 against a player with no blockers; a CPU
 * whose blocks (cpuAssignBlockers via resolveCpuCombat, no state change)
 * still let lethal damage through.
 */
function independentLethalTargets(h, opp, all, gs) {
  var ctx = h.ctx;
  if (h.call("cpuCreaturesCannotAttack")) return [];
  var ready = opp.tokens.filter(function (t) { return !t.summoningSick && !h.call("isManaToken", t) && (t.p || 0) >= 1; });
  if (!ready.length) return [];
  var power = function (t) { return (t.p || 0) * h.call("combatStrikeCount", t); };
  var total = ready.reduce(function (s, t) { return s + power(t); }, 0);
  var commander = ready.find(function (t) { return t.kind === "commander"; });
  var out = [];
  all.forEach(function (p) {
    if (p.id === opp.id || h.call("isEliminatedTarget", p)) return;
    var received = (p.commanderDamageReceived || {})[opp.id] || 0;
    if (p.id === "player") {
      if ((p.creatures || 0) > 0) return;
      if (total >= p.life) out.push({ id: p.id, kind: "life", need: p.life });
      else if (commander && received + power(commander) >= 21) out.push({ id: p.id, kind: "commander", need: 21 - received });
      return;
    }
    var c = h.call("resolveCpuCombat", opp, p, ready);
    if (c.damageToDefender >= p.life) out.push({ id: p.id, kind: "life", need: 0 });
    else if (received + c.commanderDamage >= 21) out.push({ id: p.id, kind: "commander", need: 0 });
  });
  return out;
}

function resolveCombat(h, opp, gs, combat, attackers) {
  var ctx = h.ctx;
  if (!combat.target || !attackers.length) return;
  if (combat.target === "player") {
    var dmg = attackers.reduce(function (s, t) { return s + (t.p || 0) * h.call("combatStrikeCount", t); }, 0);
    var cmdr = attackers.find(function (t) { return t.kind === "commander"; });
    var cmdDmg = cmdr ? (cmdr.p || 0) * h.call("combatStrikeCount", cmdr) : 0;
    var prev = h.call("applyCpuDamagePrevention", dmg, Math.min(cmdDmg, dmg));
    gs.player.life = Math.max(0, gs.player.life - prev.damage);
    opp.damageLog.player = (opp.damageLog.player || 0) + prev.damage;
    if (prev.commanderDamage > 0) gs.player.commanderDamageReceived[opp.id] = (gs.player.commanderDamageReceived[opp.id] || 0) + prev.commanderDamage;
    return;
  }
  var defender = gs.opponents.find(function (o) { return o.id === combat.target; });
  if (defender && !ctx.isOpponentDead(defender)) h.call("resolveCpuVsCpuAttack", opp, defender);
}

function runScenario(h, res, label, scenario, games, seedBase) {
  var bucket = newBucket(label);
  for (var g = 0; g < games; g++) {
    var seed = seedBase + g;
    try { playGame(h, res, bucket, seed, scenario); }
    catch (e) { report.exception(res, e, { game: g, seed: seed, seats: scenario.seats, turn: "-", step: label }); bucket.games++; }
  }
  return bucket;
}

function bucketLine(b) {
  var kills = b.killTurns.length;
  return b.label + ": games " + b.games
    + " · kill turn median " + median(b.killTurns) + " mean " + (b.killTurns.reduce(function (s, t) { return s + t; }, 0) / Math.max(1, kills)).toFixed(2) + " (" + kills + " kills, player won " + b.playerWins + (b.timeouts ? ", timeouts " + b.timeouts : "") + ")"
    + " · cmd-damage kills " + pct(b.cmdKills, kills)
    + " · player targeted " + pct(b.attacksOnPlayer, b.attacks) + " of attacks, " + (b.attacksOnPlayer / Math.max(1, b.rounds)).toFixed(2) + " CPUs/round"
    + " · wipes/game " + (b.wipes / Math.max(1, b.games)).toFixed(2)
    + (b.removalAttempts ? " · protection responses " + b.protectedRemovals + "/" + b.removalAttempts + " removals (" + pct(b.protectedRemovals, b.removalAttempts) + "; "
      + pct(b.removalResponses, b.responseChances) + " of all removal when holding mana + a protection spell)" : "")
    + " · held-mana turns/game " + (b.heldManaTurns / Math.max(1, b.games)).toFixed(2)
    + " · CPU spot removal/game " + ((b.cpuRemovals + b.playerRemovals) / Math.max(1, b.games)).toFixed(2)
    + (b.intentChecks ? " · intent preview matched " + pct(b.intentHits, b.intentChecks) : "")
    + (b.attacks && Object.keys(b.strategies).length > 1 ? " · target reasons " + Object.keys(b.strategies).sort().map(function (k) { return k + " " + b.strategies[k]; }).join(", ") : "");
}

function run(options) {
  options = options || {};
  var goldfishGames = options.goldfish || parseInt(process.env.SIM_AI_GOLDFISH, 10) || 80;
  var podGames = options.pod || parseInt(process.env.SIM_AI_POD, 10) || 40;
  var h = harnessLib.createHarness();
  var res = report.newResult("ai");
  var buckets = [];
  for (var level = 1; level <= 5; level++) {
    var settings = { powerLevel: level, aggression: 0.5, interaction: 0.5 };
    buckets.push(runScenario(h, res, "goldfish PL" + level, { seats: 1, goldfish: true, settings: settings }, goldfishGames, 70000 + level * 1000));
  }
  for (var lv = 1; lv <= 5; lv++) {
    var s2 = { powerLevel: lv, aggression: 0.5, interaction: 0.5 };
    buckets.push(runScenario(h, res, "4-CPU pod PL" + lv, { seats: 4, goldfish: false, settings: s2 }, podGames, 80000 + lv * 1000));
  }
  var knobs = [
    ["aggression 0", { powerLevel: 3, aggression: 0, interaction: 0.5 }],
    ["aggression 1", { powerLevel: 3, aggression: 1, interaction: 0.5 }],
    ["interaction 0", { powerLevel: 3, aggression: 0.5, interaction: 0 }],
    ["interaction 1", { powerLevel: 3, aggression: 0.5, interaction: 1 }]
  ];
  knobs.forEach(function (k, i) {
    buckets.push(runScenario(h, res, "4-CPU pod PL3 " + k[0], { seats: 4, goldfish: false, settings: k[1] }, podGames, 90000 + i * 1000));
  });
  // Second deck archetype (settings.decks): the same behaviour assertions apply.
  var pl3 = { powerLevel: 3, aggression: 0.5, interaction: 0.5 };
  buckets.push(runScenario(h, res, "boros-tokens goldfish PL3", { seats: 1, goldfish: true, settings: pl3, decks: ["boros-tokens"] }, goldfishGames, 95000));
  buckets.push(runScenario(h, res, "boros-tokens 4-CPU pod PL3", { seats: 4, goldfish: false, settings: pl3, decks: "boros-tokens" }, podGames, 96000));
  buckets.push(runScenario(h, res, "mixed 4-CPU pod PL3", { seats: 4, goldfish: false, settings: pl3, decks: "mixed" }, podGames, 97000));
  buckets.forEach(function (b) {
    res.notes.push(bucketLine(b));
    res.stats.games += b.games;
    b.killTurns.forEach(function (t) { res.stats.endTurns.push(t); });
  });
  res.buckets = buckets;
  res.dom = h.domSummary();
  return res;
}

module.exports = { run: run };

if (require.main === module) {
  var r = run();
  report.print(r);
  process.exitCode = r.exceptions.length ? 1 : 0;
}
