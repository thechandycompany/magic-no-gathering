/* =====================================================================
   index.js — Deck registry

   Provides a central registry of all available commander deck definitions.
   Load this file AFTER all individual deck files (e.g., gruul-voltron.js).
   ===================================================================== */

var DECK_REGISTRY = [GRUUL_VOLTRON];

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
