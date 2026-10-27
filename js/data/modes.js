/* =====================================================================
   modes.js — Game mode definitions (single source of truth)

   Contains the MODES object with all mode properties used by both
   game.js (adventure engine) and commander.js (commander battle).
   ===================================================================== */

/* Working title, shown in the window title, header and setup screen.
   Defined once here; every display reads GAME_TITLE. */
var GAME_TITLE = "Rivals at the Table";

var MODES = {
  vanilla: {
    id: "vanilla",
    name: "Easy Ulvar",
    enemy: "Ulvar, the Pack Warden",
    icon: "🐺",
    boardIcon: "🌲",
    boardTitle: "Ulvar's Battlefield",
    resource: "Loyalty",
    startResource: 20,
    life: 40,
    category: "adventure",
    summary: "The baseline hunt: 2/2 Wolves, steady +2 loyalty, and cautious removal after Ulvar builds a pack."
  },
  hard: {
    id: "hard",
    name: "Hard Ulvar",
    enemy: "Ulvar, Apex Warden",
    icon: "😤",
    boardIcon: "🔥",
    boardTitle: "The Apex Hunting Ground",
    resource: "Loyalty",
    startResource: 24,
    life: 40,
    category: "adventure",
    summary: "Escalating hunt: Wolves become 4/4 on turn 5, loyalty income grows every two turns, and emergency removal punishes board deficits."
  },
  horde: {
    id: "horde",
    name: "Horde Mode",
    enemy: "The Endless Horde",
    icon: "🧟",
    boardIcon: "☠️",
    boardTitle: "The Endless Horde",
    resource: "Horde Deck",
    startResource: 60,
    life: 40,
    category: "adventure",
    summary: "Survive automatic waves. Reveals and damage mill the Horde deck; win only when its deck and battlefield are empty."
  },
  conclave: {
    id: "conclave",
    name: "Arcane Conclave",
    enemy: "Vaelora, Conclave Ascendant",
    icon: "🔮",
    boardIcon: "✦",
    boardTitle: "The Arcane Conclave",
    resource: "Resolve",
    startResource: 32,
    life: 40,
    category: "adventure",
    summary: "A replayable roster of uniquely named creatures shares auras, unlocks thresholds, restricts spells, and empowers its leader."
  },
  voltron: {
    id: "voltron",
    name: "Commander Rival",
    deckId: "gruul-voltron", // display name appends the deck's own name (see modeDisplayName)
    enemy: "Rukha, Wildheart Vanguard",
    icon: "🪓",
    boardIcon: "🔥",
    boardTitle: "Rukha's Command Zone",
    resource: "Life",
    startResource: 40,
    life: 40,
    category: "commander",
    summary: "A Commander-style rival ramps, casts Rukha from the command zone, equips her with gear, and threatens a 21 commander-damage defeat."
  }
};

/* Pre-rename adventure enemy titles → current titles (most specific first).
   Applied to saved logs by migrateLegacyNames() in js/engine/state.js. */
var LEGACY_TITLE_NAMES = [
  ["Garruk, the Slayer", "Ulvar, the Pack Warden"],
  ["Garruk, Apex Slayer", "Ulvar, Apex Warden"],
  ["Ulvar, the Huntmaster", "Ulvar, the Pack Warden"],
  ["Ulvar, Apex Huntmaster", "Ulvar, Apex Warden"],
  ["Apex Huntmaster", "Apex Warden"],
  ["Huntmaster", "Pack Warden"],
  ["Garruk", "Ulvar"],
  ["Overrun the Weak", "Reckoning of the Wild"]
];
