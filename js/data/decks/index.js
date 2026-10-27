/* =====================================================================
   index.js — Deck registry

   Provides a central registry of all available commander deck definitions.
   Load this file AFTER all individual deck files (e.g., gruul-voltron.js).
   Deck ids / file names / GRUUL_VOLTRON-style identifiers are internal and
   kept for save compatibility; display names live in each deck's `name`.
   ===================================================================== */

var DECK_REGISTRY = [GRUUL_VOLTRON, BOROS_TOKENS];

function getDeck(id) {
  return DECK_REGISTRY.find(function(d) { return d.id === id; }) || DECK_REGISTRY[0];
}

function listDecks() {
  return DECK_REGISTRY;
}

/* --- Backward-compatible globals ---
   The original code referenced these as top-level constants.
   They now live inside deck definitions but are exposed here
   so existing code continues to work without modification. */
var VOLTRON_CARDS = GRUUL_VOLTRON.cards;
var VOLTRON_DECK_COMPOSITION = GRUUL_VOLTRON.deckCompositionBase;
var DECK_COMPOSITION = GRUUL_VOLTRON.deckComposition;
var VOLTRON_COMMANDER = GRUUL_VOLTRON.commander;
var COMMANDER_BASE = GRUUL_VOLTRON.commanderBase;
var CPU_NAMES = GRUUL_VOLTRON.cpuNames;
var MAX_CPU_HAND_SIZE = GRUUL_VOLTRON.maxCpuHandSize;
var STRATEGIES = GRUUL_VOLTRON.strategies;
var STRATEGY_LABELS = GRUUL_VOLTRON.strategyLabels;
var FALLBACK_RAMP_CREATURE = GRUUL_VOLTRON.fallbackRampCreature;
var LIBRARY_COUNTS = GRUUL_VOLTRON.libraryCounts;

/* --- Pre-rename display names → current names ---
   Saves made before the rename hold the old names in typedHand, graveyard,
   exile, tokens, stored results and the log. migrateLegacyNames()
   (js/engine/state.js) rewrites them on load. Internal only. */
var LEGACY_CARD_NAMES = [
  ["Llanowar Emissary", "Mossborn Emissary"],
  ["Fyndhorn Scout", "Thicketborn Scout"],
  ["Territorial Gorger", "Ridgeback Gorger"],
  ["Primal Hydra", "Mossback Hydra"],
  ["Grove Guardian", "Canopy Sentinel"],
  ["Blossoming Defense", "Bloomshield Ward"],
  ["Vines of Vastwood", "Tanglevine Veil"],
  ["Heroic Intervention", "Wildheart Rally"],
  ["Tamiyo's Safekeeping", "Warden's Keeping"],
  ["Wild Ricochet", "Ricochet Spark"],
  ["Beast Within", "Feral Unmaking"],
  ["Ram Through", "Gore Through"],
  ["Chaos Warp", "Riftchurn"],
  ["Return to Nature", "Rot to Root"],
  ["Bolt Bend", "Arc Deflection"],
  ["Hunter's Insight", "Tracker's Insight"],
  ["Rishkar's Expertise", "Grovewise Bounty"],
  ["Return of the Wildspeaker", "Call of the Pack Elder"],
  ["Harmonize", "Elderbark Counsel"],
  ["Greater Good", "Feral Offering"],
  ["Overwhelming Stampede", "Thunderhoof Stampede"],
  ["Blasphemous Act", "Cinderstorm Rite"],
  ["Chain Reaction", "Cascading Sparks"],
  ["Chandra's Ignition", "Wildfire Conduit"],
  ["Eternal Witness", "Rootbound Remembrancer"],
  ["Regrowth", "Loamcall Recovery"],
  ["Reckless Impulse", "Brash Gamble"],
  ["Outpost Siege", "Frontier Watchpost"],
  ["Lifecrafter's Bestiary", "Beastkeeper's Codex"],
  ["Skullclamp", "Bonelatch Clamp"],
  ["Wrath of the Wilds", "Ruin of the Wilds"],
  ["Gruul Voltron", "Wildheart Armory"],
  ["Boros Tokens", "Dawnmarch Legion"]
];
