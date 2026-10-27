/* =====================================================================
   cards-adventure.js — Adventure mode card/unit data

   Contains:
   - ABILITIES: Ulvar's ability definitions (vanilla/hard modes)
   - HORDE_UNITS: Horde mode creature pool
   - CONCLAVE_UNITS: Arcane Conclave named roster
   - SLAY_TARGETS: Ulvar's slay targeting priority list
   ===================================================================== */

var ABILITIES = {
  wolf: {
    cost: 0,
    label: "[0] Summon Wolf",
    flavor: [
      "A wolf answers the Pack Warden's call.",
      "Ulvar whistles; a lean grey wolf pads onto the field.",
      "The pack grows. A new wolf bares its teeth."
    ],
    mech: "Put a Wolf token onto the battlefield."
  },
  buff: {
    cost: +4,
    label: "[+4] Rip and Tear",
    flavor: [
      "Ulvar snarls — a wolf's fangs blacken with venom.",
      "The Pack Warden channels raw savagery into his pack.",
      "One beast swells with lethal fury."
    ],
    mech: "Target creature gets +1/+0 and gains deathtouch. Ulvar gains 4 loyalty."
  },
  slay: {
    cost: -10,
    label: "[-10] Slay",
    flavor: [
      "Ulvar hurls his axe. \"Nothing survives the hunt.\"",
      "The Pack Warden marks his prey.",
      "Steel flashes — and Ulvar drinks the fallen's strength."
    ],
    mech: "Destroy target creature. Ulvar gains loyalty equal to its toughness."
  },
  wipe: {
    cost: -25,
    label: "[-25] Reckoning of the Wild",
    flavor: [
      "Ulvar roars. The wilds themselves turn on everything he does not command.",
      "\"KNEEL.\" A wave of primal death sweeps the board.",
      "Only the Pack Warden's beasts remain standing."
    ],
    mech: "Destroy all creatures Ulvar doesn't control."
  }
};

var HORDE_UNITS = [
  {name: "Shambling Dead", ico: "🧟", p: 2, t: 2, effect: "Attacks each turn if able."},
  {name: "Carrion Runner", ico: "💀", p: 3, t: 1, effect: "Fast, expendable pressure."},
  {name: "Grave Brute", ico: "🪦", p: 4, t: 4, effect: "Heavy Horde body.", minTurn: 4},
  {name: "Plague Carrier", ico: "☣️", p: 2, t: 3, effect: "Its wave prevents life gain next turn.", minTurn: 3, lock: "Life gain is prevented until the Horde's next turn."}
];

var CONCLAVE_UNITS = [
  {id: "kael", name: "Kael, Prism Warden", ico: "🛡️", p: 2, t: 4, effect: "Bulwark Aura — other Conclave creatures get +0/+1.", auraT: 1},
  {id: "nyra", name: "Nyra, Ember Cantor", ico: "🔥", p: 3, t: 2, effect: "War Song — other Conclave creatures get +1/+0.", auraP: 1},
  {id: "orryx", name: "Orryx, Spell-Eater", ico: "🌀", p: 2, t: 3, effect: "Null Field — noncreature spells cost 2 more next turn.", lock: "Noncreature spells cost 2 more this turn."},
  {id: "thalen", name: "Thalen, Root Architect", ico: "🌿", p: 2, t: 5, effect: "Network — at 3+ Conclave creatures, the team gets +1/+1.", threshold: true},
  {id: "mirael", name: "Mirael, Veil Sovereign", ico: "🌙", p: 3, t: 4, effect: "Veil Aura — other Conclave creatures have ward 2.", ward: true},
  {id: "voss", name: "Voss, Null Apostle", ico: "🔒", p: 4, t: 3, effect: "Seal — players can't cast artifacts next turn.", lock: "Artifact spells can't be cast this turn."},
  {id: "elyra", name: "Elyra, Dawn Resonant", ico: "☀️", p: 3, t: 3, effect: "Resonance — Vaelora gains 1 resolve for each aura bearer.", healer: true},
  {id: "dravik", name: "Dravik, Rift Talon", ico: "⚡", p: 5, t: 2, effect: "Riftstrike — attacks immediately when summoned.", haste: true},
  {id: "selune", name: "Selune, Glass Oracle", ico: "🔷", p: 1, t: 4, effect: "Foresight — the next Conclave summon gets +1/+1.", foretell: true},
  {id: "kharos", name: "Kharos, Chain Arbiter", ico: "⛓️", p: 3, t: 5, effect: "Edict — at 4+ allies, players can't cast more than one spell.", thresholdLock: true}
];

var SLAY_TARGETS = [
  "your commander, if it can be targeted",
  "your highest-toughness creature",
  "your biggest threat on the battlefield",
  "your most valuable creature (best abilities)",
  "the creature that is hardest for you to replace"
];
