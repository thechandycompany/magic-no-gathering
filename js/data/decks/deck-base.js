/* =====================================================================
   deck-base.js — Shared, canonical utilities for all commander deck AIs

   This file loads FIRST among the commander scripts, so it owns the ONE
   canonical copy of each deck/hand/mana helper. ai-commander.js must not
   redefine any of these (a later top-level `function` silently shadows an
   earlier one, which is how copies drifted apart before).

   Contains:
   - fisherYatesShuffle: proper random shuffle
   - defaultCommanderDeck / deckCommanderBase: resolve the active deck def
   - newDeck: the 99-card virtual library composition (commander excluded)
   - generateOtherDeck / resolveCard: typed "other" card pile
   - drawCard: weighted random draw from a virtual deck (count level)
   - drawOpponentCard: canonical CPU draw (types "other" cards into typedHand)
   - londonMulligan: opening-hand mulligan (first mulligan free, multiplayer)
   - deployCommanderGeneric: shared commander deployment pattern
   - returnCommanderToZone / returnCommanderToHand
   - manaAvailable / commanderCost / refreshCommanderGear
   - opponentHandSize / opponentDeckSize
   - isOpponentDead: life, 21 commander damage from one source, 10 poison

   All functions are declared as regular named functions (not const arrows)
   so they hoist properly for script-tag loading order. Globals defined by
   later files (GRUUL_VOLTRON, COMMANDER_BASE, gameState,
   applyBattlefieldRuleModifiers) are only read at CALL time, guarded with
   typeof checks.
   ===================================================================== */

/** Library composition by category, commander excluded. 37+10+1+51 = 99. */
var DEFAULT_LIBRARY_COUNTS = { lands: 37, ramp: 10, explosive: 1 };
var DECK_CATEGORIES = ["lands", "ramp", "explosive", "other"];
/**
 * Fast-mana pieces in the library by CPU power level (1-5). Level 3 keeps the
 * deck's own count; extra pieces replace lands so the library stays 99 cards.
 */
var FAST_MANA_BY_POWER_LEVEL = [null, 0, 1, 1, 3, 5];

/**
 * Fisher-Yates shuffle — returns a new shuffled copy, does not mutate input.
 */
function fisherYatesShuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = a[i];
    a[i] = a[j];
    a[j] = temp;
  }
  return a;
}

/** The deck definition used when a caller does not pass one. */
function defaultCommanderDeck() {
  return typeof GRUUL_VOLTRON !== "undefined" ? GRUUL_VOLTRON : null;
}

/** Commander baseline stats {p,t,kws,cost} for an opponent (or the default deck). */
function deckCommanderBase(opp) {
  if (opp && opp.commanderBase) return opp.commanderBase;
  if (typeof COMMANDER_BASE !== "undefined") return COMMANDER_BASE;
  var deck = defaultCommanderDeck();
  return deck ? deck.commanderBase : { p: 4, t: 4, kws: [], cost: 5 };
}

/** Number of typed "other" cards in a deck definition's composition. */
function deckOtherCount(deckDef) {
  var comp = (deckDef || defaultCommanderDeck() || {}).deckComposition || {};
  var total = 0;
  for (var key in comp) if (comp.hasOwnProperty(key)) total += comp[key] || 0;
  return total;
}

/**
 * Creates a standard virtual library: category counts (not individual cards).
 * 37 lands + 10 ramp + 1 explosive + N other, where N is the deck
 * definition's deckComposition total (51 for Gruul Voltron) = 99 cards.
 */
function newDeck(deckDef, powerLevel) {
  var def = deckDef || defaultCommanderDeck();
  var counts = (def && def.libraryCounts) || DEFAULT_LIBRARY_COUNTS;
  var explosive = counts.explosive;
  if (powerLevel != null && powerLevel !== 3 && FAST_MANA_BY_POWER_LEVEL[powerLevel] != null) explosive = FAST_MANA_BY_POWER_LEVEL[powerLevel];
  var lands = Math.max(0, counts.lands - (explosive - counts.explosive));
  return { lands: lands, ramp: counts.ramp, explosive: explosive, other: def ? deckOtherCount(def) : 51 };
}

/**
 * Builds the shuffled typed pile backing deck.other. Each entry is a ref
 * {category, index} into deckDef.cards. Draw by popping from the END.
 */
function generateOtherDeck(deckDef) {
  var def = deckDef || defaultCommanderDeck();
  var cards = [];
  var comp = def.deckComposition;
  for (var cat in comp) {
    if (!comp.hasOwnProperty(cat)) continue;
    var pool = def.cards[cat];
    for (var i = 0; i < comp[cat]; i++) cards.push({ category: cat, index: i % pool.length });
  }
  return fisherYatesShuffle(cards);
}

