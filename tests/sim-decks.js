/* =====================================================================
   tests/sim-decks.js — CPU deck archetypes (DECK_REGISTRY) over seeded games.

   Scenarios (CPU settings PL3 / aggression 0.5 / interaction 0.5 unless noted):
     goldfish <deck>   1 CPU playing that deck vs a player who does nothing
     pod boros         4 Boros Tokens CPUs vs the scripted player (1 creature
                       a turn, 5 damage a turn to the lowest-life CPU)
     mixed N-CPU       settings.decks = "mixed" (random distinct decks), 2-4 seats
     seat array        settings.decks = ["boros-tokens", "gruul-voltron", ...]

   Deck invariants (KNOWN FAILURES, fatal with --strict), after setup and
   after every CPU turn:
     deck-unknown            opp.deckId is not in DECK_REGISTRY
     library-not-99          library + hand ≠ 99 right after setup
     deck.other!=otherDeck   deck.other !== otherDeck.length
     hand.other!=typedHand   hand.other !== typedHand.length
     typed-card-wrong-deck   a typed hand / graveyard card's ref does not resolve
                             to the same card name in the owner's deck
     token-missing-uid       a CPU token (incl. created tokens) has no uid / enteredTurn
     duplicate-token-uid     two tokens share a uid
     seat-deck-mismatch      the seat's deck is not what settings.decks asked for
     mixed-not-distinct      "mixed" with ≤ registry-size seats repeated a deck
   Reported per deck: median kill turn, % player kills by life total vs
   commander damage, tokens created per game, anthem casts per game.

   Env: SIM_DECK_GOLDFISH (default 120), SIM_DECK_POD (default 40).
   Seeds: goldfish 60000 + deckIndex*1000 + game, Boros pod 64000 + game,
   mixed 66000 + seats*1000 + game, seat array 69000 + game.
   ===================================================================== */
"use strict";
var harnessLib = require("./harness");
var report = require("./report");

var MAX_TURNS = 40;
var PLAYER_DAMAGE_PER_TURN = 5;
var SETTINGS = { powerLevel: 3, aggression: 0.5, interaction: 0.5 };

