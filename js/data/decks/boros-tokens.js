/* =====================================================================
   boros-tokens.js — "Boros Tokens" deck definition (go-wide CPU archetype;
   file name / id / BOROS_TOKENS identifier kept for save compatibility)

   Contains:
   - BOROS_TOKENS: commander, card pools, composition, CPU identities,
     win condition and AI hooks for a red/white "go wide" rival.

   Plan: develop mana, cast Ysolde early (she makes a 1/1 Soldier at the
   beginning of every combat), cast a token maker every turn, then swing
   wide with the team. An anthem haymaker (+2/+1 and haste until end of
   turn) is saved for a lethal or big-swing turn. Wins mostly through the
   life total, not commander damage.

   All card names are original to this game.

   Card flags read by the engine (js/engine/ai-commander.js):
     makesTokens {name, ico, p, t, count | perCreature/min/max, haste}
                       creature ETB / sorcery: create creature tokens
     permanent {effect, types, ...}  stays on the battlefield:
                       upkeepToken (tokens), anthem (p, t), creatureDraw, upkeepCard
     haymaker "anthem" (pumpP, pumpT, minSwing)  team pump + haste this turn
     protect / wipeProtect / removal (+removalInstruction) / ruleRemoval
     draw {mode: "fixed" | "creatures", count | max}
   ===================================================================== */

