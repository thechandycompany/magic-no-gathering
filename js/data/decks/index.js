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

/* --- Invented names from the short-lived "names v2" build → current card names ---
   Saves from that build hold the invented names in typedHand, graveyard,
   exile, tokens, stored results and the log. migrateLegacyNames()
   (js/engine/state.js) rewrites them on load. Internal only. */
var LEGACY_CARD_NAMES = [
  ["Mossborn Emissary", "Llanowar Emissary"],
  ["Thicketborn Scout", "Fyndhorn Scout"],
  ["Ridgeback Gorger", "Territorial Gorger"],
  ["Mossback Hydra", "Primal Hydra"],
  ["Canopy Sentinel", "Grove Guardian"],
  ["Bloomshield Ward", "Blossoming Defense"],
  ["Tanglevine Veil", "Vines of Vastwood"],
  ["Wildheart Rally", "Heroic Intervention"],
  ["Warden's Keeping", "Tamiyo's Safekeeping"],
  ["Ricochet Spark", "Wild Ricochet"],
  ["Feral Unmaking", "Beast Within"],
  ["Gore Through", "Ram Through"],
  ["Riftchurn", "Chaos Warp"],
  ["Rot to Root", "Return to Nature"],
  ["Arc Deflection", "Bolt Bend"],
  ["Tracker's Insight", "Hunter's Insight"],
  ["Grovewise Bounty", "Rishkar's Expertise"],
  ["Call of the Pack Elder", "Return of the Wildspeaker"],
  ["Elderbark Counsel", "Harmonize"],
  ["Feral Offering", "Greater Good"],
  ["Thunderhoof Stampede", "Overwhelming Stampede"],
  ["Cinderstorm Rite", "Blasphemous Act"],
  ["Cascading Sparks", "Chain Reaction"],
  ["Wildfire Conduit", "Chandra's Ignition"],
  ["Rootbound Remembrancer", "Eternal Witness"],
  ["Loamcall Recovery", "Regrowth"],
  ["Brash Gamble", "Reckless Impulse"],
  ["Frontier Watchpost", "Outpost Siege"],
  ["Beastkeeper's Codex", "Lifecrafter's Bestiary"],
  ["Bonelatch Clamp", "Skullclamp"],
  ["Ruin of the Wilds", "Wrath of the Wilds"],
  ["Wildheart Armory", "Gruul Voltron"],
  ["Dawnmarch Legion", "Boros Tokens"]
];