function median(list) {
  if (!list.length) return NaN;
  var s = list.slice().sort(function (a, b) { return a - b; });
  var m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function mean(list) { return list.length ? (list.reduce(function (s, x) { return s + x; }, 0) / list.length).toFixed(2) : "n/a"; }
function pct(n, d) { return d ? (100 * n / d).toFixed(1) + "%" : "n/a"; }

function deckBucket(id) {
  return { id: id, seats: 0, killTurns: [], lifeKills: 0, cmdKills: 0, tokens: 0, anthems: 0, eliminated: 0, lastStanding: 0 };
}

/* ---------- invariants ---------- */
function checkDeckInvariants(h, gs, fail, seenUids) {
  var ctx = h.ctx;
  gs.opponents.forEach(function (opp) {
    var deck = ctx.DECK_REGISTRY.find(function (d) { return d.id === opp.deckId; });
    if (!deck) { fail("deck-unknown", opp.id + " deckId=" + opp.deckId); return; }
    if (opp.deck.other !== opp.otherDeck.length) fail("deck.other!=otherDeck", opp.id + ": " + opp.deck.other + " vs " + opp.otherDeck.length);
    if (opp.hand.other !== opp.typedHand.length) fail("hand.other!=typedHand", opp.id + ": " + opp.hand.other + " vs " + opp.typedHand.length);
    var checkRef = function (card, where) {
      if (!card || !card.ref) return;
      var pool = deck.cards[card.ref.category];
      var def = pool && pool[card.ref.index];
      if (!def || def.name !== card.name) fail("typed-card-wrong-deck", opp.id + " (" + deck.id + ") " + where + " " + card.name + " ref " + card.ref.category + ":" + card.ref.index);
    };
    opp.typedHand.forEach(function (c) { checkRef(c, "hand"); });
    (opp.graveyard || []).forEach(function (c) { if (!c.virtual) checkRef(c, "graveyard"); });
    opp.otherDeck.forEach(function (ref) {
      var pool = deck.cards[ref.category];
      if (!pool || !pool[ref.index]) fail("typed-card-wrong-deck", opp.id + " library ref " + ref.category + ":" + ref.index);
    });
    opp.tokens.forEach(function (t) {
      if (typeof t.uid !== "string" || !t.uid) fail("token-missing-uid", opp.id + ":" + t.name);
      if (typeof t.enteredTurn !== "number") fail("token-missing-uid", opp.id + ":" + t.name + " enteredTurn=" + t.enteredTurn);
      var owner = seenUids.get(t.uid);
      if (owner && owner !== t) fail("duplicate-token-uid", t.uid + " " + t.name);
      seenUids.set(t.uid, t);
    });
  });
}

/* ---------- one game ---------- */
/**
 * scenario: {label, seats, goldfish, decks (settings.decks), expect (array of deck ids or null)}
 * Returns nothing; fills buckets (by deck id) and the scenario summary.
 */
function playGame(h, res, summary, buckets, seed, scenario) {
  var ctx = h.ctx;
  h.seed(seed);
  var where = { game: summary.games, seed: seed, seats: scenario.seats, turn: 0, step: "setup", opp: null, mode: scenario.label };
  var fail = function (type, detail) { report.knownFailure(res, type, where, detail); };
  var gs = h.call("createCommanderBattle", scenario.seats, { cpu: SETTINGS, decks: scenario.decks });
  ctx.gameState = gs;
  h.call("ensureCommanderEffectState", gs);
  var seenUids = new Map();

  // Setup checks.
  gs.opponents.forEach(function (opp, i) {
    var size = ctx.opponentDeckSize(opp) + ctx.opponentHandSize(opp);
    if (size !== 99) fail("library-not-99", opp.id + " " + opp.deckId + ": " + size);
    if (scenario.expect && scenario.expect[i] !== opp.deckId) fail("seat-deck-mismatch", opp.id + " wanted " + scenario.expect[i] + " got " + opp.deckId);
    var b = buckets[opp.deckId] = buckets[opp.deckId] || deckBucket(opp.deckId);
    b.seats++;
  });
  if (scenario.decks === "mixed" && scenario.seats <= ctx.DECK_REGISTRY.length) {
    var ids = gs.opponents.map(function (o) { return o.deckId; });
    if (new Set(ids).size !== ids.length) fail("mixed-not-distinct", ids.join(","));
  }
  summary.deckMix[gs.opponents.map(function (o) { return o.deckId; }).sort().join("+")] = (summary.deckMix[gs.opponents.map(function (o) { return o.deckId; }).sort().join("+")] || 0) + 1;
  checkDeckInvariants(h, gs, fail, seenUids);

  var isDead = function (o) { return ctx.isOpponentDead(o); };
  var outcome = null, killer = null, eliminatedSeen = new Set();
  for (var turn = 1; turn <= MAX_TURNS && !outcome; turn++) {
    where.turn = turn;
    gs.phase = "cpu";
    h.call("beginCommanderRound", gs);
    var queue = gs.opponents.filter(function (o) { return !isDead(o); });
    for (var qi = 0; qi < queue.length && !outcome; qi++) {
      var opp = queue[qi];
      if (isDead(opp)) continue;
      where.step = "cpu"; where.opp = opp.name.split(",")[0];
      var end = h.call("checkCommanderBattleEnd", gs);
      if (end.over) { outcome = end; break; }
      var main = h.call("executeOpponentMainPhase", opp, h.call("allPlayersForTargeting", gs)) || { actions: [] };
      (main.actions || []).forEach(function (a) {
        if (a.type === "haymaker" && /\bhaste\b/.test(a.detail || "")) buckets[opp.deckId].anthems++;
        if (a.boardWipe === "symmetric" || (a.boardWipe === "targeted" && a.wipeTarget === "player")) gs.player.creatures = 0;
      });
      if (isDead(opp)) { checkDeckInvariants(h, gs, fail, seenUids); continue; }
      var combat = h.call("executeOpponentCombat", opp, h.call("allPlayersForTargeting", gs)) || {};
      var attackers = opp.tokens.filter(function (t) { return t.attacking; });
      resolveCombat(h, opp, gs, combat, attackers);
      if (!killer && h.call("isPlayerDead", gs)) killer = opp;
      h.call("executeOpponentEndStep", opp);
      opp.tokens.forEach(function (t) { t.summoningSick = false; });
      checkDeckInvariants(h, gs, fail, seenUids);
    }
    gs.opponents.forEach(function (o) { if (isDead(o) && !eliminatedSeen.has(o.id)) { eliminatedSeen.add(o.id); buckets[o.deckId].eliminated++; } });
    if (outcome) break;
    var endAfterCpu = h.call("checkCommanderBattleEnd", gs);
    if (endAfterCpu.over) { outcome = endAfterCpu; break; }

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
    }
    gs.opponents.forEach(function (o) { if (isDead(o) && !eliminatedSeen.has(o.id)) { eliminatedSeen.add(o.id); buckets[o.deckId].eliminated++; } });
    var endAfterPlayer = h.call("checkCommanderBattleEnd", gs);
    if (endAfterPlayer.over) { outcome = endAfterPlayer; break; }
    gs.turn++;
  }
  summary.games++;
  gs.opponents.forEach(function (o) { buckets[o.deckId].tokens += o.tokensCreated || 0; });
  if (!outcome) { summary.timeouts++; return; }
  if (outcome.won) { summary.playerWins++; return; }
  summary.killTurns.push(where.turn);
  if (killer) {
    var b = buckets[killer.deckId];
    b.killTurns.push(where.turn);
    if ((gs.player.commanderDamageReceived[killer.id] || 0) >= 21) b.cmdKills++; else b.lifeKills++;
    summary.killedBy[killer.deckId] = (summary.killedBy[killer.deckId] || 0) + 1;
    var standing = gs.opponents.filter(function (o) { return !isDead(o); });
    if (standing.length === 1) buckets[standing[0].deckId].lastStanding++;
  }
}