var BOROS_TOKENS = (function() {

  var soldier = {name: "Soldier", ico: "🪖", p: 1, t: 1};
  function soldiers(count, extra) {
    var spec = {name: soldier.name, ico: soldier.ico, p: soldier.p, t: soldier.t, count: count};
    for (var key in (extra || {})) if (extra.hasOwnProperty(key)) spec[key] = extra[key];
    return spec;
  }

  /* --- Commander definition --- */
  var commander = {
    name: "Ysolde, Dawnmarch Captain",
    ico: "🛡️",
    p: 3,
    t: 3,
    type: "Legendary Creature — Human Soldier",
    kws: [],
    effect: "At the beginning of combat on your turn, create a 1/1 white Soldier creature token.",
    cost: 5
  };

  /* --- Card pools --- */
  var cards = {
    // 16 creatures: 2 mana creatures, 8 token makers, 6 attackers/blockers.
    creatures: [
      {name: "Brightmarch Quartermaster", ico: "🧺", p: 1, t: 1, cost: 1, kind: "dork", effect: "Adds one mana on future turns.", rampValue: 1},
      {name: "Dawnforge Smith", ico: "⚒️", p: 0, t: 3, cost: 2, kind: "dork", effect: "Adds one mana on future turns.", rampValue: 1},
      {name: "Banneret Recruiter", ico: "🚩", p: 2, t: 2, cost: 2, kind: "utility", effect: "When this enters, create a 1/1 Soldier token.", makesTokens: soldiers(1)},
      {name: "Cinderhorn Drummer", ico: "🥁", p: 2, t: 1, cost: 2, kind: "utility", effect: "Haste. When this enters, create a 1/1 Soldier token with haste.", kws: ["Haste"], haste: true, makesTokens: soldiers(1, {haste: true})},
      {name: "Hearthguard Sergeant", ico: "🎖️", p: 2, t: 2, cost: 3, kind: "utility", effect: "When this enters, create two 1/1 Soldier tokens.", makesTokens: soldiers(2)},
      {name: "Gatehouse Drillmaster", ico: "📯", p: 1, t: 3, cost: 3, kind: "utility", effect: "When this enters, create two 1/1 Soldier tokens.", makesTokens: soldiers(2)},
      {name: "Muster Captain Orrin", ico: "⚔️", p: 3, t: 3, cost: 4, kind: "utility", effect: "When this enters, create two 1/1 Soldier tokens.", makesTokens: soldiers(2)},
      {name: "Emberwake Herald", ico: "🔥", p: 3, t: 2, cost: 4, kind: "utility", effect: "When this enters, create a 1/1 Soldier token for each creature you control (2 to 4).", makesTokens: soldiers(2, {perCreature: true, min: 2, max: 4})},
      {name: "Legion Quartermistress", ico: "🏰", p: 2, t: 3, cost: 5, kind: "utility", effect: "When this enters, create three 1/1 Soldier tokens.", makesTokens: soldiers(3)},
      {name: "Sunspire Paladin", ico: "🌅", p: 3, t: 3, cost: 5, kind: "utility", effect: "First strike. When this enters, create two 1/1 Soldier tokens.", kws: ["First Strike"], makesTokens: soldiers(2)},
      {name: "Ashfield Lancer", ico: "🐎", p: 2, t: 1, cost: 2, kind: "utility", effect: "First strike.", kws: ["First Strike"]},
      {name: "Brightsteel Warden", ico: "🛡", p: 2, t: 4, cost: 3, kind: "utility", effect: "Vigilance.", kws: ["Vigilance"]},
      {name: "Pyreborn Charger", ico: "🐗", p: 3, t: 1, cost: 3, kind: "utility", effect: "Haste.", kws: ["Haste"], haste: true},
      {name: "Ironbanner Knight", ico: "🗡️", p: 3, t: 2, cost: 3, kind: "utility", effect: "No abilities.", kws: []},
      {name: "Rampart Colossus", ico: "🗿", p: 4, t: 5, cost: 6, kind: "utility", effect: "Vigilance.", kws: ["Vigilance"]},
      {name: "Cindermane Griffin", ico: "🦅", p: 3, t: 3, cost: 4, kind: "utility", effect: "Haste.", kws: ["Haste"], haste: true}
    ],
    // 8 token sorceries
    tokenSpells: [
      {name: "Banner Call", ico: "📣", cost: 2, effect: "Create two 1/1 Soldier tokens.", makesTokens: soldiers(2)},
      {name: "Twin Pennants", ico: "🎏", cost: 3, effect: "Create two 1/1 Soldier tokens.", makesTokens: soldiers(2)},
      {name: "Sound the Muster", ico: "📯", cost: 3, effect: "Create two 1/1 Soldier tokens.", makesTokens: soldiers(2)},
      {name: "Forge of Recruits", ico: "🔨", cost: 4, effect: "Create three 1/1 Soldier tokens.", makesTokens: soldiers(3)},
      {name: "Muster the Lines", ico: "🏳️", cost: 4, effect: "Create three 1/1 Soldier tokens.", makesTokens: soldiers(3)},
      {name: "Ranks Unbroken", ico: "🧱", cost: 4, effect: "Create a 1/1 Soldier token for each creature you control (2 to 5).", makesTokens: soldiers(2, {perCreature: true, min: 2, max: 5})},
      {name: "Dawnbreak Levy", ico: "🌄", cost: 5, effect: "Create four 1/1 Soldier tokens.", makesTokens: soldiers(4)},
      {name: "Emberline Conscription", ico: "🔥", cost: 6, effect: "Create four 1/1 Soldier tokens with haste.", makesTokens: soldiers(4, {haste: true})}
    ],
    // 9 protection / interaction instants
    protection: [
      {name: "Shieldwall Prayer", cost: 2, effect: "Your permanents gain indestructible until end of turn.", protect: true, wipeProtect: true},
      {name: "Aegis of Dawn", cost: 1, effect: "Target creature gains hexproof and indestructible until end of turn.", protect: true},
      {name: "Brightward Blessing", cost: 1, effect: "Target creature gets +2/+2 and hexproof until end of turn.", protect: true},
      {name: "Sentinel's Oath", cost: 2, effect: "Target creature you control gains protection from the color of your choice until end of turn.", protect: true},
      {name: "Dawnspear Verdict", cost: 2, effect: "Exile target creature or planeswalker.", removal: true, removalInstruction: "Exile {target}."},
      {name: "Cinderbrand Judgment", cost: 3, effect: "Exile target nonland permanent.", removal: true, ruleRemoval: "any", removalInstruction: "Exile {target}."},
      {name: "Shatter the Edict", cost: 2, effect: "Destroy target artifact or enchantment.", ruleRemoval: "artifactEnchantment"},
      {name: "Valor's Riposte", cost: 2, effect: "Target creature you control deals damage equal to its power to target creature you don't control."},
      {name: "Redirected Flame", cost: 3, effect: "Change the target of target spell or ability with a single target."}
    ],
    // 5 card draw
    draw: [
      {name: "Field Dispatches", cost: 4, effect: "Draw three cards.", draw: {mode: "fixed", count: 3}},
      {name: "Council of Captains", cost: 4, effect: "Draw a card for each creature you control (up to 4).", draw: {mode: "creatures", max: 4}},
      {name: "Embers of Memory", cost: 3, effect: "Draw two cards.", draw: {mode: "fixed", count: 2}},
      {name: "Strategist's Insight", cost: 3, effect: "Draw a card for each creature you control (up to 3).", draw: {mode: "creatures", max: 3}},
      {name: "Spoils of the March", cost: 5, effect: "Draw a card for each creature you control (up to 5).", draw: {mode: "creatures", max: 5}}
    ],
    // 3 anthem haymakers
    haymakers: [
      {name: "Dawnbreak Charge", cost: 4, effect: "Creatures you control get +2/+1 and gain haste until end of turn.", haymaker: "anthem", pumpP: 2, pumpT: 1},
      {name: "Triumph of the Legion", cost: 5, effect: "Creatures you control get +2/+1 and gain haste until end of turn.", haymaker: "anthem", pumpP: 2, pumpT: 1},
      {name: "Sunfire Crescendo", cost: 6, effect: "Creatures you control get +3/+2 and gain haste until end of turn.", haymaker: "anthem", pumpP: 3, pumpT: 2}
    ],
    // 8 utility: token engines, a static anthem, value permanents, recursion
    utility: [
      {name: "Banner of the Endless Muster", ico: "🚩", cost: 3, effect: "At the beginning of your upkeep, create a 1/1 Soldier token.",
        permanent: {effect: "upkeepToken", types: ["Artifact"], tokens: soldiers(1)}},
      {name: "Barracks of the Dawn", ico: "🏯", cost: 4, effect: "At the beginning of your upkeep, create a 1/1 Soldier token.",
        permanent: {effect: "upkeepToken", types: ["Enchantment"], tokens: soldiers(1)}},
      {name: "Standard of the Dawn Legion", ico: "🎌", cost: 3, effect: "Creatures you control get +1/+1.",
        permanent: {effect: "anthem", types: ["Artifact"], p: 1, t: 1}},
      {name: "Warcry Pennant", ico: "🏴", cost: 2, effect: "Creatures you control get +1/+0.",
        permanent: {effect: "anthem", types: ["Artifact"], p: 1, t: 0}},
      {name: "Muster Roll Ledger", ico: "📜", cost: 3, effect: "Whenever you cast a creature spell, draw a card.",
        permanent: {effect: "creatureDraw", types: ["Artifact"]}},
      {name: "Watchfire Outpost", ico: "🗼", cost: 4, effect: "At the beginning of your upkeep, exile the top card of your library; you may play it this turn.",
        permanent: {effect: "upkeepCard", types: ["Enchantment"]}},
      {name: "Ashes Remembered", cost: 2, effect: "Return target card from your graveyard to your hand.", regrowth: true},
      {name: "Quick Reconnaissance", cost: 1, effect: "Look at the top two cards; put one into your hand.", draw: {mode: "fixed", count: 1}}
    ],
    // 2 board wipes
    boardwipes: [
      {name: "Dawnfire Purge", cost: 6, effect: "Destroy all creatures.", wipeType: "symmetric"},
      {name: "Judgment of the Burning Sun", cost: 7, effect: "Destroy all creatures target player controls.", wipeType: "targeted"}
    ]
  };

  /* --- Deck composition --- */
  // Library = 37 lands + 10 ramp + 1 explosive + 51 typed "other" = 99 cards
  var libraryCounts = {lands: 37, ramp: 10, explosive: 1};
  var deckComposition = {creatures: 16, tokenSpells: 8, protection: 9, draw: 5, haymakers: 3, utility: 8, boardwipes: 2};

  /* --- CPU identities (one per seat index) --- */
  var cpuNames = [
    {name: "Ysolde, Dawnmarch Captain", ico: "🛡️", color: "#e67e22"},
    {name: "Corvan, Sunforge Marshal", ico: "☀️", color: "#f1c40f"},
    {name: "Imra, Bell of the Legion", ico: "🔔", color: "#e74c3c"},
    {name: "Tavik, Ashen Standard-Bearer", ico: "🚩", color: "#d4ac0d"}
  ];

  var fallbackRampCreature = {name: "Brightmarch Squire", ico: "🧺", type: "Creature — Human", p: 1, t: 2, effect: "Taps for mana.", rampValue: 1};
  var commanderBase = {p: 3, t: 3, kws: [], cost: 5};
  var maxCpuHandSize = 7;

  /* --- Targeting strategies (shared names with every deck) --- */
  var strategies = {
    LAST_HITTER: "lastHitter", MOST_DAMAGE: "mostDamage", GRUDGE: "grudge", THREAT: "threat",
    VULNERABLE: "vulnerable", GANG_UP: "gangUp", LETHAL: "lethal", OPENING: "opening"
  };
  var strategyLabels = {};
  strategyLabels[strategies.LAST_HITTER] = "Retaliate against the last attacker";
  strategyLabels[strategies.MOST_DAMAGE] = "Retaliate against the most damage";
  strategyLabels[strategies.GRUDGE] = "Long-standing grudge";
  strategyLabels[strategies.THREAT] = "Table leader (largest threat)";
  strategyLabels[strategies.VULNERABLE] = "Most vulnerable player";
  strategyLabels[strategies.GANG_UP] = "Focus the weakest player";
  strategyLabels[strategies.LETHAL] = "Lethal attack available";
  strategyLabels[strategies.OPENING] = "Best open attack (leader already under pressure)";

  /* --- AI hooks (decide only; the engine's ctx steps change state) --- */
  var ai = {
    // Mana and Ysolde first; once she is out, a token maker every turn (or
    // more mana); then ONE secondary cast — an anthem only when it is lethal
    // or a big swing (scoreHaymaker), otherwise another token maker.
    mainPhase: function(opp, ctx) {
      if (!ctx.commander()) ctx.castCommander() || ctx.castFastMana() || ctx.castRamp();
      else if (!ctx.castThisTurn("commander")) ctx.castTokenMaker() || ctx.castFastMana() || ctx.castRamp();
      ctx.castSecondary(["wipe", "haymaker", "removalVsCpu", "tokenMaker", "creature", "spell", "fallbackRamp", "removalVsPlayer"]);
    },
    // Go wide: 1/1s attack when profitable on their own, and the whole team
    // goes when it has more attackers than the defender has blockers. Ysolde is
    // evaluated like any other creature and never "races" past the home guard.
    attackPolicy: {commanderAlwaysAttacks: false, minPower: 1, goWide: true, goWideMargin: 1, commanderRaces: false}
  };

  return {
    id: "boros-tokens",
    name: "Boros Tokens",
    archetype: "tokens",
    commander: commander,
    color: "#e67e22",
    summary: "A rallying rival floods the board with Soldier tokens and swings wide. Ysolde makes one every combat and saves an anthem for the lethal turn.",
    winCondition: {type: "life"},
    commanderTrigger: {when: "beginCombat", tokens: soldiers(1), text: "At the beginning of combat on your turn, create a 1/1 white Soldier creature token."},
    ai: ai,
    cards: cards,
    deckCompositionBase: deckComposition,
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