/** Resolves a typed ref into its card definition. */
function resolveCard(ref, deckDef) {
  var def = deckDef || defaultCommanderDeck();
  return def.cards[ref.category][ref.index];
}

/** A typed hand entry: card data plus its ref (so it can go back to the library). */
function typedHandCard(ref, deckDef) {
  var card = resolveCard(ref, deckDef);
  var entry = {};
  for (var key in card) if (card.hasOwnProperty(key)) entry[key] = card[key];
  entry.ref = { category: ref.category, index: ref.index };
  return entry;
}

/**
 * Draws a card from a virtual deck into a hand using weighted random selection.
 * Both deck and hand are {lands, ramp, explosive, other} count objects.
 * Returns the category drawn ("lands", "ramp", "explosive", "other") or "none".
 * NOTE: count-level only. CPU draws must go through drawOpponentCard so that
 * "other" cards get a typed entry in typedHand.
 */
function drawCard(deck, hand) {
  var total = deck.lands + deck.ramp + deck.explosive + deck.other;
  if (total <= 0) return "none";
  var roll = Math.floor(Math.random() * total);
  for (var i = 0; i < DECK_CATEGORIES.length; i++) {
    var key = DECK_CATEGORIES[i];
    if (roll < deck[key]) {
      deck[key]--;
      hand[key]++;
      return key;
    }
    roll -= deck[key];
  }
  return "none";
}

/**
 * Canonical CPU draw. Keeps the invariants
 *   opp.otherDeck.length === opp.deck.other and
 *   opp.typedHand.length === opp.hand.other.
 * Returns the category drawn or "none" (empty library).
 */
function drawOpponentCard(opp) {
  var drawn = drawCard(opp.deck, opp.hand);
  if (drawn === "other") {
    if (opp.otherDeck && opp.otherDeck.length > 0) {
      opp.typedHand.push(typedHandCard(opp.otherDeck.pop()));
    } else {
      // Library/typed pile out of sync (legacy save) — keep the counts honest.
      opp.hand.other = Math.max(0, opp.hand.other - 1);
      return "none";
    }
  }
  return drawn;
}

/** Puts one hand card back into the library (count model: position is random). */
function returnHandCardToLibrary(opp, category, typedIndex) {
  if (category === "other") {
    var removed = opp.typedHand.splice(typedIndex, 1)[0];
    if (!removed) return false;
    opp.hand.other = Math.max(0, opp.hand.other - 1);
    opp.deck.other++;
    opp.otherDeck.unshift(removed.ref); // bottom of the typed pile
    return true;
  }
  if (!(opp.hand[category] > 0)) return false;
  opp.hand[category]--;
  opp.deck[category]++;
  return true;
}

/**
 * How good an opening hand looks (used to decide mulligans). powerLevel 1-5
 * (default 3) scales keep quality: low levels keep loose hands, high levels
 * insist on enough mana sources to curve out.
 */
function openingHandKeepable(hand, powerLevel) {
  var level = powerLevel == null ? 3 : powerLevel;
  var sources = hand.lands + hand.ramp + hand.explosive;
  if (level <= 1) return hand.lands >= 1 && hand.lands <= 6;
  if (level === 2) return hand.lands >= 2 && hand.lands <= 6;
  if (level === 3) return hand.lands >= 2 && hand.lands <= 5;
  if (level === 4) return hand.lands >= 2 && hand.lands <= 5 && sources >= 3;
  return hand.lands <= 5 && (hand.lands >= 3 || (hand.lands === 2 && sources >= 3));
}

/**
 * Chooses the least useful card in hand to put on the bottom during a
 * London mulligan. Returns {category, typedIndex}.
 */
function chooseMulliganBottom(opp) {
  var hand = opp.hand;
  var landsAndRamp = hand.lands + hand.ramp + hand.explosive;
  if (hand.lands > 4) return { category: "lands" };
  // Prefer bottoming the most expensive typed spell.
  if (opp.typedHand.length > 0 && (landsAndRamp >= 3 || hand.lands >= 3)) {
    var worst = 0;
    for (var i = 1; i < opp.typedHand.length; i++) {
      if ((opp.typedHand[i].cost || 0) > (opp.typedHand[worst].cost || 0)) worst = i;
    }
    return { category: "other", typedIndex: worst };
  }
  if (hand.ramp > 1) return { category: "ramp" };
  if (opp.typedHand.length > 0) return { category: "other", typedIndex: 0 };
  if (hand.lands > 2) return { category: "lands" };
  if (hand.ramp > 0) return { category: "ramp" };
  if (hand.explosive > 0) return { category: "explosive" };
  return { category: "lands" };
}

