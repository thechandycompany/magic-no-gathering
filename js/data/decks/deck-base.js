/* =====================================================================
   deck-base.js — Shared utilities for all commander deck AI systems

   Contains:
   - fisherYatesShuffle: proper random shuffle
   - newDeck: creates a standard 101-card virtual deck composition
   - drawCard: weighted random draw from a virtual deck
   - mulliganLogic: ensures opening hand has at least 2 lands
   - deployCommanderGeneric: shared commander deployment pattern
   - returnCommanderToZone: increment tax, clear gear
   - manaAvailable: calculate total mana from lands + ramp + explosive
   - commanderCost: base cost + accumulated tax
   - refreshCommanderGear: recalculate P/T from attached gear
   - opponentHandSize / opponentDeckSize: hand and deck counts
   - isOpponentDead: checks life and commander damage thresholds

   All functions are declared as regular named functions (not const arrows)
   so they hoist properly for script-tag loading order.
   ===================================================================== */

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

/**
 * Creates a standard virtual deck composition.
 * The deck is represented as category counts (not individual cards).
 * Total: 37 lands + 10 ramp + 1 explosive + 53 other = 101 (commander excluded).
 */
function newDeck() {
  return { lands: 37, ramp: 10, explosive: 1, other: 53 };
}

/**
 * Draws a card from a virtual deck into a hand using weighted random selection.
 * Both deck and hand are {lands, ramp, explosive, other} count objects.
 * Returns the category drawn ("lands", "ramp", "explosive", "other") or "none".
 */
function drawCard(deck, hand) {
  var total = deck.lands + deck.ramp + deck.explosive + deck.other;
  if (total <= 0) return "none";
  var roll = Math.floor(Math.random() * total);
  var keys = ["lands", "ramp", "explosive", "other"];
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
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
 * Performs mulligan logic: if hand has fewer than 2 lands, shuffle back
 * and redraw up to 2 times. After each mulligan, bottom one card.
 * Returns the number of mulligans taken.
 */
function mulliganLogic(deck, hand) {
  var mulligans = 0;
  while (hand.lands < 2 && mulligans < 2) {
    mulligans++;
    // Return hand to deck conceptually (put back counts)
    var keys = ["lands", "ramp", "explosive", "other"];
    for (var k = 0; k < keys.length; k++) {
      deck[keys[k]] += hand[keys[k]];
      hand[keys[k]] = 0;
    }
    // Draw fresh 7
    for (var i = 0; i < 7; i++) drawCard(deck, hand);
  }
  // Bottom one card per mulligan (from least valuable category)
  for (var m = 0; m < mulligans; m++) {
    var bottomOrder = ["other", "ramp", "explosive", "lands"];
    for (var b = 0; b < bottomOrder.length; b++) {
      if (hand[bottomOrder[b]] > 0) {
        hand[bottomOrder[b]]--;
        break;
      }
    }
  }
  return mulligans;
}

/**
 * Deploys a commander from the command zone onto the battlefield.
 * Generic version — works with any commanderDef that has {p, t, kws, cost}.
 * Returns true if deployed, false if cannot afford or already on field.
 */
function deployCommanderGeneric(opp, commanderDef) {
  var cost = commanderCost(opp, commanderDef.cost);
  var mana = manaAvailable(opp);
  if (mana < cost) return false;
  // Check if commander already on field
  for (var i = 0; i < opp.tokens.length; i++) {
    if (opp.tokens[i].kind === "commander") return false;
  }
  opp.commanderZone = false;
  opp.tokens.push({
    name: opp.name,
    ico: opp.ico,
    kind: "commander",
    type: "Legendary Creature",
    p: commanderDef.p,
    t: commanderDef.t,
    baseP: commanderDef.p,
    baseT: commanderDef.t,
    kws: commanderDef.kws.slice(),
    baseKws: commanderDef.kws.slice(),
    effect: "Commander",
    summoningSick: true,
    owner: opp.id
  });
  return true;
}

/**
 * Returns a commander to the command zone after it dies or is exiled.
 * Increments commander tax by 2 and clears all attached gear.
 */
function returnCommanderToZone(opp) {
  opp.tokens = opp.tokens.filter(function(t) { return t.kind !== "commander"; });
  opp.commanderZone = true;
  opp.commanderTax += 2;
  opp.gear = 0;
  opp.attachedGear = [];
}

/**
 * Calculates total mana available to an opponent.
 * Explosive sources produce 2 mana each.
 */
function manaAvailable(opp) {
  return opp.landsInPlay + opp.rampInPlay + (opp.explosiveInPlay * 2);
}

/**
 * Calculates the current cost to cast a commander (base + accumulated tax).
 */
function commanderCost(opp, baseCost) {
  return baseCost + (opp.commanderTax || 0);
}

/**
 * Recalculates commander power/toughness and keywords from attached gear.
 * Uses the provided commanderBase for baseline stats.
 */
function refreshCommanderGear(opp, commanderBase) {
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
  commander.baseP = commanderBase.p + bonus;
  commander.baseT = commanderBase.t + bonus;
  commander.p = commander.baseP;
  commander.t = commander.baseT;
  // Merge base keywords with gear keywords (deduplicated)
  var allKws = commanderBase.kws.slice();
  for (var k = 0; k < gearKws.length; k++) {
    if (allKws.indexOf(gearKws[k]) === -1) allKws.push(gearKws[k]);
  }
  commander.baseKws = allKws;
  commander.kws = allKws.slice();
  commander.effect = opp.gear ? "Commander — " + opp.gear + " gear." : "Commander";
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
 * Checks if an opponent is dead (life <= 0 or 21+ commander damage from any source).
 */
function isOpponentDead(opp) {
  if (opp.life <= 0) return true;
  var received = opp.commanderDamageReceived || {};
  for (var source in received) {
    if (received.hasOwnProperty(source) && received[source] >= 21) return true;
  }
  return false;
}
