/* =====================================================================
   gruul-voltron.js — Gruul Voltron deck definition

   Contains:
   - GRUUL_VOLTRON: the complete deck object including commander, cards,
     composition, strategies, CPU identities, and win condition
   ===================================================================== */

var GRUUL_VOLTRON = (function() {

  /* --- Commander definition --- */
  var commander = {
    name: "Rukha, Wildheart Vanguard",
    ico: "🪓",
    p: 4,
    t: 4,
    type: "Legendary Creature — Human Warrior",
    kws: ["Trample"],
    effect: "Commander — grows through gear and deals commander damage when combat damage reaches you.",
    cost: 5
  };

  /* --- Card pools (the detailed version from game.js) --- */
  var cards = {
    // 14 creatures: mostly mana dorks and small utility bodies.
    creatures: [
      {name: "Llanowar Emissary", ico: "🌱", p: 1, t: 1, cost: 1, kind: "dork", effect: "Adds one mana on future turns.", rampValue: 1},
      {name: "Fyndhorn Scout", ico: "🌿", p: 1, t: 1, cost: 1, kind: "dork", effect: "Adds one mana on future turns.", rampValue: 1},
      {name: "Arbor Channeler", ico: "🌳", p: 0, t: 3, cost: 2, kind: "dork", effect: "Adds one mana on future turns.", rampValue: 1},
      {name: "Bloodfern Cultivator", ico: "🌺", p: 1, t: 3, cost: 2, kind: "dork", effect: "Adds one mana on future turns.", rampValue: 1},
      {name: "Sylvan Reclaimer", ico: "🍃", p: 1, t: 2, cost: 2, kind: "utility", effect: "When this enters, search your library for a land and put it into your hand."},
      {name: "Ironwood Shaman", ico: "🔨", p: 1, t: 3, cost: 3, kind: "utility", effect: "When this enters, search your library for an Equipment and put it into your hand."},
      {name: "Rootcoil Serpent", ico: "🐍", p: 1, t: 4, cost: 3, kind: "utility", effect: "Hexproof.", kws: ["Hexproof"]},
      {name: "Stampede Elder", ico: "🦬", p: 2, t: 3, cost: 4, kind: "utility", effect: "Other creatures get +1/+0."},
      {name: "Trailguide Ranger", ico: "🏹", p: 2, t: 1, cost: 2, kind: "utility", effect: "Haste.", kws: ["Haste"], haste: true},
      {name: "Wildspark Elemental", ico: "⚡", p: 2, t: 1, cost: 2, kind: "utility", effect: "Haste.", kws: ["Haste"], haste: true},
      {name: "Territorial Gorger", ico: "🐗", p: 2, t: 2, cost: 3, kind: "utility", effect: "No abilities.", kws: []},
      {name: "Thornhide Brute", ico: "🦏", p: 2, t: 3, cost: 3, kind: "utility", effect: "No abilities.", kws: []},
      {name: "Primal Hydra", ico: "🐉", p: 2, t: 2, cost: 4, kind: "utility", effect: "At the beginning of your upkeep, put a +1/+1 counter on this creature.", kws: []},
      {name: "Grove Guardian", ico: "🌲", p: 1, t: 5, cost: 4, kind: "utility", effect: "Reach.", kws: ["Reach"]}
    ],
    // 12 equipment/aura — the gear pipeline for Rukha
    gear: [
      {name: "Bonesaw Cleaver", cost: 2, equip: 1, bonus: 2, effect: "+2/+2", kw: null},
      {name: "Wildwood Mantle", cost: 2, equip: 2, bonus: 2, effect: "+2/+2, trample", kw: "Trample"},
      {name: "Stonefist Gauntlet", cost: 2, equip: 1, bonus: 2, effect: "+2/+1, first strike", kw: "First Strike"},
      {name: "Ironbark Shield", cost: 3, equip: 2, bonus: 2, effect: "+1/+3, ward 2", kw: "Ward 2"},
      {name: "Fang of the Wilds", cost: 3, equip: 2, bonus: 2, effect: "+2/+2", kw: null},
      {name: "Savagecrown Helm", cost: 3, equip: 3, bonus: 3, effect: "+3/+3, trample", kw: "Trample"},
      {name: "Primal Aegis", cost: 4, equip: 3, bonus: 2, effect: "+2/+2, hexproof", kw: "Hexproof"},
      {name: "Bloodforged Plate", cost: 4, equip: 2, bonus: 3, effect: "+3/+3", kw: null},
      {name: "Runic Greatsword", cost: 5, equip: 3, bonus: 3, effect: "+3/+2, trample", kw: "Trample"},
      {name: "Vanguard's Armor", cost: 3, equip: 2, bonus: 2, effect: "+2/+2, indestructible", kw: "Indestructible"},
      {name: "Heartwood Cloak", cost: 2, equip: 2, bonus: 2, effect: "+2/+2, hexproof", kw: "Hexproof"},
      {name: "Wraithbane Edge", cost: 4, equip: 3, bonus: 2, effect: "+2/+1, deathtouch", kw: "Deathtouch"}
    ],
    // 10 protection/interaction instants
    protection: [
      {name: "Blossoming Defense", cost: 1, effect: "Target creature gets +2/+2 and hexproof until end of turn."},
      {name: "Vines of Vastwood", cost: 1, effect: "Target creature can't be the target of spells this turn. Kicked: +4/+4."},
      {name: "Heroic Intervention", cost: 2, effect: "Your permanents gain hexproof and indestructible until end of turn."},
      {name: "Tamiyo's Safekeeping", cost: 1, effect: "Target permanent gains hexproof and indestructible until end of turn."},
      {name: "Wild Ricochet", cost: 4, effect: "Copy target instant or sorcery; you may choose new targets."},
      {name: "Beast Within", cost: 3, effect: "Destroy target permanent. Its controller creates a 3/3 Beast."},
      {name: "Ram Through", cost: 2, effect: "Target creature you control deals damage equal to its power to target creature you don't control."},
      {name: "Chaos Warp", cost: 3, effect: "Shuffle target permanent into its owner's library; reveal top card."},
      {name: "Return to Nature", cost: 2, effect: "Destroy target artifact or enchantment."},
      {name: "Bolt Bend", cost: 4, effect: "Change the target of target spell or ability with a single target."}
    ],
    // 5 card draw / advantage
    draw: [
      {name: "Hunter's Insight", cost: 3, effect: "Draw cards equal to combat damage dealt by target creature.", draw: {mode: "power", max: 4}},
      {name: "Rishkar's Expertise", cost: 6, effect: "Draw cards equal to greatest power among creatures you control; cast a free spell.", draw: {mode: "power", max: 5}},
      {name: "Return of the Wildspeaker", cost: 5, effect: "Draw cards equal to greatest power, or creatures get +3/+3.", draw: {mode: "power", max: 5}},
      {name: "Harmonize", cost: 4, effect: "Draw three cards.", draw: {mode: "fixed", count: 3}},
      {name: "Greater Good", cost: 4, effect: "Sacrifice a creature: draw cards equal to its power, then discard 3.", draw: {mode: "sacrifice", discard: 3}}
    ],
    // 4 haymakers / board control
    haymakers: [
      {name: "Overwhelming Stampede", cost: 5, effect: "All your creatures get +X/+X and trample until end of turn, where X is the greatest power among them.", haymaker: "pumpTeam"},
      {name: "Blasphemous Act", cost: 9, effect: "Deal 13 damage to each creature. Costs 1 less for each creature on the battlefield.", scaleCost: true, haymaker: "damageEach", damage: 13},
      {name: "Chain Reaction", cost: 4, effect: "Deal damage to each creature equal to the number of creatures on the battlefield.", haymaker: "damageEach", damage: "creatureCount"},
      {name: "Chandra's Ignition", cost: 5, effect: "Target creature you control deals damage equal to its power to each other creature and each opponent.", haymaker: "ignition"}
    ],
    // 6 misc utility (card selection, recursion, value engines)
    utility: [
      {name: "Eternal Witness", cost: 3, effect: "When this enters, return a card from your graveyard to your hand.", isCreature: true, p: 2, t: 1, regrowth: true},
      {name: "Regrowth", cost: 2, effect: "Return target card from your graveyard to your hand.", regrowth: true},
      {name: "Reckless Impulse", cost: 2, effect: "Exile the top two cards; you may play them this turn.", draw: {mode: "fixed", count: 1}},
      {name: "Outpost Siege", cost: 4, effect: "At the beginning of your upkeep, exile top card; you may play it this turn."},
      {name: "Lifecrafter's Bestiary", cost: 3, effect: "At upkeep, scry 1. Whenever you cast a creature, draw a card."},
      {name: "Skullclamp", cost: 1, effect: "Equipped creature gets +1/-1. When it dies, draw two cards."}
    ],
    // 2 board wipes (from commander.js multiplayer extension)
    boardwipes: [
      {name: "Wrath of the Wilds", cost: 6, effect: "Destroy all creatures. They can't be regenerated.", wipeType: "symmetric"},
      {name: "Savage Decree", cost: 8, effect: "Destroy all creatures target player controls.", wipeType: "targeted"}
    ]
  };

  /* --- Deck composition (card counts by category) --- */
  // Library = 37 lands + 10 ramp + 1 explosive + 51 typed "other" = 99 cards
  // (plus the commander = 100). Counts beyond a pool's size wrap around.
  var libraryCounts = {lands: 37, ramp: 10, explosive: 1};
  // Base composition (51 "other" cards for solo adventure mode)
  var deckCompositionBase = {creatures: 14, gear: 12, protection: 10, draw: 5, haymakers: 4, utility: 6};
  // Multiplayer composition (51 "other" cards — adds 2 boardwipes, so one
  // protection spell (Bolt Bend) and one utility card (Skullclamp) are cut)
  var deckComposition = {creatures: 14, gear: 12, protection: 9, draw: 5, haymakers: 4, utility: 5, boardwipes: 2};

  /* --- CPU identities for multiplayer --- */
  var cpuNames = [
    {name: "Rukha, Wildheart Vanguard", ico: "🪓", color: "#c0392b"},
    {name: "Kolvarn, Stonefist Chieftain", ico: "🪨", color: "#8e44ad"},
    {name: "Thyra, Ember Sovereign", ico: "🔥", color: "#d35400"},
    {name: "Grendol, Tuskbreaker", ico: "🐗", color: "#27ae60"}
  ];

  /* --- Modeled ramp creature cast from a generic "ramp" hand card --- */
  var fallbackRampCreature = {name: "Wilds Guide", ico: "🌿", type: "Creature — Shaman", p: 2, t: 2, effect: "Taps for mana.", rampValue: 1};

  /* --- Commander base stats (shared by all CPU variants) --- */
  var commanderBase = {p: 4, t: 4, kws: ["Trample"], cost: 5};

  /* --- Hand size limit --- */
  var maxCpuHandSize = 7;

  /* --- Targeting strategies --- */
  var strategies = {
    LAST_HITTER: "lastHitter",
    MOST_DAMAGE: "mostDamage",
    GRUDGE: "grudge",
    THREAT: "threat",
    VULNERABLE: "vulnerable",
    GANG_UP: "gangUp"
  };

  var strategyLabels = {};
  strategyLabels[strategies.LAST_HITTER] = "Retaliate against the last attacker";
  strategyLabels[strategies.MOST_DAMAGE] = "Retaliate against the most damage";
  strategyLabels[strategies.GRUDGE] = "Long-standing grudge";
  strategyLabels[strategies.THREAT] = "Largest threat";
  strategyLabels[strategies.VULNERABLE] = "Most vulnerable player";
  strategyLabels[strategies.GANG_UP] = "Focus the weakest player";

  /* --- Public deck object --- */
  return {
    id: "gruul-voltron",
    name: "Gruul Voltron",
    commander: commander,
    color: "#c0392b",
    summary: "A Commander-style rival ramps, casts Rukha from the command zone, suits her up, and threatens a 21 commander-damage defeat.",
    winCondition: {type: "commanderDamage", threshold: 21},
    cards: cards,
    deckCompositionBase: deckCompositionBase,
    deckComposition: deckComposition,
    libraryCounts: libraryCounts,
    fallbackRampCreature: fallbackRampCreature,
    cpuNames: cpuNames,
    commanderBase: commanderBase,
    maxCpuHandSize: maxCpuHandSize,
    strategies: strategies,
    strategyLabels: strategyLabels
  };
})();