/**
 * London mulligan for an opponent whose library/typed pile are populated.
 * Draws 7. While the hand is unkeepable (and fewer than maxMulligans taken):
 * shuffle the hand back, draw 7 again. Multiplayer rule: the first
 * mulligan is free, so afterwards (mulligans - 1) cards go to the bottom.
 * Returns the number of mulligans taken.
 */
function londonMulligan(opp, maxMulligans, powerLevel) {
  var limit = maxMulligans == null ? 2 : maxMulligans;
  var i;
  for (i = 0; i < 7; i++) drawOpponentCard(opp);
  var mulligans = 0;
  while (!openingHandKeepable(opp.hand, powerLevel) && mulligans < limit) {
    mulligans++;
    for (var c = 0; c < 3; c++) {
      var cat = DECK_CATEGORIES[c];
      opp.deck[cat] += opp.hand[cat];
      opp.hand[cat] = 0;
    }
    while (opp.typedHand.length) {
      opp.otherDeck.push(opp.typedHand.pop().ref);
      opp.deck.other++;
    }
    opp.hand.other = 0;
    opp.otherDeck = fisherYatesShuffle(opp.otherDeck);
    for (i = 0; i < 7; i++) drawOpponentCard(opp);
  }
  var toBottom = Math.max(0, mulligans - 1);
  for (var b = 0; b < toBottom; b++) {
    var pick = chooseMulliganBottom(opp);
    returnHandCardToLibrary(opp, pick.category, pick.typedIndex);
  }
  opp.mulligans = mulligans;
  return mulligans;
}

/**
 * Legacy count-only mulligan kept for callers that pass bare deck/hand
 * objects. Same London rule (first mulligan free), but cannot keep typed
 * cards — prefer londonMulligan(opp).
 */
function mulliganLogic(deck, hand) {
  var mulligans = 0;
  for (var d = 0; d < 7 && (hand.lands + hand.ramp + hand.explosive + hand.other) < 7; d++) drawCard(deck, hand);
  while (!openingHandKeepable(hand) && mulligans < 2) {
    mulligans++;
    for (var k = 0; k < DECK_CATEGORIES.length; k++) {
      deck[DECK_CATEGORIES[k]] += hand[DECK_CATEGORIES[k]];
      hand[DECK_CATEGORIES[k]] = 0;
    }
    for (var i = 0; i < 7; i++) drawCard(deck, hand);
  }
  for (var m = 0; m < mulligans - 1; m++) {
    var order = hand.lands > 4 ? ["lands", "other", "ramp", "explosive"] : ["other", "ramp", "explosive", "lands"];
    for (var b = 0; b < order.length; b++) {
      if (hand[order[b]] > 0) { hand[order[b]]--; deck[order[b]]++; break; }
    }
  }
  return mulligans;
}

/**
 * Deploys a commander from the command zone onto the battlefield.
 * Generic version — works with any commanderDef that has {p, t, kws, cost}.
 * Returns the new commander token, or null if it cannot be cast.
 * (Callers that only test truthiness keep working.)
 */
function deployCommanderGeneric(opp, commanderDef) {
  var def = commanderDef || deckCommanderBase(opp);
  var cost = commanderCost(opp, def.cost);
  var mana = manaAvailable(opp);
  if (mana < cost) return null;
  for (var i = 0; i < opp.tokens.length; i++) {
    if (opp.tokens[i].kind === "commander") return null;
  }
  opp.commanderZone = false;
  opp.commanderInHand = false;
  var token = {
    name: opp.name,
    ico: opp.ico,
    kind: "commander",
    type: "Legendary Creature",
    p: def.p,
    t: def.t,
    baseP: def.p,
    baseT: def.t,
    kws: def.kws.slice(),
    baseKws: def.kws.slice(),
    effect: "Commander",
    summoningSick: true,
    owner: opp.id
  };
  opp.tokens.push(token);
  return token;
}

/** Shared part of a commander leaving the battlefield. Gear stays on the battlefield unattached. */
function detachCommanderGear(opp) {
  opp.tokens = opp.tokens.filter(function(t) { return t.kind !== "commander"; });
  opp.commanderZone = true;
  opp.looseGear = (opp.looseGear || []).concat(opp.attachedGear || []);
  opp.attachedGear = [];
  opp.gear = 0;
}