/** The player takes every attack (as sim-ai); CPU-vs-CPU goes through resolveCpuVsCpuAttack. */
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

function runScenario(h, res, scenario, games, seedBase) {
  var summary = { label: scenario.label, games: 0, killTurns: [], playerWins: 0, timeouts: 0, killedBy: {}, deckMix: {} };
  var buckets = {};
  for (var g = 0; g < games; g++) {
    var seed = seedBase + g;
    try { playGame(h, res, summary, buckets, seed, scenario); }
    catch (e) { report.exception(res, e, { mode: scenario.label, game: g, seed: seed, seats: scenario.seats, turn: "-", step: "game" }); summary.games++; }
  }
  return { summary: summary, buckets: buckets };
}

function scenarioLines(result) {
  var s = result.summary, lines = [];
  var kills = s.killTurns.length;
  lines.push(s.label + ": games " + s.games + " · player killed " + kills + " (median turn " + median(s.killTurns) + ", mean " + mean(s.killTurns) + ")"
    + " · player won " + s.playerWins + (s.timeouts ? " · timeouts " + s.timeouts : "")
    + (Object.keys(s.killedBy).length > 1 || s.label.indexOf("mixed") === 0 ? " · killing blow by " + Object.keys(s.killedBy).sort().map(function (k) { return k + " " + s.killedBy[k]; }).join(", ") : "")
    + (Object.keys(s.deckMix).length > 1 ? " · deck mixes " + Object.keys(s.deckMix).length : ""));
  Object.keys(result.buckets).sort().forEach(function (id) {
    var b = result.buckets[id], k = b.killTurns.length;
    lines.push("    " + id + ": seats " + b.seats + " · kills " + k + " (median turn " + median(b.killTurns) + ", mean " + mean(b.killTurns) + ")"
      + " · by life " + pct(b.lifeKills, k) + " / commander damage " + pct(b.cmdKills, k)
      + " · tokens created/seat " + (b.tokens / Math.max(1, b.seats)).toFixed(1)
      + " · anthems/seat " + (b.anthems / Math.max(1, b.seats)).toFixed(2)
      + (s.label.indexOf("goldfish") === 0 ? "" : " · eliminated " + pct(b.eliminated, b.seats)));
  });
  return lines;
}

function run(options) {
  options = options || {};
  var goldfishGames = options.goldfish || parseInt(process.env.SIM_DECK_GOLDFISH, 10) || 120;
  var podGames = options.pod || parseInt(process.env.SIM_DECK_POD, 10) || 40;
  var h = harnessLib.createHarness();
  var res = report.newResult("decks");
  var results = [];
  var registry = h.ctx.DECK_REGISTRY;
  res.notes.push("decks: " + registry.map(function (d) { return d.id + " (" + d.name + ", win " + (d.winCondition && d.winCondition.type) + ")"; }).join(", "));

  registry.forEach(function (deck, i) {
    results.push(runScenario(h, res, { label: "goldfish " + deck.id, seats: 1, goldfish: true, decks: [deck.id], expect: [deck.id] }, goldfishGames, 60000 + i * 1000));
  });
  results.push(runScenario(h, res, { label: "pod 4x boros-tokens", seats: 4, goldfish: false, decks: "boros-tokens", expect: ["boros-tokens", "boros-tokens", "boros-tokens", "boros-tokens"] }, podGames, 64000));
  [2, 3, 4].forEach(function (seats) {
    results.push(runScenario(h, res, { label: "mixed " + seats + "-CPU pod", seats: seats, goldfish: false, decks: "mixed" }, podGames, 66000 + seats * 1000));
  });
  var seatArray = ["boros-tokens", "gruul-voltron", "boros-tokens", "gruul-voltron"];
  results.push(runScenario(h, res, { label: "seat array B/G/B/G", seats: 4, goldfish: false, decks: seatArray, expect: seatArray }, podGames, 69000));

  results.forEach(function (r) {
    scenarioLines(r).forEach(function (line) { res.notes.push(line); });
    res.stats.games += r.summary.games;
    r.summary.killTurns.forEach(function (t) { res.stats.endTurns.push(t); });
  });
  res.deckResults = results;
  res.dom = h.domSummary();
  return res;
}

module.exports = { run: run };

if (require.main === module) {
  var r = run();
  report.print(r);
  process.exitCode = r.exceptions.length ? 1 : 0;
}
