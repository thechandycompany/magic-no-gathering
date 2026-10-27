/* =====================================================================
   modes.js — Game mode definitions (single source of truth)

   Contains the MODES object with all mode properties used by both
   game.js (adventure engine) and commander.js (commander battle).
   ===================================================================== */

/* Working title, shown in the window title, header and setup screen.
   Defined once here; every display reads GAME_TITLE. */
var GAME_TITLE = "Magic No Gathering";
var GAME_TAGLINE = "Solo Commander Simulator";
var GAME_STAGE = "Alpha";   // release stage badge next to the title; empty hides it

/* Free, unofficial fan project (see README.md "Fan content & donations").
   FAN_CONTENT_NOTICE is the wording Wizards of the Coast's Fan Content Policy asks for.
   Leave a URL empty to hide its button. */
var FAN_CONTENT_NOTICE = GAME_TITLE + " is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.";
var DONATION_URL = "https://ko-fi.com/chandlerandrew";   // optional tips; the game stays free and nothing is unlocked
var SOURCE_URL = "https://github.com/thechandycompany/magic-no-gathering";
var FEEDBACK_EMAIL = "thechandycompany@gmail.com";   // "Feedback" link (mailto); empty hides it

var MODES = {
  vanilla: {
    id: "vanilla",
    name: "Easy Garruk",
    enemy: "Garruk, the Slayer",
    icon: "🐺",
    boardIcon: "🌲",
    boardTitle: "Garruk's Battlefield",
    resource: "Loyalty",
    startResource: 20,
    life: 40,
    category: "adventure",
    summary: "The baseline hunt: 2/2 Wolves, steady +2 loyalty, and cautious removal after Garruk builds a pack."
  },
  hard: {
    id: "hard",
    name: "Hard Garruk",
    enemy: "Garruk, Apex Slayer",
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
    name: "Aether Conclave",
    enemy: "Vaelora, Conclave Ascendant",
    icon: "🔮",
    boardIcon: "✦",
    boardTitle: "The Aether Conclave",
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

/* Invented enemy/mode names from the "names v2" build → current names (most
   specific first). Applied to saved logs by migrateLegacyNames() in js/engine/state.js. */
var LEGACY_TITLE_NAMES = [
  ["Ulvar, the Pack Warden", "Garruk, the Slayer"],
  ["Ulvar, Apex Warden", "Garruk, Apex Slayer"],
  ["Ulvar, the Huntmaster", "Garruk, the Slayer"],
  ["Ulvar, Apex Huntmaster", "Garruk, Apex Slayer"],
  ["Apex Warden", "Apex Slayer"],
  ["Pack Warden", "Slayer"],
  ["Ulvar", "Garruk"],
  ["Reckoning of the Wild", "Overrun the Weak"],
  ["Arcane Conclave", "Aether Conclave"]
];

/* Short reminder text for keywords, shown in the card detail popup (table view).
   Keys are lower-case; "Ward 2" matches "ward" and keeps its number. */
var KEYWORD_REMINDERS = {
  "trample": "Excess combat damage beyond what kills its blockers goes to the player it attacks.",
  "haste": "Can attack and tap the turn it comes under its controller's control.",
  "hexproof": "Can't be the target of spells or abilities your opponents control.",
  "first strike": "Deals combat damage before creatures without first strike.",
  "double strike": "Deals both first-strike and regular combat damage.",
  "ward": "Spells or abilities your opponents target it with are countered unless they pay the ward cost.",
  "reach": "Can block creatures with flying.",
  "flying": "Can only be blocked by creatures with flying or reach.",
  "indestructible": "Damage and \"destroy\" effects don't destroy it.",
  "deathtouch": "Any amount of damage it deals to a creature is enough to destroy it.",
  "lifelink": "Damage it deals also causes its controller to gain that much life.",
  "vigilance": "Attacking doesn't cause it to tap.",
  "menace": "Can't be blocked except by two or more creatures."
};