/**
 * Returns a commander to the command zone after it dies or is exiled.
 * Increments commander tax by 2 (the tax is counted per cast; recorded here
 * when it leaves, as the original model did). Equipment stays on the
 * battlefield unattached (opp.looseGear) and can be re-equipped.
 */
function returnCommanderToZone(opp) {
  detachCommanderGear(opp);
  opp.commanderInHand = false;
  opp.commanderTax = (opp.commanderTax || 0) + 2;
}

/**
 * Bounce ("return to hand"): the commander goes to its owner's hand
 * (opp.commanderInHand) WITHOUT increasing commander tax. Casting it from
 * hand costs its base cost (commanderCost). commanderZone stays true so
 * "not on the battlefield" checks keep working; commanderInHand tells the
 * two apart.
 */
function returnCommanderToHand(opp) {
  detachCommanderGear(opp);
  opp.commanderInHand = true;
}

/**
 * Calculates total mana available to an opponent.
 * Explosive sources produce 2 mana each.
 */
function manaAvailable(opp) {
  return (opp.landsInPlay || 0) + (opp.rampInPlay || 0) + ((opp.explosiveInPlay || 0) * 2);
}

/**
 * Current cost to cast a commander: base + accumulated tax for a cast from
 * the command zone, base cost only when cast from hand (after a bounce).
 * Tax model: +2 is recorded each time the commander goes back to the command
 * zone (each such return follows exactly one command-zone cast). A bounce
 * adds no tax; the next return to the zone charges the earlier zone cast.
 * baseCost defaults to the opponent's deck commander cost.
 */
function commanderCost(opp, baseCost) {
  var base = baseCost == null ? deckCommanderBase(opp).cost : baseCost;
  if (opp.commanderInHand) return base;
  return base + (opp.commanderTax || 0);
}

/**
 * Recalculates commander power/toughness and keywords from attached gear,
 * then re-applies battlefield rule modifiers (P/T rules, keyword loss) and
 * temporary pumps. commanderBase defaults to the opponent's deck baseline.
 */
function refreshCommanderGear(opp, commanderBase) {
  var base = commanderBase || deckCommanderBase(opp);
  var commander = null;
  for (var i = 0; i < opp.tokens.length; i++) {
    if (opp.tokens[i].kind === "commander") { commander = opp.tokens[i]; break; }
  }
  opp.attachedGear = opp.attachedGear || [];
  opp.gear = opp.attachedGear.length;
  if (!commander) return;
  var bonus = 0;
  var gearKws = [];
  for (var g = 0; g < opp.attachedGear.length; g++) {
    bonus += (opp.attachedGear[g].bonus || 0);
    if (opp.attachedGear[g].kw) gearKws.push(opp.attachedGear[g].kw);
  }
  commander.baseP = base.p + bonus;
  commander.baseT = base.t + bonus;
  commander.p = commander.baseP + (commander.pumpP || 0);
  commander.t = commander.baseT + (commander.pumpT || 0);
  var allKws = base.kws.slice();
  for (var k = 0; k < gearKws.length; k++) {
    if (allKws.indexOf(gearKws[k]) === -1) allKws.push(gearKws[k]);
  }
  commander.baseKws = allKws;
  commander.kws = allKws.slice();
  if (commander.pumpKws) {
    for (var pk = 0; pk < commander.pumpKws.length; pk++) {
      if (commander.kws.indexOf(commander.pumpKws[pk]) === -1) commander.kws.push(commander.pumpKws[pk]);
    }
  }
  commander.effect = opp.gear ? "Commander — " + opp.gear + " gear." : "Commander";
  if (typeof gameState !== "undefined" && gameState && typeof applyBattlefieldRuleModifiers === "function") applyBattlefieldRuleModifiers();
}

/**
 * Returns the number of cards in an opponent's hand.
 */
function opponentHandSize(opp) {
  var hand = opp.hand || {};
  return (hand.lands || 0) + (hand.ramp || 0) + (hand.explosive || 0) + (hand.other || 0);
}

/**
 * Returns the number of cards remaining in an opponent's deck.
 */
function opponentDeckSize(opp) {
  var deck = opp.deck || {};
  return (deck.lands || 0) + (deck.ramp || 0) + (deck.explosive || 0) + (deck.other || 0);
}

/**
 * Checks if an opponent is dead: life <= 0, 21+ commander damage from any
 * single source, or 10+ poison counters.
 */
function isOpponentDead(opp) {
  if (opp.life <= 0) return true;
  if ((opp.poison || 0) >= 10) return true;
  var received = opp.commanderDamageReceived || {};
  for (var source in received) {
    if (received.hasOwnProperty(source) && received[source] >= 21) return true;
  }
  return false;
}
