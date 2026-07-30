/* =====================================================================
   GARRUK THE SLAYER — Solo Encounter Engine (v4)
   - two-phase turns
   - custom modal inputs (sandboxed iframes block native prompt/confirm)
   - undo + working restart
   ===================================================================== */
const SAVE_KEY = "magic_no_gathering_save_v1";
const LEGACY_SAVE_KEY = "garruk_slayer_save_v4";

const MODES = {
  vanilla:{
    id:"vanilla", name:"Easy Garruk", enemy:"Garruk, the Slayer", icon:"🐺", boardIcon:"🌲",
    boardTitle:"Garruk's Battlefield", resource:"Loyalty", startResource:20, life:40,
    summary:"The baseline hunt: 2/2 Wolves, steady +2 loyalty, and cautious removal after Garruk builds a pack."
  },
  hard:{
    id:"hard", name:"Hard Garruk", enemy:"Garruk, Apex Slayer", icon:"😤", boardIcon:"🔥",
    boardTitle:"The Apex Hunting Ground", resource:"Loyalty", startResource:24, life:40,
    summary:"Escalating hunt: Wolves become 4/4 on turn 5, loyalty income grows every two turns, and emergency removal punishes board deficits."
  },
  horde:{
    id:"horde", name:"Horde Mode", enemy:"The Endless Horde", icon:"🧟", boardIcon:"☠️",
    boardTitle:"The Endless Horde", resource:"Horde Deck", startResource:60, life:40,
    summary:"Survive automatic waves. Reveals and damage mill the Horde deck; win only when its deck and battlefield are empty."
  },
  conclave:{
    id:"conclave", name:"Aether Conclave", enemy:"Vaelora, Conclave Ascendant", icon:"🔮", boardIcon:"✦",
    boardTitle:"The Aether Conclave", resource:"Resolve", startResource:32, life:40,
    summary:"A replayable roster of uniquely named creatures shares auras, unlocks thresholds, restricts spells, and empowers its leader."
  },
  voltron:{
    id:"voltron", name:"Commander Rival: Gruul Voltron", enemy:"Rukha, Wildheart Vanguard", icon:"🪓", boardIcon:"🔥",
    boardTitle:"Rukha's Command Zone", resource:"Life", startResource:40, life:40,
    summary:"A Commander-style rival ramps, casts Rukha from the command zone, suits her up, and threatens a 21 commander-damage defeat."
  }
};

const ABILITIES = {
  wolf:  { cost:0, label:"[0] Summon Wolf",
    flavor:["A wolf answers the Slayer's call.","Garruk whistles; a lean grey wolf pads onto the field.","The pack grows. A new wolf bares its teeth."],
    mech:"Put a Wolf token onto the battlefield." },
  buff:  { cost:+4, label:"[+4] Rip and Tear",
    flavor:["Garruk snarls — a wolf's fangs blacken with venom.","The Slayer channels raw savagery into his pack.","One beast swells with lethal fury."],
    mech:"Target creature gets +1/+0 and gains deathtouch. Garruk gains 4 loyalty." },
  slay:  { cost:-10, label:"[-10] Slay",
    flavor:["Garruk hurls his axe. \"Nothing survives the hunt.\"","The Slayer marks his prey.","Steel flashes — and Garruk drinks the fallen's strength."],
    mech:"Destroy target creature. Garruk gains loyalty equal to its toughness." },
  wipe:  { cost:-25, label:"[-25] Overrun the Weak",
    flavor:["Garruk roars. The wilds themselves turn on everything he does not command.","\"KNEEL.\" A wave of primal death sweeps the board.","Only the Slayer's beasts remain standing."],
    mech:"Destroy all creatures Garruk doesn't control." }
};

const HORDE_UNITS = [
  {name:"Shambling Dead",ico:"🧟",p:2,t:2,effect:"Attacks each turn if able."},
  {name:"Carrion Runner",ico:"💀",p:3,t:1,effect:"Fast, expendable pressure."},
  {name:"Grave Brute",ico:"🪦",p:4,t:4,effect:"Heavy Horde body.",minTurn:4},
  {name:"Plague Carrier",ico:"☣️",p:2,t:3,effect:"Its wave prevents life gain next turn.",minTurn:3,lock:"Life gain is prevented until the Horde's next turn."}
];

const CONCLAVE_UNITS = [
  {id:"kael",name:"Kael, Prism Warden",ico:"🛡️",p:2,t:4,effect:"Bulwark Aura — other Conclave creatures get +0/+1.",auraT:1},
  {id:"nyra",name:"Nyra, Ember Cantor",ico:"🔥",p:3,t:2,effect:"War Song — other Conclave creatures get +1/+0.",auraP:1},
  {id:"orryx",name:"Orryx, Spell-Eater",ico:"🌀",p:2,t:3,effect:"Null Field — noncreature spells cost 2 more next turn.",lock:"Noncreature spells cost 2 more this turn."},
  {id:"thalen",name:"Thalen, Root Architect",ico:"🌿",p:2,t:5,effect:"Network — at 3+ Conclave creatures, the team gets +1/+1.",threshold:true},
  {id:"mirael",name:"Mirael, Veil Sovereign",ico:"🌙",p:3,t:4,effect:"Veil Aura — other Conclave creatures have ward 2.",ward:true},
  {id:"voss",name:"Voss, Null Apostle",ico:"🔒",p:4,t:3,effect:"Seal — players can't cast artifacts next turn.",lock:"Artifact spells can't be cast this turn."},
  {id:"elyra",name:"Elyra, Dawn Resonant",ico:"☀️",p:3,t:3,effect:"Resonance — Vaelora gains 1 resolve for each aura bearer.",healer:true},
  {id:"dravik",name:"Dravik, Rift Talon",ico:"⚡",p:5,t:2,effect:"Riftstrike — attacks immediately when summoned.",haste:true},
  {id:"selune",name:"Selune, Glass Oracle",ico:"🔷",p:1,t:4,effect:"Foresight — the next Conclave summon gets +1/+1.",foretell:true},
  {id:"kharos",name:"Kharos, Chain Arbiter",ico:"⛓️",p:3,t:5,effect:"Edict — at 4+ allies, players can't cast more than one spell.",thresholdLock:true}
];

const VOLTRON_COMMANDER = {
  name:"Rukha, Wildheart Vanguard", ico:"🪓", p:4, t:4,
  type:"Legendary Creature — Human Warrior", kws:["Trample"],
  effect:"Commander — grows through gear and deals commander damage when combat damage reaches you.", cost:5
};

/* =====================================================================
   VOLTRON VIRTUAL DECK — 51 "other" cards broken into typed categories
   modeled after typical Gruul Voltron Commander deck composition.
   Each entry is a template; the deck shuffles indices into these pools.
   Mana costs determine when the AI can cast them.
   ===================================================================== */
const VOLTRON_CARDS = {
  // 14 creatures: mostly mana dorks and small utility bodies.
  // Voltron decks intentionally run SMALL creatures — Rukha is the only real
  // threat. These exist to ramp, protect, or tutor, not to race the life total.
  creatures: [
    {name:"Llanowar Emissary",     ico:"🌱", p:1, t:1, cost:1, kind:"dork",    effect:"Taps for mana on future turns.", rampValue:1},
    {name:"Fyndhorn Scout",        ico:"🌿", p:1, t:1, cost:1, kind:"dork",    effect:"Taps for mana on future turns.", rampValue:1},
    {name:"Arbor Channeler",       ico:"🌳", p:0, t:3, cost:2, kind:"dork",    effect:"Taps for mana on future turns.", rampValue:1},
    {name:"Bloodfern Cultivator",  ico:"🌺", p:1, t:3, cost:2, kind:"dork",    effect:"Taps for mana on future turns.", rampValue:1},
    {name:"Sylvan Reclaimer",      ico:"🍃", p:1, t:2, cost:2, kind:"utility", effect:"Enters: search a land to hand."},
    {name:"Ironwood Shaman",       ico:"🔨", p:1, t:3, cost:3, kind:"utility", effect:"Enters: tutor an equipment to hand."},
    {name:"Rootcoil Serpent",      ico:"🐍", p:1, t:4, cost:3, kind:"utility", effect:"Hexproof. Hard to remove.", kws:["Hexproof"]},
    {name:"Stampede Elder",        ico:"🦬", p:2, t:3, cost:4, kind:"utility", effect:"Other creatures get +1/+0."},
    {name:"Trailguide Ranger",     ico:"🏹", p:2, t:1, cost:2, kind:"utility", effect:"Haste. Blocker fodder, not a real clock.", kws:["Haste"], haste:true},
    {name:"Wildspark Elemental",   ico:"⚡", p:2, t:1, cost:2, kind:"utility", effect:"Haste. Chip damage while Rukha sets up.", kws:["Haste"], haste:true},
    {name:"Territorial Gorger",    ico:"🐗", p:2, t:2, cost:3, kind:"utility", effect:"Minor secondary body.", kws:[]},
    {name:"Thornhide Brute",       ico:"🦏", p:2, t:3, cost:3, kind:"utility", effect:"Minor secondary body.", kws:[]},
    {name:"Primal Hydra",          ico:"🐉", p:2, t:2, cost:4, kind:"utility", effect:"Grows +1/+1 each upkeep, but starts small.", kws:[]},
    {name:"Grove Guardian",        ico:"🌲", p:1, t:5, cost:4, kind:"utility", effect:"Reach. A wall, not a threat.", kws:["Reach"]}
  ],
  // 12 equipment/aura — the gear pipeline for Rukha
  gear: [
    {name:"Bonesaw Cleaver",    cost:2, equip:1, bonus:2, effect:"+2/+2"},
    {name:"Wildwood Mantle",    cost:2, equip:2, bonus:2, effect:"+2/+2, trample", kw:"Trample"},
    {name:"Stonefist Gauntlet", cost:2, equip:1, bonus:2, effect:"+2/+1, first strike", kw:"First Strike"},
    {name:"Ironbark Shield",    cost:3, equip:2, bonus:2, effect:"+1/+3, ward 2", kw:"Ward 2"},
    {name:"Fang of the Wilds",  cost:3, equip:2, bonus:2, effect:"+2/+2", kw:null},
    {name:"Savagecrown Helm",   cost:3, equip:3, bonus:3, effect:"+3/+3, trample", kw:"Trample"},
    {name:"Primal Aegis",       cost:4, equip:3, bonus:2, effect:"+2/+2, hexproof", kw:"Hexproof"},
    {name:"Bloodforged Plate",  cost:4, equip:2, bonus:3, effect:"+3/+3", kw:null},
    {name:"Runic Greatsword",   cost:5, equip:3, bonus:3, effect:"+3/+2, trample", kw:"Trample"},
    {name:"Vanguard's Armor",   cost:3, equip:2, bonus:2, effect:"+2/+2, indestructible", kw:"Indestructible"},
    {name:"Heartwood Cloak",    cost:2, equip:2, bonus:2, effect:"+2/+2, hexproof", kw:"Hexproof"},
    {name:"Wraithbane Edge",    cost:4, equip:3, bonus:2, effect:"+2/+1, deathtouch", kw:"Deathtouch"}
  ],
  // 10 protection/interaction instants
  protection: [
    {name:"Blossoming Defense",  cost:1, effect:"Target creature gets +2/+2 and hexproof until end of turn."},
    {name:"Vines of Vastwood",   cost:1, effect:"Target creature can't be the target of spells this turn. Kicked: +4/+4."},
    {name:"Heroic Intervention", cost:2, effect:"Your permanents gain hexproof and indestructible until end of turn."},
    {name:"Tamiyo's Safekeeping",cost:1, effect:"Target permanent gains hexproof and indestructible until end of turn."},
    {name:"Wild Ricochet",       cost:4, effect:"Copy target instant or sorcery; you may choose new targets."},
    {name:"Beast Within",        cost:3, effect:"Destroy target permanent. Its controller creates a 3/3 Beast."},
    {name:"Ram Through",         cost:2, effect:"Target creature you control deals damage equal to its power to target creature you don't control."},
    {name:"Chaos Warp",          cost:3, effect:"Shuffle target permanent into its owner's library; reveal top card."},
    {name:"Return to Nature",    cost:2, effect:"Destroy target artifact or enchantment."},
    {name:"Bolt Bend",           cost:4, effect:"Change the target of target spell or ability with a single target."}
  ],
  // 5 card draw / advantage
  draw: [
    {name:"Hunter's Insight",  cost:3, effect:"Draw cards equal to combat damage dealt by target creature."},
    {name:"Rishkar's Expertise",cost:6, effect:"Draw cards equal to greatest power among creatures you control; cast a free spell."},
    {name:"Return of the Wildspeaker",cost:5, effect:"Draw cards equal to greatest power, or creatures get +3/+3."},
    {name:"Harmonize",         cost:4, effect:"Draw three cards."},
    {name:"Greater Good",      cost:4, effect:"Sacrifice a creature: draw cards equal to its power, then discard 3."}
  ],
  // 4 haymakers / board control
  haymakers: [
    {name:"Overwhelming Stampede", cost:5, effect:"All your creatures get +X/+X and trample where X is greatest power."},
    {name:"Blasphemous Act",       cost:9, effect:"Deal 13 damage to each creature. Costs less for each creature on field.", scaleCost:true},
    {name:"Chain Reaction",        cost:4, effect:"Deal damage to each creature equal to the number of creatures on the battlefield."},
    {name:"Chandra's Ignition",    cost:5, effect:"Target creature deals damage equal to its power to each other creature and each opponent."}
  ],
  // 6 misc utility (card selection, recursion, value engines)
  utility: [
    {name:"Eternal Witness",     cost:3, effect:"Enters: return a card from graveyard to hand.", isCreature:true, p:2, t:1},
    {name:"Regrowth",            cost:2, effect:"Return target card from your graveyard to your hand."},
    {name:"Reckless Impulse",    cost:2, effect:"Exile the top two cards; you may play them this turn."},
    {name:"Outpost Siege",       cost:4, effect:"At the beginning of your upkeep, exile top card; you may play it this turn."},
    {name:"Lifecrafter's Bestiary",cost:3, effect:"At upkeep, scry 1. Whenever you cast a creature, draw a card."},
    {name:"Skullclamp",          cost:1, effect:"Equipped creature gets +1/-1. When it dies, draw two cards."}
  ]
};

// Build the 51-card "other" deck composition by category count
const VOLTRON_DECK_COMPOSITION = {creatures:14, gear:12, protection:10, draw:5, haymakers:4, utility:6};

/**
 * Generates a shuffled array of card references for the 51 "other" slots.
 * Each entry is {category, index} pointing into VOLTRON_CARDS.
 */
function generateVoltronOtherDeck(){
  const cards=[];
  for(const [category,count] of Object.entries(VOLTRON_DECK_COMPOSITION)){
    const pool=VOLTRON_CARDS[category];
    for(let i=0;i<count;i++){
      cards.push({category, index:i%pool.length});
    }
  }
  return shuffled(cards);
}

/**
 * Resolves a card reference into its full data object.
 */
function resolveVoltronCard(ref){
  return VOLTRON_CARDS[ref.category][ref.index];
}

/* =====================================================================
   TURN PHASE / STEP SYSTEM — mirrors official MTG turn structure
   Each phase has named steps; each step (except untap/cleanup) grants
   priority, meaning instants and abilities can be used. Sorcery-speed
   actions (creatures, sorceries, lands) are only legal during main phases
   when the stack is empty and you have priority.
   ===================================================================== */
const TURN_PHASES = {
  BEGINNING: "beginning",
  PRECOMBAT_MAIN: "precombat_main",
  COMBAT: "combat",
  POSTCOMBAT_MAIN: "postcombat_main",
  ENDING: "ending"
};

const TURN_STEPS = {
  // Beginning phase
  UNTAP: "untap",
  UPKEEP: "upkeep",
  DRAW: "draw",
  // Pre-combat main phase (single step)
  PRECOMBAT_MAIN: "precombat_main",
  // Combat phase (single combined step)
  COMBAT: "combat",
  // Post-combat main phase (single step)
  POSTCOMBAT_MAIN: "postcombat_main",
  // Ending phase
  END_STEP: "end_step",
  CLEANUP: "cleanup"
};

// Ordered progression through a full player turn
const PLAYER_TURN_SEQUENCE = [
  { phase: TURN_PHASES.BEGINNING,       step: TURN_STEPS.UNTAP },
  { phase: TURN_PHASES.BEGINNING,       step: TURN_STEPS.UPKEEP },
  { phase: TURN_PHASES.BEGINNING,       step: TURN_STEPS.DRAW },
  { phase: TURN_PHASES.PRECOMBAT_MAIN,  step: TURN_STEPS.PRECOMBAT_MAIN },
  { phase: TURN_PHASES.COMBAT,          step: TURN_STEPS.COMBAT },
  { phase: TURN_PHASES.POSTCOMBAT_MAIN, step: TURN_STEPS.POSTCOMBAT_MAIN },
  { phase: TURN_PHASES.ENDING,          step: TURN_STEPS.END_STEP },
  { phase: TURN_PHASES.ENDING,          step: TURN_STEPS.CLEANUP }
];

// Steps where NO player gets priority (automatic game actions only)
const NO_PRIORITY_STEPS = new Set([TURN_STEPS.UNTAP, TURN_STEPS.CLEANUP]);

// Steps where sorcery-speed spells/abilities are legal (main phases, stack empty)
const SORCERY_SPEED_STEPS = new Set([TURN_STEPS.PRECOMBAT_MAIN, TURN_STEPS.POSTCOMBAT_MAIN]);

// Human-readable labels for the phase indicator
const STEP_LABELS = {
  [TURN_STEPS.UNTAP]: "Untap",
  [TURN_STEPS.UPKEEP]: "Upkeep",
  [TURN_STEPS.DRAW]: "Upkeep + Draw",
  [TURN_STEPS.PRECOMBAT_MAIN]: "Main Phase 1",
  [TURN_STEPS.COMBAT]: "Combat",
  [TURN_STEPS.POSTCOMBAT_MAIN]: "Main Phase 2",
  [TURN_STEPS.END_STEP]: "End Step",
  [TURN_STEPS.CLEANUP]: "Cleanup"
};

// Which phase a step belongs to (for grouping in the UI bar)
const STEP_TO_PHASE = {};
PLAYER_TURN_SEQUENCE.forEach(entry => { STEP_TO_PHASE[entry.step] = entry.phase; });

/**
 * Checks if a spell/ability can be cast at the given step.
 * @param {"instant"|"sorcery"} timing - The timing restriction of the card
 * @param {string} currentStep - The current TURN_STEPS value
 * @param {boolean} isActivePlayer - Whether the caster is the active (turn) player
 * @returns {boolean}
 */
function canCastAtTiming(timing, currentStep, isActivePlayer) {
  // Nothing can be done during untap or cleanup (no priority)
  if (NO_PRIORITY_STEPS.has(currentStep)) return false;
  // Instants (and flash) can be cast any time a player has priority
  if (timing === "instant") return true;
  // Sorcery-speed only during the active player's main phases
  if (timing === "sorcery") return isActivePlayer && SORCERY_SPEED_STEPS.has(currentStep);
  return false;
}

const SLAY_TARGETS = [
  "your commander, if it's targetable","your highest-toughness creature","your biggest threat on the battlefield",
  "your most valuable creature (best abilities)","whatever creature is hardest for you to replace"
];
function garrukSlayTarget(){ return SLAY_TARGETS[Math.floor(Math.random()*SLAY_TARGETS.length)]; }
function shuffled(values){ return values.slice().sort(()=>Math.random()-.5); }
function modeConfig(){ return MODES[S?.mode] || MODES.vanilla; }
function enemyName(){ return modeConfig().enemy; }

/* ---------- state ---------- */
function freshState(mode){
  const cfg=MODES[mode]||MODES.vanilla;
  return {
    version:1, mode:cfg.id, turn:1, phase:"garruk", loyalty:cfg.startResource, maxLoyaltySeen:cfg.startResource,
    difficulty:cfg.id, enraged:false, player:{life:cfg.life,creatures:0}, tokens:[], pendingDecl:null,
    attackPower:0, slayTarget:null, declFlavor:"", actionSteps:[], log:[], turnPowerBonus:0,
    spellLock:"", lastPlayerDamage:0, conclaveAscension:0, conclaveRoster:shuffled(CONCLAVE_UNITS.map(c=>c.id)), lastConclaveId:null,
    enemyGraveyard:[], enemyGraveyardCount:0,
    enemyExile:[], enemyExileCount:0,
    commanderDamage:0, commanderDamageToEnemy:0, commanderTax:0, commanderZone:cfg.id==="voltron", voltronMana:0, voltronGear:0,
    voltronDeck:null, voltronHand:{lands:0,ramp:0,explosive:0,other:0}, voltronBottom:{lands:0,ramp:0,explosive:0,other:0}, voltronLandsInPlay:0, voltronRampInPlay:0, voltronExplosiveInPlay:0, voltronMulligans:0,
    voltronOtherDeck:null, voltronTypedHand:[], voltronProtectionHeld:0,
    // Phase tracking for the player turn (MTG turn structure)
    playerPhase: TURN_PHASES.BEGINNING,
    playerStep: TURN_STEPS.UNTAP,
    playerStepIndex: 0
  };
}
function normalizeState(state){
  if(!state) return null;
  if(!state.mode) state.mode="vanilla";
  state.version=1;
  state.actionSteps=state.actionSteps||[]; state.tokens=state.tokens||[]; state.log=state.log||[];
  state.turnPowerBonus=state.turnPowerBonus||0; state.spellLock=state.spellLock||""; state.lastPlayerDamage=state.lastPlayerDamage||0;
  state.conclaveAscension=state.conclaveAscension||0;
  state.conclaveRoster=state.conclaveRoster||shuffled(CONCLAVE_UNITS.map(c=>c.id));
  state.commanderDamage=state.commanderDamage||0; state.commanderDamageToEnemy=state.commanderDamageToEnemy||0; state.commanderTax=state.commanderTax||0;
  state.voltronMana=state.voltronMana||0; state.voltronGear=state.voltronGear||0;
  state.voltronHand=state.voltronHand||{lands:0,ramp:0,explosive:0,other:0};
  state.voltronBottom=state.voltronBottom||{lands:0,ramp:0,explosive:0,other:0};
  state.voltronLandsInPlay=state.voltronLandsInPlay||0;
  state.voltronRampInPlay=state.voltronRampInPlay??(state.voltronRamp||0);
  state.voltronExplosiveInPlay=state.voltronExplosiveInPlay||0;
  state.voltronMulligans=state.voltronMulligans||0;
  state.voltronDeck=state.voltronDeck||null;
  state.voltronOtherDeck=state.voltronOtherDeck||null;
  state.voltronTypedHand=state.voltronTypedHand||[];
  state.voltronProtectionHeld=state.voltronProtectionHeld||0;
  state.pendingTurnInput=state.pendingTurnInput||null;
  state.enemyGraveyard=state.enemyGraveyard||[];
  state.enemyGraveyardCount=state.enemyGraveyardCount||0;
  state.enemyExile=state.enemyExile||[];
  state.enemyExileCount=state.enemyExileCount||0;
  if(state.mode==="voltron"&&state.commanderZone==null)state.commanderZone=!state.tokens.some(token=>token.kind==="commander");
  state.tokens.forEach(t=>{ if(t.baseP==null)t.baseP=t.p; if(t.baseT==null)t.baseT=t.t; });
  // Phase tracking defaults (for saves before this system existed)
  if(!state.playerPhase) state.playerPhase=TURN_PHASES.BEGINNING;
  if(!state.playerStep) state.playerStep=TURN_STEPS.UNTAP;
  if(state.playerStepIndex==null) state.playerStepIndex=0;
  // Upkeep and draw now share one confirmation. Resume older upkeep saves at that combined checkpoint.
  if(state.playerStep===TURN_STEPS.UPKEEP){
    state.playerPhase=TURN_PHASES.BEGINNING;
    state.playerStep=TURN_STEPS.DRAW;
    state.playerStepIndex=PLAYER_TURN_SEQUENCE.findIndex(entry=>entry.step===TURN_STEPS.DRAW);
  }
  return state;
}
let S=null, gameOver=false;
let undoStack=[];

/* ---------- persistence ---------- */
/* NOTE: runs inside a sandboxed iframe where localStorage can throw. Wrapped so storage failures never abort game logic. */
let memStore={};
function safeGet(k){ try{ return localStorage.getItem(k); }catch(e){ return (k in memStore)?memStore[k]:null; } }
function safeSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){ memStore[k]=v; } }
function safeRemove(k){ try{ localStorage.removeItem(k); }catch(e){ delete memStore[k]; } }
function serializeTurnInput(){
  if(!turnInput)return null;
  return {...turnInput,enemyDeaths:Array.from(turnInput.enemyDeaths||[]),blockedCreatures:Array.from(turnInput.blockedCreatures||[])};
}
function restoreTurnInput(savedInput){
  if(!savedInput||savedInput.key!==currentTurnInputKey())return null;
  const {enemyDeaths,blockedCreatures,...rest}=savedInput;
  return {...rest,enemyDeaths:new Set(Array.isArray(enemyDeaths)?enemyDeaths:[]),blockedCreatures:new Set(Array.isArray(blockedCreatures)?blockedCreatures:[])};
}
function save(){ safeSet(SAVE_KEY, JSON.stringify({...S,pendingTurnInput:serializeTurnInput()})); flashSave(); }
function load(){
  try{
    const current=safeGet(SAVE_KEY);
    if(current) return normalizeState(JSON.parse(current));
    const legacy=safeGet(LEGACY_SAVE_KEY);
    return legacy?normalizeState(JSON.parse(legacy)):null;
  }catch(e){ return null; }
}
function flashSave(){ const b=document.getElementById('saveBtn'); if(!b)return; b.textContent="Saved ✓"; setTimeout(()=>b.textContent="Save Encounter",1200); }

/* ---------- undo ---------- */
function snapshot(){ undoStack.push(JSON.stringify(S)); if(undoStack.length>25) undoStack.shift(); updateUndoBtn(); }
function updateUndoBtn(){ const b=document.getElementById('undoBtn'); if(b) b.disabled = undoStack.length===0; }
function undo(){
  if(undoStack.length===0) return;
  S=JSON.parse(undoStack.pop());
  turnInput=null;
  gameOver=false;
  document.getElementById('overlay').classList.remove('show');
  render(); renderLog();
  if(S.phase==="player") showPlayerTurn(); else showGarrukTurn();
  updateUndoBtn();
  logSys("↶ Reverted the last resolved turn.");
  save();
}

/* ---------- mutations ---------- */
function damageLoyalty(n){
  S.loyalty=Math.max(0,S.loyalty-n);
  if(S.phase==="player")S.lastPlayerDamage=n;
  checkPhase();render();
}
function gainLoyalty(n){ S.loyalty+=n; if(S.loyalty>S.maxLoyaltySeen)S.maxLoyaltySeen=S.loyalty; render(); }
function adjust(stat,d){
  if(!S){
    if(window._commanderMain&&window._commanderMain.adjust)window._commanderMain.adjust(stat,d);
    return;
  }
  S.player[stat]=Math.max(0,S.player[stat]+d); render();
}
function setStat(stat,v){ S.player[stat]=Math.max(0,v); render(); }
/* Commander life counts down from 21 as the enemy commander's combat damage
   (S.commanderDamage) accumulates — mirrors the 21 commander-damage loss rule.
   Adjusting it manually moves S.commanderDamage in the opposite direction. */
function commanderLifeRemaining(){ return Math.max(0,21-(S.commanderDamage||0)); }
function adjustCommanderLife(d){
  S.commanderDamage=Math.max(0,Math.min(21,(S.commanderDamage||0)-d));
  render();
}
function addWolf(){
  const big=S.mode==="hard" && S.turn>=5;
  const size=big?4:2;
  S.tokens.push({name:"Wolf",ico:"🐺",kind:"wolf",type:"Creature — Wolf",p:size,t:size,baseP:size,baseT:size,kws:[],effect:big?"Apex Wolf":"",summoningSick:true});
  render();
}
function voltronCommanderIndex(){return S.tokens.findIndex(token=>token.kind==="commander");}
function voltronCommander(){const index=voltronCommanderIndex();return index===-1?null:S.tokens[index];}
function voltronCommanderCost(){return VOLTRON_COMMANDER.cost+(S.commanderTax||0);}
function deployVoltronCommander(){
  const cost=voltronCommanderCost();
  if(S.voltronMana<cost||voltronCommander())return false;
  S.voltronMana-=cost; S.commanderZone=false; S.voltronGear=0;
  S.tokens.push({name:VOLTRON_COMMANDER.name,ico:VOLTRON_COMMANDER.ico,kind:"commander",type:VOLTRON_COMMANDER.type,p:VOLTRON_COMMANDER.p,t:VOLTRON_COMMANDER.t,baseP:VOLTRON_COMMANDER.p,baseT:VOLTRON_COMMANDER.t,kws:[...VOLTRON_COMMANDER.kws],effect:VOLTRON_COMMANDER.effect,summoningSick:true});
  return true;
}
function newVoltronDeck(){return {lands:37,ramp:10,explosive:1,other:51};}
function voltronDeckTotal(){const deck=S.voltronDeck;return deck?deck.lands+deck.ramp+deck.explosive+deck.other:0;}
function drawVoltronCard(){
  const deck=S.voltronDeck,hand=S.voltronHand,total=voltronDeckTotal();
  if(!deck||total<=0)return "none";
  let roll=Math.floor(Math.random()*total),category="lands";
  for(const key of ["lands","ramp","explosive","other"]){
    if(roll<deck[key]){category=key;break;}
    roll-=deck[key];
  }
  deck[category]--;hand[category]++;
  return category;
}
function drawVoltronCards(count){const drawn=[];for(let i=0;i<count;i++)drawn.push(drawVoltronCard());return drawn;}
function bottomVoltronCard(){
  const hand=S.voltronHand,bottom=S.voltronBottom;
  const category=["other","ramp","explosive","lands"].find(key=>hand[key]>0);
  if(!category)return "none";
  hand[category]--;bottom[category]++;
  return category;
}
function resetVoltronOpeningHand(){
  S.voltronDeck=newVoltronDeck();
  S.voltronHand={lands:0,ramp:0,explosive:0,other:0};
  drawVoltronCards(7);
}
function initializeVoltronManaModel(){
  if(S.voltronDeck)return;
  S.voltronLandsInPlay=0;S.voltronRampInPlay=0;S.voltronExplosiveInPlay=0;S.voltronMulligans=0;
  S.voltronBottom={lands:0,ramp:0,explosive:0,other:0};
  resetVoltronOpeningHand();
  while(S.voltronHand.lands<2&&S.voltronMulligans<2){S.voltronMulligans++;resetVoltronOpeningHand();}
  for(let i=0;i<S.voltronMulligans;i++)bottomVoltronCard();
}
function voltronManaFromSources(){return S.voltronLandsInPlay+S.voltronRampInPlay+(S.voltronExplosiveInPlay*2);}
function voltronDeckSummary(){return `${S.voltronDeck.lands} lands · ${S.voltronDeck.ramp+S.voltronDeck.explosive} ramp left`;}

/**
 * Draw a typed card from the voltronOtherDeck when a generic "other" card is drawn.
 * Returns the resolved card data or null if the typed deck is empty.
 */
function drawTypedVoltronCard(){
  if(!S.voltronOtherDeck)S.voltronOtherDeck=generateVoltronOtherDeck();
  if(S.voltronOtherDeck.length===0)return null;
  const ref=S.voltronOtherDeck.pop();
  const card=resolveVoltronCard(ref);
  S.voltronTypedHand.push({...card,ref});
  return card;
}

/**
 * AI casting priority for spending remaining mana on support cards.
 * Returns an array of action step descriptions for everything cast.
 */
function voltronCastSupportCards(manaAvailable,commanderOnField,maxCasts=99){
  const cast=[];
  let mana=manaAvailable;
  let castCount=0;
  const hand=S.voltronTypedHand;

  // Sort hand by AI priority: dorks/ramp first if no commander, gear if commander out, then creatures by cost
  const scored=(card,index)=>{
    let score=0;
    if(!commanderOnField&&card.rampValue)score=100; // dorks are critical pre-commander
    else if(commanderOnField&&card.ref?.category==="gear")score=90;
    else if(card.ref?.category==="creatures")score=70;
    else if(card.ref?.category==="draw")score=50;
    else if(card.ref?.category==="utility")score=40;
    else if(card.ref?.category==="haymakers"&&commanderOnField)score=30;
    else if(card.ref?.category==="protection")score=10; // hold protection, don't cast sorcery-speed
    score-=card.cost; // prefer cheaper cards when competing
    return {card,index,score};
  };

  const ranked=hand.map(scored).sort((a,b)=>b.score-a.score);
  const castIndices=[];

  for(const entry of ranked){
    if(castCount>=maxCasts&&entry.card.ref?.category!=="protection")continue;
    const card=entry.card;

    // Protection stays in hand — don't extract it proactively.
    if(card.ref?.category==="protection"){
      continue;
    }

    // Gear requires cast + equip cost together
    const effectiveCost=card.ref?.category==="gear"?card.cost+(card.equip||0):card.cost;
    if(mana<effectiveCost)continue;

    mana-=effectiveCost;
    castCount++;

    if(card.ref?.category==="gear"&&commanderOnField){
      // Apply gear to commander
      const commander=voltronCommander();
      if(commander){
        const bonus=card.bonus||2;
        commander.baseP+=bonus;commander.baseT+=bonus;commander.p=commander.baseP;commander.t=commander.baseT;
        S.voltronGear=(S.voltronGear||0)+1;
        if(card.kw&&!commander.kws.includes(card.kw))commander.kws.push(card.kw);
        commander.effect=`Commander — ${S.voltronGear} gear; ${commander.kws.join(", ").toLowerCase()}.`;
        cast.push({label:`Cast + equip ${card.name} to ${commander.name}`,detail:`${card.effect}. Now ${tokenPower(commander)}/${tokenToughness(commander)}.`});
        logG(`equips ${card.name} on ${commander.name}; now ${tokenPower(commander)}/${tokenToughness(commander)}.`);
      }
    }else if(card.ref?.category==="creatures"||(card.ref?.category==="utility"&&card.isCreature)||card.rampValue){
      // Deploy creature to battlefield
      const p=card.p||2,t=card.t||2;
      const kws=card.kws?[...card.kws]:[];
      S.tokens.push({name:card.name,ico:card.ico||"🐾",kind:card.rampValue?"voltron-support":"voltron-creature",type:card.type||"Creature",p,t,baseP:p,baseT:t,kws,effect:card.effect||"",summoningSick:!card.haste});
      if(card.rampValue)S.voltronRampInPlay=(S.voltronRampInPlay||0)+card.rampValue;
      cast.push({label:`Cast ${card.name} (${card.cost} mana)`,detail:`${p}/${t}${kws.length?" · "+kws.join(", "):""} — ${card.effect}`});
      logG(`casts ${card.name} (${p}/${t}).`);
    }else if(card.ref?.category==="draw"){
      // Card draw — draw extra typed cards
      const extraDraws=Math.min(3,S.voltronOtherDeck?.length||0);
      for(let i=0;i<extraDraws;i++)drawTypedVoltronCard();
      cast.push({label:`Cast ${card.name} (${card.cost} mana)`,detail:`${card.effect} Rukha draws ${extraDraws} card${extraDraws===1?"":"s"}.`});
      logG(`casts ${card.name} and draws ${extraDraws} cards.`);
    }else if(card.ref?.category==="haymakers"){
      // Haymaker — logged as a powerful effect
      cast.push({label:`Cast ${card.name} (${card.cost} mana)`,detail:card.effect});
      logG(`casts ${card.name}!`);
    }else if(card.ref?.category==="utility"&&!card.isCreature){
      // Non-creature utility
      cast.push({label:`Cast ${card.name} (${card.cost} mana)`,detail:card.effect});
      logG(`casts ${card.name}.`);
    }else{
      // Fallback — generic play
      cast.push({label:`Play ${card.name} (${card.cost} mana)`,detail:card.effect||"Rukha plays a spell."});
    }

    castIndices.push(entry.index);
  }

  // Remove cast/held cards from hand (descending order to preserve indices)
  castIndices.sort((a,b)=>b-a).forEach(i=>hand.splice(i,1));
  S.voltronMana=mana;
  return cast;
}
function addVoltronSupport(){
  initializeVoltronManaModel();
  // Try to cast a creature from the typed hand
  const creature=S.voltronTypedHand.find(c=>(c.ref?.category==="creatures"||c.rampValue)&&c.cost<=voltronManaFromSources());
  if(!creature&&S.voltronHand.ramp<=0)return false;
  if(creature){
    const idx=S.voltronTypedHand.indexOf(creature);
    S.voltronTypedHand.splice(idx,1);
    const p=creature.p||2,t=creature.t||2;
    S.tokens.push({name:creature.name,ico:creature.ico||"🐾",kind:creature.rampValue?"voltron-support":"voltron-creature",type:creature.type||"Creature",p,t,baseP:p,baseT:t,kws:creature.kws?[...creature.kws]:[],effect:creature.effect||"",summoningSick:!creature.haste});
    if(creature.rampValue)S.voltronRampInPlay=(S.voltronRampInPlay||0)+creature.rampValue;
    return true;
  }
  // Fallback to generic ramp
  S.voltronHand.ramp--;S.voltronRampInPlay=(S.voltronRampInPlay||0)+1;
  S.tokens.push({name:"Wilds Guide",ico:"🌿",kind:"voltron-support",type:"Creature — Shaman",p:2,t:2,baseP:2,baseT:2,kws:[],effect:"Drawn ramp source.",summoningSick:true});
  return true;
}
function returnVoltronCommanderToZone(token){
  S.commanderZone=true; S.commanderTax=(S.commanderTax||0)+2; S.voltronGear=0;
  return `${token.name} returns to the command zone (tax +${S.commanderTax}).`;
}
function removeEnemyBattlefieldToken(index){
  const token=S.tokens[index]; if(!token)return null;
  S.tokens.splice(index,1);
  if(S.mode==="voltron"&&token.kind==="voltron-support")S.voltronRampInPlay=Math.max(0,(S.voltronRampInPlay||0)-1);
  return {token, commanderReturn:S.mode==="voltron"&&token.kind==="commander"?returnVoltronCommanderToZone(token):""};
}
/** Send a removed enemy token to the graveyard (unless it's a commander returning to zone) */
function sendToEnemyGraveyard(token){
  if(!token||token.kind==="commander")return; // commanders go to command zone, not graveyard
  S.enemyGraveyard=S.enemyGraveyard||[];
  S.enemyGraveyardCount=(S.enemyGraveyardCount||0)+1;
  S.enemyGraveyard.push({
    id:`gy:${S.enemyGraveyardCount}`,
    name:token.name, ico:token.ico||"🐾",
    type:token.type||"Creature",
    p:token.baseP||token.p, t:token.baseT||token.t,
    kws:token.kws?[...token.kws]:[],
    kind:token.kind, effect:token.effect||"",
    turn:S.turn
  });
}
/** Send a removed enemy token to exile */
function sendToEnemyExile(token){
  if(!token||token.kind==="commander")return;
  S.enemyExile=S.enemyExile||[];
  S.enemyExileCount=(S.enemyExileCount||0)+1;
  S.enemyExile.push({
    id:`ex:${S.enemyExileCount}`,
    name:token.name, ico:token.ico||"🐾",
    type:token.type||"Creature",
    p:token.baseP||token.p, t:token.baseT||token.t,
    kws:token.kws?[...token.kws]:[],
    kind:token.kind, effect:token.effect||"",
    turn:S.turn
  });
}
function addHordeUnit(){
  const eligible=HORDE_UNITS.filter(u=>(u.minTurn||1)<=S.turn);
  const u=eligible[Math.floor(Math.random()*eligible.length)];
  S.tokens.push({name:u.name,ico:u.ico,kind:"horde",type:"Horde Creature",p:u.p,t:u.t,baseP:u.p,baseT:u.t,kws:["Haste"],effect:u.effect,summoningSick:false});
  if(u.lock) S.spellLock=u.lock;
  return u;
}
function nextConclaveUnit(){
  const active=new Set(S.tokens.filter(t=>t.kind==="synergy").map(t=>t.unitId));
  let id=S.conclaveRoster.find(candidate=>!active.has(candidate));
  if(!id){ S.conclaveRoster=shuffled(CONCLAVE_UNITS.map(c=>c.id)); id=S.conclaveRoster.find(candidate=>!active.has(candidate)); }
  if(!id) return null;
  S.conclaveRoster=S.conclaveRoster.filter(candidate=>candidate!==id);
  const u=CONCLAVE_UNITS.find(candidate=>candidate.id===id);
  const foretold=S.tokens.some(t=>t.unitId==="selune");
  const bonus=foretold?1:0;
  S.tokens.push({name:u.name,ico:u.ico,kind:"synergy",unitId:u.id,type:"Conclave Creature",p:u.p+bonus,t:u.t+bonus,baseP:u.p+bonus,baseT:u.t+bonus,kws:u.ward?["Ward 2"]:[],effect:u.effect,summoningSick:!u.haste});
  S.lastConclaveId=id;
  if(u.lock) S.spellLock=u.lock;
  return u;
}
function removeToken(idx){ if(idx==null){idx=S.tokens.length-1;} return S.tokens.splice(idx,1)[0]; }
function buffRandomWolf(){
  const candidates=S.tokens.filter(t=>!t.kws.includes("Deathtouch"));
  const t=candidates[candidates.length-1]||S.tokens[S.tokens.length-1];
  if(t){t.p+=1;t.baseP=(t.baseP??t.p-1)+1;if(!t.kws.includes("Deathtouch"))t.kws.push("Deathtouch");}
  render();
}
function conclaveBonuses(token){
  if(S.mode!=="conclave"||token.kind!=="synergy") return {p:0,t:0};
  let p=S.conclaveAscension||0,t=S.conclaveAscension||0;
  S.tokens.forEach(source=>{
    if(source.kind!=="synergy"||source===token)return;
    const unit=CONCLAVE_UNITS.find(u=>u.id===source.unitId);
    if(unit?.auraP)p+=unit.auraP;
    if(unit?.auraT)t+=unit.auraT;
  });
  if(S.tokens.filter(x=>x.kind==="synergy").length>=3 && S.tokens.some(x=>x.unitId==="thalen")){p+=1;t+=1;}
  return {p,t};
}
function tokenPower(t){return (t.baseP??t.p)+conclaveBonuses(t).p+(S.turnPowerBonus||0);}
function tokenToughness(t){return (t.baseT??t.t)+conclaveBonuses(t).t;}
function tokenKeywords(t){
  const kws=[...(t.kws||[])];
  if(S.mode==="conclave"&&t.kind==="synergy"&&t.unitId!=="mirael"&&S.tokens.some(x=>x.unitId==="mirael")&&!kws.includes("Ward 2"))kws.push("Ward 2");
  return kws;
}
function totalPower(){return S.tokens.filter(t=>t.attacking).reduce((a,t)=>a+tokenPower(t),0);}
function readyPowerTotal(){return S.tokens.filter(t=>!t.summoningSick).reduce((a,t)=>a+tokenPower(t),0);}

/* ---------- attack declaration ---------- */
/**
 * Declares which tokens are attacking this turn. Sets the `attacking` flag
 * on each token. Called during the enemy turn before appendAttackStep().
 */
function declareAttackers(){
  // First clear all attack flags
  S.tokens.forEach(t=>{ t.attacking=false; });

  if(S.mode==="voltron"){
    declareVoltronAttackers();
  }else{
    // Default behavior for vanilla, hard, horde, conclave: all non-sick attack
    S.tokens.forEach(t=>{ if(!t.summoningSick) t.attacking=true; });
  }
}

/**
 * Voltron-specific attack logic. Rukha's strategy:
 * - Commander ALWAYS attacks if able (she's the main threat)
 * - Creatures with haste that just entered attack (aggressive posture)
 * - Mana dorks (rampValue > 0) stay back — they're more valuable tapping for mana
 * - Small utility creatures (power <= 1) stay back unless the player has no creatures
 * - Other combat-relevant creatures attack if the player has blockers to trade with,
 *   OR if Rukha is ahead on board and can afford to swing wide
 */
function declareVoltronAttackers(){
  const playerCreatures=S.player.creatures;
  const commander=voltronCommander();
  const nonSick=S.tokens.filter(t=>!t.summoningSick);

  nonSick.forEach(t=>{
    // Commander always attacks — that's the whole voltron plan
    if(t.kind==="commander"){
      t.attacking=true;
      return;
    }

    // Mana dorks never attack — their ramp value exceeds their combat value
    if(t.kind==="voltron-support" && t.effect && t.effect.includes("mana")){
      t.attacking=false;
      return;
    }

    // Horde-style: haste creatures attack immediately (already not sick)
    if(t.kws && t.kws.includes("Haste") && tokenPower(t)>=2){
      t.attacking=true;
      return;
    }

    // Tiny creatures (0-1 power) hold back as chump blockers unless player is wide open
    if(tokenPower(t)<=1){
      t.attacking=(playerCreatures===0);
      return;
    }

    // Medium creatures: attack if commander is out (they support the alpha strike)
    // or if player has few blockers and we can overwhelm
    if(commander && !commander.summoningSick){
      // With commander attacking, send support to force tough blocking decisions
      t.attacking=true;
      return;
    }

    // No commander on field: be more conservative, only attack with decent bodies
    // if the player doesn't have overwhelming blockers
    if(playerCreatures<=nonSick.length){
      t.attacking=(tokenPower(t)>=2);
    }else{
      // Player has more creatures than us, hold back for defense
      t.attacking=false;
    }
  });
}

/* ---------- log ---------- */
function logG(m){push("garruk",enemyName(),m);} function logP(m){push("player","You",m);}
function logSys(m){push("sys","",m);} function logBig(m){push("big","⚔ Encounter",m);}
function push(cls,who,msg){
  const entry={cls,who,msg,turn:S.turn};
  // Attach phase/step metadata when on the player's turn (for stack tracing)
  if(S.phase==="player"){
    entry.playerPhase=S.playerPhase;
    entry.playerStep=S.playerStep;
  }
  S.log.unshift(entry); if(S.log.length>80)S.log.pop(); renderLog();
}

/* =====================================================================
   CUSTOM MODAL INPUTS (native prompt/confirm are blocked in sandboxed iframes)
   ===================================================================== */
let inputResolver=null;
function closeInput(){ document.getElementById('inputOverlay').classList.remove('show'); inputResolver=null; }
function askNumber(title, def){
  if(def==null) def=1;
  return new Promise(res=>{
    inputResolver=res;
    document.getElementById('inputTitle').textContent=title;
    const body=document.getElementById('inputBody');
    body.innerHTML=`<div class="num-row">
       <button type="button" id="numDown">−</button>
       <input type="number" id="numInput" value="${def}" min="0" inputmode="numeric">
       <button type="button" id="numUp">+</button></div>`;
    const acts=document.getElementById('inputActions'); acts.className="input-actions";
    document.getElementById('inputOk').textContent="OK";
    const inp=document.getElementById('numInput');
    document.getElementById('numDown').onclick=()=>{ inp.value=Math.max(0,(parseInt(inp.value,10)||0)-1); };
    document.getElementById('numUp').onclick=()=>{ inp.value=(parseInt(inp.value,10)||0)+1; };
    inp.onkeydown=(e)=>{ if(e.key==="Enter"){ done(); } };
    function done(){ const v=parseInt(inp.value,10); const out=isNaN(v)?null:Math.max(0,v); closeInput(); res(out); }
    document.getElementById('inputOk').onclick=done;
    document.getElementById('inputCancel').onclick=()=>{ closeInput(); res(null); };
    document.getElementById('inputOverlay').classList.add('show');
    setTimeout(()=>{ inp.focus(); inp.select(); },60);
  });
}
function pickTokenModal(){
  return new Promise(res=>{
    if(S.tokens.length===0){ res(null); return; }
    if(S.tokens.length===1){ res(0); return; }
    inputResolver=res;
    document.getElementById('inputTitle').textContent="Which of Garruk's creatures?";
    const body=document.getElementById('inputBody');
    body.innerHTML="";
    S.tokens.forEach((t,i)=>{
      const b=document.createElement('button');
      b.type="button"; b.className="pick-row";
      b.innerHTML=`${t.ico} <b>${t.name}</b> — ${tokenPower(t)}/${tokenToughness(t)}${tokenKeywords(t).length?' · '+tokenKeywords(t).join(' · '):''}`;
      b.onclick=()=>{ closeInput(); res(i); };
      body.appendChild(b);
    });
    const acts=document.getElementById('inputActions'); acts.className="input-actions hide-ok";
    document.getElementById('inputCancel').onclick=()=>{ closeInput(); res(null); };
    document.getElementById('inputOverlay').classList.add('show');
  });
}
function pickMultiTokenModal(){
  return new Promise(res=>{
    if(S.tokens.length===0){ res(null); return; }
    if(S.tokens.length===1){ res([0]); return; }
    inputResolver=res;
    document.getElementById('inputTitle').textContent="Select creature(s) to kill (click each one)";
    const body=document.getElementById('inputBody');
    body.innerHTML="";
    const picked = new Set();
    S.tokens.forEach((t,i)=>{
      const b=document.createElement('button');
      b.type="button"; b.className="pick-row";
      b.innerHTML=`${t.ico} <b>${t.name}</b> — ${tokenPower(t)}/${tokenToughness(t)}${tokenKeywords(t).length?' · '+tokenKeywords(t).join(' · '):''}`;
      b.onclick=()=>{
        if(picked.has(i)){ picked.delete(i); b.style.borderColor="#47606f"; b.style.background=""; }
        else { picked.add(i); b.style.borderColor="var(--green-lt)"; b.style.background="rgba(63,109,52,.25)"; }
      };
      body.appendChild(b);
    });
    const acts=document.getElementById('inputActions'); acts.className="input-actions";
    document.getElementById('inputOk').textContent="Confirm Kill";
    document.getElementById('inputOk').onclick=()=>{ closeInput(); res(picked.size > 0 ? Array.from(picked) : null); };
    document.getElementById('inputCancel').onclick=()=>{ closeInput(); res(null); };
    document.getElementById('inputOverlay').classList.add('show');
  });
}
function askConfirm(title, msg, okLabel){
  return new Promise(res=>{
    inputResolver=res;
    document.getElementById('inputTitle').textContent=title;
    const body=document.getElementById('inputBody');
    body.innerHTML=`<div class="confirm-msg">${msg}</div>`;
    const acts=document.getElementById('inputActions'); acts.className="input-actions";
    const ok=document.getElementById('inputOk'); ok.textContent=okLabel||"Confirm";
    ok.onclick=()=>{ closeInput(); res(true); };
    document.getElementById('inputCancel').onclick=()=>{ closeInput(); res(false); };
    document.getElementById('inputOverlay').classList.add('show');
  });
}
/**
 * Combat interaction popup — when a player clicks an attacking creature,
 * ask whether they just blocked it (stopped damage) or killed it (dies → graveyard).
 * Returns "blocked" | "dies" | null (cancelled).
 */
function askCombatChoice(token){
  const p=tokenPower(token),t=tokenToughness(token);
  const kws=tokenKeywords(token);
  return new Promise(res=>{
    inputResolver=res;
    document.getElementById('inputTitle').textContent=`${token.name} (${p}/${t})`;
    const body=document.getElementById('inputBody');
    body.innerHTML=`<div class="combat-choice-body">
      <div class="combat-choice-card">${token.ico} <b>${token.name}</b>${kws.length?' · '+kws.join(', '):''}</div>
      <div class="combat-choice-btns">
        <button type="button" class="combat-choice-btn choice-blocked" id="choiceBlocked">
          <span class="choice-ico">🛡️</span>
          <span class="choice-label">Blocked</span>
          <span class="choice-desc">Stop ${p} damage · creature survives</span>
        </button>
        <button type="button" class="combat-choice-btn choice-dies" id="choiceDies">
          <span class="choice-ico">💀</span>
          <span class="choice-label">Dies</span>
          <span class="choice-desc">Creature is destroyed → graveyard</span>
        </button>
      </div>
    </div>`;
    const acts=document.getElementById('inputActions'); acts.className="input-actions hide-ok";
    document.getElementById('inputCancel').onclick=()=>{ closeInput(); res(null); };
    document.getElementById('choiceBlocked').onclick=()=>{ closeInput(); res("blocked"); };
    document.getElementById('choiceDies').onclick=()=>{ closeInput(); res("dies"); };
    document.getElementById('inputOverlay').classList.add('show');
  });
}
/**
 * Removal destination popup — when removing a card from the battlefield,
 * ask whether it goes to the graveyard or exile.
 * Returns "graveyard" | "exile" | null (cancelled).
 */
function askRemovalDestination(token){
  const p=tokenPower(token),t=tokenToughness(token);
  const kws=tokenKeywords(token);
  return new Promise(res=>{
    inputResolver=res;
    document.getElementById('inputTitle').textContent=`Remove ${token.name}`;
    const body=document.getElementById('inputBody');
    body.innerHTML=`<div class="combat-choice-body">
      <div class="combat-choice-card">${token.ico} <b>${token.name}</b> (${p}/${t})${kws.length?' · '+kws.join(', '):''}</div>
      <div class="combat-choice-btns">
        <button type="button" class="combat-choice-btn choice-graveyard" id="choiceGraveyard">
          <span class="choice-ico">☠</span>
          <span class="choice-label">Graveyard</span>
          <span class="choice-desc">Destroyed, sacrificed, or died</span>
        </button>
        <button type="button" class="combat-choice-btn choice-exile" id="choiceExile">
          <span class="choice-ico">✦</span>
          <span class="choice-label">Exile</span>
          <span class="choice-desc">Removed from the game entirely</span>
        </button>
      </div>
    </div>`;
    const acts=document.getElementById('inputActions'); acts.className="input-actions hide-ok";
    document.getElementById('inputCancel').onclick=()=>{ closeInput(); res(null); };
    document.getElementById('choiceGraveyard').onclick=()=>{ closeInput(); res("graveyard"); };
    document.getElementById('choiceExile').onclick=()=>{ closeInput(); res("exile"); };
    document.getElementById('inputOverlay').classList.add('show');
  });
}

/* ---------- contextual detail pop-up ---------- */
let infoReturnFocus=null;
function openInfoModal(title,html){
  infoReturnFocus=document.activeElement;
  document.getElementById('infoTitle').textContent=title;
  document.getElementById('infoBody').innerHTML=html;
  document.getElementById('infoOverlay').classList.add('show');
  setTimeout(()=>document.getElementById('infoClose').focus(),40);
}
function closeInfoModal(){
  document.getElementById('infoOverlay').classList.remove('show');
  if(infoReturnFocus&&typeof infoReturnFocus.focus==="function")infoReturnFocus.focus();
  infoReturnFocus=null;
}
let logReturnFocus=null;
function openLog(){
  logReturnFocus=document.getElementById('menuBtn');
  document.getElementById('logOverlay').classList.add('show');
  setTimeout(()=>document.getElementById('logClose').focus(),40);
}
function closeLog(){
  document.getElementById('logOverlay').classList.remove('show');
  if(logReturnFocus&&typeof logReturnFocus.focus==="function")logReturnFocus.focus();
  logReturnFocus=null;
}
function trapDialogFocus(event,overlay){
  if(event.key!=="Tab")return;
  const controls=Array.from(overlay.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter(el=>!el.disabled);
  if(controls.length===0)return;
  const first=controls[0],last=controls[controls.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
}
function showModeRules(){openInfoModal(`${modeConfig().name} rules`,modeHelpHtml());}
function enemyActionsHtml(){
  let html='<ol class="action-steps">';
  (S.actionSteps||[]).forEach((step,i)=>{html+=`<li class="action-step"><span class="step-num">${i+1}</span><div class="step-content"><strong>${step.label}</strong><span class="step-detail">${step.detail}</span></div></li>`;});
  return html+'</ol>';
}
function showEnemyActions(){openInfoModal(`${enemyName()} · Turn ${S.turn}`,enemyActionsHtml());}
function showTokenDetails(index){
  const token=S.tokens[index];if(!token)return;
  const keywords=tokenKeywords(token);
  openInfoModal(token.name,`<div class="token-detail">
    <div class="token-detail-hero"><span>${token.ico}</span><strong>${tokenPower(token)}/${tokenToughness(token)}</strong></div>
    <div class="token-detail-type">${token.type||"Creature"}</div>
    ${token.effect?`<p>${token.effect}</p>`:""}
    ${token.kind==="commander"?`<div class="token-detail-note">Command zone tax: +${S.commanderTax} · Commander damage dealt: ${S.commanderDamage}/21</div>`:""}
    ${keywords.length?`<div class="token-detail-tags">${keywords.map(keyword=>`<span>${keyword}</span>`).join("")}</div>`:""}
    ${token.summoningSick?'<div class="token-detail-note">Summoning sick · cannot attack this turn</div>':""}
  </div>`);
}
function showEnemyGraveyard(){
  const gy=S.enemyGraveyard||[];
  const count=S.enemyGraveyardCount||0;
  let html='<div class="enemy-graveyard-viewer">';
  html+=`<p class="graveyard-summary">${count} card${count===1?"":"s"} in ${enemyName()}'s graveyard.</p>`;
  if(gy.length===0){
    html+=`<div class="graveyard-empty">The graveyard is empty.</div>`;
  }else{
    html+=`<ul class="graveyard-card-list">`;
    gy.slice().reverse().forEach(card=>{
      html+=`<li class="graveyard-card"><span class="graveyard-card-icon">${card.ico||"🐾"}</span><div class="graveyard-card-info"><strong>${card.name}</strong><span>${card.type||"Creature"} · ${card.p||0}/${card.t||0}${card.kws&&card.kws.length?" · "+card.kws.join(", "):""}</span><small>Died turn ${card.turn||"?"}</small></div></li>`;
    });
    html+=`</ul>`;
  }
  html+='</div>';
  openInfoModal(`☠ ${enemyName()}'s Graveyard`,html);
}
function showEnemyExile(){
  const ex=S.enemyExile||[];
  const count=S.enemyExileCount||0;
  let html='<div class="enemy-graveyard-viewer">';
  html+=`<p class="graveyard-summary">${count} card${count===1?"":"s"} in ${enemyName()}'s exile.</p>`;
  if(ex.length===0){
    html+=`<div class="graveyard-empty">Exile is empty.</div>`;
  }else{
    html+=`<ul class="graveyard-card-list">`;
    ex.slice().reverse().forEach(card=>{
      html+=`<li class="graveyard-card exile-card"><span class="graveyard-card-icon">${card.ico||"🐾"}</span><div class="graveyard-card-info"><strong>${card.name}</strong><span>${card.type||"Creature"} · ${card.p||0}/${card.t||0}${card.kws&&card.kws.length?" · "+card.kws.join(", "):""}</span><small>Exiled turn ${card.turn||"?"}</small></div></li>`;
    });
    html+=`</ul>`;
  }
  html+='</div>';
  openInfoModal(`✦ ${enemyName()}'s Exile`,html);
}

/* =====================================================================
   GARRUK AI
   ===================================================================== */
function hardGarrukEmergencyDecision(st,p,tokens,readyPower){
  const boardDeficit=p.creatures-tokens;
  const afterSlay=st.loyalty-10;
  const afterWipe=st.loyalty-25;
  const severelyOverwhelmed=p.creatures>=5||boardDeficit>=3;
  const clearlyBehind=p.creatures>=3&&boardDeficit>=2;
  const slightlyBehind=p.creatures>=2&&boardDeficit>=1;
  const recentHit=st.lastPlayerDamage||0;

  // A large hit signals evasive, trampling, or oversized pressure that raw creature
  // counts cannot describe. Hard Garruk reacts before repeating its normal plan.
  if(recentHit>=10&&p.creatures>=3&&afterWipe>=8){
    S.aiReason=`Hard Garruk took ${recentHit} damage last turn and uses a safe board clear to stop lethal momentum.`;
    return "wipe";
  }
  if(recentHit>=5&&p.creatures>=1&&afterSlay>=8){
    S.aiReason=`Hard Garruk took ${recentHit} damage last turn and removes the best creature responsible for the pressure.`;
    return "slay";
  }

  // When a wide player board is running away with the game, reset it—but retain
  // enough loyalty to survive the following turn rather than spending suicidally.
  if(severelyOverwhelmed&&p.creatures>=4&&afterWipe>=8){
    S.aiReason=`Hard Garruk is overwhelmed (${tokens} creature${tokens===1?"":"s"} vs. ${p.creatures}) and has enough loyalty to safely reset the board.`;
    return "wipe";
  }

  // Spend surplus loyalty on targeted removal even before the pack reaches three.
  // A larger deficit demands a larger safety reserve after Slay.
  if(clearlyBehind&&afterSlay>=10){
    S.aiReason=`Hard Garruk is ${boardDeficit} creatures behind and uses surplus loyalty to remove your best threat.`;
    return "slay";
  }
  if(slightlyBehind&&afterSlay>=8&&readyPower<Math.max(4,p.creatures*2)){
    S.aiReason=`Hard Garruk is falling behind on board and uses Slay while retaining ${afterSlay} loyalty.`;
    return "slay";
  }

  return null;
}
function garrukDecide(){
  const st=S,p=st.player,tokens=st.tokens.length;
  const readyPower=readyPowerTotal();
  st.enraged=st.loyalty<=8;
  S.aiReason="";

  // Hard Garruk can abandon its normal go-wide plan to equalize a losing board.
  if(S.mode==="hard"){
    const emergency=hardGarrukEmergencyDecision(st,p,tokens,readyPower);
    if(emergency)return emergency;
  }

  // Normal plan: establish at least three bodies before spending loyalty.
  if(tokens<3){
    S.aiReason=`${enemyName()} is building toward a three-creature pack.`;
    return "wolf";
  }

  // Vanilla can still clear a truly massive board, while Hard mode normally
  // reaches board clears through the emergency evaluation above.
  if(st.loyalty>=33&&p.creatures>=6){
    S.aiReason="The opposing board is large enough to justify a safe board clear.";
    return "wipe";
  }

  const loyaltyAfterSlay=st.loyalty-10;
  const primarySlayFloor=S.mode==="hard"?10:8;
  const secondarySlayFloor=S.mode==="hard"?8:6;
  if(loyaltyAfterSlay>=primarySlayFloor&&p.creatures>=2&&tokens>=3){
    S.aiReason="The pack is established, so Garruk can safely spend loyalty on the best opposing creature.";
    return "slay";
  }
  if(loyaltyAfterSlay>=secondarySlayFloor&&p.creatures>=1&&tokens>=4){
    S.aiReason="A wide pack lets Garruk remove a key blocker while preserving a loyalty buffer.";
    return "slay";
  }

  const unbuffed=st.tokens.filter(t=>!t.kws.includes("Deathtouch"));
  if(unbuffed.length>0){
    if(unbuffed.length>=2&&tokens<5){
      S.aiReason="The pack is stable; Garruk adds another body before distributing buffs.";
      return "wolf";
    }
    S.aiReason="Garruk strengthens the pack and rebuilds loyalty.";
    return "buff";
  }
  if(tokens<6){
    S.aiReason="The existing pack is empowered, so Garruk goes wider.";
    return "wolf";
  }
  if(st.loyalty<18||readyPower<p.life){
    S.aiReason="Garruk converts a buff into both pressure and a loyalty reserve.";
    return "buff";
  }
  S.aiReason="Garruk continues expanding the pack.";
  return "wolf";
}
function resolveGarrukAction(id){
  if(id==="wolf"){
    addWolf();
    const size=S.mode==="hard"&&S.turn>=5?4:2;
    logG(`summons a ${size}/${size} Wolf. [0]`);
  }
  else if(id==="buff"){buffRandomWolf();gainLoyalty(4);logG("empowers a creature: +1/+0 & deathtouch. Loyalty +4. [+4]");}
  else if(id==="slay"){S.loyalty=Math.max(0,S.loyalty-10);logG(`uses Slay, targeting ${S.slayTarget}. [-10]`);}
  else if(id==="wipe"){S.loyalty=Math.max(0,S.loyalty-25);logG("unleashes Overrun the Weak! [-25]");}
  render();
}

/* =====================================================================
   TURN FLOW — two phases (decide vs. show are separated for undo/resume)
   ===================================================================== */
function startGarrukTurn(){
  S.phase="garruk"; S.turnPowerBonus=0; S.spellLock="";
  // Untap: clear attacking flags from last turn
  S.tokens.forEach(t=>{ t.attacking=false; });
  if(S.mode==="horde"){startHordeTurn();return;}
  if(S.mode==="conclave"){startConclaveTurn();return;}
  if(S.mode==="voltron"){startVoltronTurn();return;}
  startHunterTurn();
}
function startHunterTurn(){
  const loyaltyGain=S.mode==="hard"?2+Math.min(4,Math.floor((S.turn-1)/2)):2;
  gainLoyalty(loyaltyGain);
  logG(`gains ${loyaltyGain} loyalty at the start of turn. Loyalty → ${S.loyalty}.`);
  const id=garrukDecide();
  S.pendingDecl=id; S.slayTarget=id==="slay"?garrukSlayTarget():null;
  resolveGarrukAction(id);
  declareAttackers();
  S.attackPower=totalPower();
  const d=ABILITIES[id];
  S.declFlavor=d.flavor[Math.floor(Math.random()*d.flavor.length)];
  const size=S.mode==="hard"&&S.turn>=5?"4/4":"2/2";
  const abilityDetail=id==="wolf"?`${S.declFlavor} Put a ${size} Wolf token onto the battlefield.`:S.declFlavor+" "+d.mech+(id==="slay"?` Target: ${S.slayTarget}.`:"");
  S.actionSteps=[
    {label:`Loyalty +${loyaltyGain} (passive)`,detail:S.mode==="hard"?`Hard Mode escalation grants ${loyaltyGain} loyalty this turn; income rises every two turns (maximum +6).`:`Garruk gains ${loyaltyGain} loyalty at the start of his turn.`}
  ];
  if(S.mode==="hard"&&S.aiReason)S.actionSteps.push({label:"Threat assessment",detail:S.aiReason});
  S.actionSteps.push({label:d.label,detail:abilityDetail});
  appendAttackStep();
  showGarrukTurn();
}
function startHordeTurn(){
  S.pendingDecl="horde";
  const wave=Math.min(4,1+Math.floor((S.turn-1)/2));
  const spawned=[];
  for(let i=0;i<wave&&S.loyalty>0;i++){
    const unit=addHordeUnit(); spawned.push(`${unit.name} ${unit.p}/${unit.t}`); S.loyalty=Math.max(0,S.loyalty-1);
  }
  S.actionSteps=[{label:`Reveal wave ${S.turn}`,detail:spawned.length?`The Horde reveals ${spawned.length} creature(s): ${spawned.join(", ")}. Each reveal mills one card from the Horde deck.`:"The Horde deck is empty; destroy the remaining creatures to win."}];
  if(S.turn%4===0&&S.player.creatures>0){
    adjust("creatures",-1);
    S.actionSteps.push({label:"Dread Edict",detail:"Sacrifice your weakest creature. Your tracked creature count was reduced by 1; choose the physical creature."});
    logG("forces a Dread Edict; you sacrifice your weakest creature.");
  }else if(S.turn%3===0){
    S.turnPowerBonus=1;
    S.actionSteps.push({label:"Grave Frenzy",detail:"Every Horde creature gets +1/+0 for this combat."});
  }else{
    S.actionSteps.push({label:"Relentless advance",detail:"Horde creatures have haste and attack every turn if able."});
  }
  declareAttackers();
  S.attackPower=totalPower();
  S.declFlavor="The dead pour forward without fear or strategy—only hunger.";
  appendAttackStep();
  logG(`reveals a wave of ${spawned.length}; ${S.loyalty} cards remain in the Horde deck.`);
  showGarrukTurn();
}
function startConclaveTurn(){
  S.pendingDecl="conclave";
  const unit=nextConclaveUnit();
  S.actionSteps=[];
  if(unit){
    S.actionSteps.push({label:`Summon ${unit.name}`,detail:`${unit.p}/${unit.t} — ${unit.effect}${unit.haste?" It attacks immediately.":""}`});
    logG(`summons ${unit.name} (${unit.p}/${unit.t}).`);
  }else{
    S.actionSteps.push({label:"Roster complete",detail:"Every unique Conclave creature is already on the battlefield."});
  }
  const allies=S.tokens.filter(t=>t.kind==="synergy");
  if(S.player.creatures>=4&&S.turn%4===0){
    S.pendingDecl="conclaveWipe";
    S.actionSteps.push({label:"Vaelora casts Prismatic Ruin",detail:"Destroy all player creatures. Record how many survive through protection; if you do nothing, none survive."});
  }else if(allies.length>=3&&S.turn%2===0){
    S.conclaveAscension=Math.min(2,(S.conclaveAscension||0)+1);
    S.actionSteps.push({label:"Conclave Ascension",detail:`Vaelora resonates with the network. Conclave creatures permanently get +${S.conclaveAscension}/+${S.conclaveAscension}.`});
  }else{
    const auraBearers=allies.filter(t=>["kael","nyra","thalen","mirael"].includes(t.unitId)).length;
    if(allies.some(t=>t.unitId==="elyra")&&auraBearers>0){
      gainLoyalty(auraBearers);
      S.actionSteps.push({label:"Elyra's Resonance",detail:`Vaelora gains ${auraBearers} resolve from active aura bearers.`});
    }else{
      S.actionSteps.push({label:"Weave the network",detail:"Active named creatures share their printed auras and threshold abilities."});
    }
  }
  const lockUnit=allies.find(t=>CONCLAVE_UNITS.find(u=>u.id===t.unitId)?.lock);
  if(lockUnit){
    S.spellLock=CONCLAVE_UNITS.find(u=>u.id===lockUnit.unitId).lock;
    S.actionSteps.push({label:`${lockUnit.name} restricts your magic`,detail:S.spellLock});
  }
  if(allies.length>=4&&allies.some(t=>t.unitId==="kharos")){
    S.spellLock="You can't cast more than one spell this turn.";
    S.actionSteps.push({label:"Kharos completes the chain",detail:S.spellLock});
  }
  declareAttackers();
  S.attackPower=totalPower();
  S.declFlavor="Vaelora conducts the battlefield like a living spell.";
  appendAttackStep();
  showGarrukTurn();
}
function startVoltronTurn(){
  S.pendingDecl="voltron";
  initializeVoltronManaModel();
  if(!S.voltronOtherDeck)S.voltronOtherDeck=generateVoltronOtherDeck();
  const actions=[];

  // --- DRAW PHASE ---
  if(S.turn>1){
    const drawn=drawVoltronCard();
    let drawDetail;
    if(drawn==="none")drawDetail="The virtual deck is empty.";
    else if(drawn==="other"){
      const typedCard=drawTypedVoltronCard();
      drawDetail=typedCard?`Rukha draws ${typedCard.name} (${typedCard.ref?.category}).`:"Rukha draws a spell.";
    }else{
      drawDetail=`Rukha draws a ${drawn==="lands"?"land":drawn==="ramp"?"ramp source":"fast-mana rock"}.`;
    }
    actions.push({label:"Draw",detail:drawDetail});
  }else{
    // Opening hand: draw typed cards for the "other" slots in the opening hand
    for(let i=0;i<S.voltronHand.other;i++)drawTypedVoltronCard();
    actions.push({label:"Keep opening hand",detail:`Rukha keeps ${S.voltronHand.lands} land${S.voltronHand.lands===1?"":"s"} and ${S.voltronTypedHand.length} spell${S.voltronTypedHand.length===1?"":"s"}.`});
  }

  // --- LAND DROP ---
  if(S.voltronHand.lands>0){
    S.voltronHand.lands--;S.voltronLandsInPlay++;
    actions.push({label:"Play a land",detail:`${S.voltronLandsInPlay} land${S.voltronLandsInPlay===1?"":"s"} in play.`});
  }else{
    actions.push({label:"Miss a land drop",detail:"No land available in Rukha's hand."});
  }

  // --- MANA AVAILABLE ---
  S.voltronMana=voltronManaFromSources();

  // --- PRIMARY ACTION: commander cast, ramp, or gear ---
  let commander=voltronCommander();
  if(!commander){
    const cost=voltronCommanderCost();
    if(S.voltronMana>=cost&&deployVoltronCommander()){
      actions.push({label:`Cast ${VOLTRON_COMMANDER.name} (${cost} mana)`,detail:`Rukha enters from the command zone.${S.commanderTax?` Includes ${S.commanderTax} commander tax.`:""}`});
      logG(`casts ${VOLTRON_COMMANDER.name} from the command zone for ${cost} mana.`);
      commander=voltronCommander();
    }else if(S.voltronHand.explosive>0&&S.voltronMana>=1){
      S.voltronHand.explosive--;S.voltronExplosiveInPlay++;S.voltronMana--;
      actions.push({label:"Deploy fast mana (1 mana)",detail:"Rukha plays a rare explosive rock; +2 mana on future turns."});
      logG("deploys a fast-mana rock.");
    }else if(S.voltronHand.ramp>0&&S.voltronMana>=2){
      S.voltronHand.ramp--;S.voltronRampInPlay++;S.voltronMana-=2;
      actions.push({label:"Cast ramp spell (2 mana)",detail:"Rukha converts a drawn ramp source into +1 mana on future turns."});
      logG("casts a ramp spell.");
    }
  }else{
    S.commanderZone=false;
    // Look for gear in the typed hand first — must pay BOTH cast + equip cost
    const gearInHand=S.voltronTypedHand.filter(c=>c.ref?.category==="gear");
    const bestGear=gearInHand.filter(c=>(c.cost+(c.equip||0))<=S.voltronMana).sort((a,b)=>(b.bonus/(b.cost+(b.equip||0)))-(a.bonus/(a.cost+(a.equip||0))))[0];
    if(bestGear){
      const totalGearCost=bestGear.cost+(bestGear.equip||0);
      S.voltronMana-=totalGearCost;
      const bonus=bestGear.bonus||2;
      commander.baseP+=bonus;commander.baseT+=bonus;commander.p=commander.baseP;commander.t=commander.baseT;
      S.voltronGear=(S.voltronGear||0)+1;
      if(bestGear.kw&&!commander.kws.includes(bestGear.kw))commander.kws.push(bestGear.kw);
      commander.effect=`Commander — ${S.voltronGear} gear; ${commander.kws.join(", ").toLowerCase()}.`;
      const gearIdx=S.voltronTypedHand.indexOf(bestGear);
      if(gearIdx>=0)S.voltronTypedHand.splice(gearIdx,1);
      actions.push({label:`Cast + equip ${bestGear.name} (${bestGear.cost}+${bestGear.equip||0} mana)`,detail:`${bestGear.effect}. Now ${tokenPower(commander)}/${tokenToughness(commander)}.`});
      logG(`equips ${bestGear.name}; now ${tokenPower(commander)}/${tokenToughness(commander)}.`);
    }
  }

  // --- SECONDARY ACTIONS: spend remaining mana on support cards (max 1 per turn) ---
  if(S.voltronMana>0&&S.voltronTypedHand.length>0){
    const supportActions=voltronCastSupportCards(S.voltronMana,!!voltronCommander(),1);
    actions.push(...supportActions);
  }

  // --- HOLD STATUS ---
  if(actions.length<=2){
    const reason=S.voltronMana<1?"no mana remaining":"no castable cards in hand";
    actions.push({label:"Pass with mana open",detail:`Rukha has ${reason}. ${S.voltronProtectionHeld?`Holding ${S.voltronProtectionHeld} protection spell${S.voltronProtectionHeld===1?"":"s"}.`:""}`});
  }

  S.actionSteps=actions;
  declareAttackers();
  S.attackPower=totalPower();
  S.declFlavor=voltronCommander()?"Rukha builds toward a commander-damage strike.":"Rukha develops mana and board presence.";
  appendAttackStep();
  showGarrukTurn();
}
function appendAttackStep(){
  const attackers=S.tokens.filter(t=>t.attacking);
  const holdingBack=S.tokens.filter(t=>!t.summoningSick&&!t.attacking);
  if(S.attackPower>0){
    const names=attackers.map(t=>`${t.name} (${tokenPower(t)}/${tokenToughness(t)})`).join(", ");
    let detail=`Attacking: ${names}.`;
    if(holdingBack.length>0){
      const heldNames=holdingBack.map(t=>t.name).join(", ");
      detail+=` Holding back: ${heldNames}.`;
    }
    S.actionSteps.push({label:`Attack with ${attackers.length} creature(s) for ${S.attackPower}`,detail});
  }else if(S.tokens.some(t=>t.summoningSick)){
    S.actionSteps.push({label:"Creatures held back",detail:"Newly summoned creatures without haste have summoning sickness."});
  }else if(holdingBack.length>0){
    S.actionSteps.push({label:"No attack declared",detail:`${holdingBack.length} creature(s) held back for defense.`});
  }
}
function showGarrukTurn(){
  S.phase="garruk";
  const decl=document.getElementById('declare');
  decl.className="declare garruk compact-declare";
  const actionCount=(S.actionSteps||[]).length;
  const attackerCount=S.tokens.filter(t=>t.attacking).length;
  document.getElementById('declareTitle').textContent=`${actionCount} enemy action${actionCount===1?"":"s"}`;
  document.getElementById('declareFlavor').textContent=S.attackPower>0?`${attackerCount} attacker${attackerCount===1?"":"s"} · ${S.attackPower} incoming power`:"No incoming combat damage";
  document.getElementById('declareMech').innerHTML=`<button type="button" class="detail-link" id="enemyActionsBtn">Review actions</button>`;
  document.getElementById('enemyActionsBtn').onclick=showEnemyActions;
  document.getElementById('huntTitle').textContent=`${enemyName()}'s Turn`;
  const btn=document.getElementById('endTurnBtn');btn.className="endturn garruk";btn.textContent="Resolve Enemy Turn ▸";
  document.getElementById('quickEndBtn').hidden=true;
  setBanner("garruk");render();renderContextualInputs();renderPhaseBar();checkEnd();
}
function showPlayerTurn(){
  S.phase="player";
  const cfg=modeConfig();
  const timing=currentTimingInfo();
  const decl=document.getElementById('declare');decl.className="declare player compact-declare";
  document.getElementById('declareTitle').textContent="Objective";
  document.getElementById('declareFlavor').textContent=`Defeat ${cfg.enemy} · ${S.loyalty} ${cfg.resource.toLowerCase()} remaining`;
  let mech="";
  if(S.spellLock)mech+=`<span class="lock-note">🔒 ${S.spellLock}</span>`;
  if(S.tokens.length>0 && timing.isCombat){
    const potentialBlockers=S.tokens.filter(t=>!t.attacking&&!t.summoningSick);
    const blockToughness=potentialBlockers.reduce((a,t)=>a+tokenToughness(t),0);
    const deathTouchers=potentialBlockers.filter(t=>t.kws.includes("Deathtouch")).length;
    const tappedCount=S.tokens.filter(t=>t.attacking).length;
    mech+=`<span class="combat-outlook">${potentialBlockers.length} blocker${potentialBlockers.length===1?"":"s"} · ${blockToughness} toughness${deathTouchers?` · ${deathTouchers} deathtouch`:""}${tappedCount?` · ${tappedCount} tapped out`:""}</span>`;
  }else if(S.tokens.length===0 && timing.isCombat){
    mech+=`<span class="combat-outlook clear">No blockers</span>`;
  }
  document.getElementById('declareMech').innerHTML=mech;
  document.getElementById('huntTitle').textContent=`Your Turn · ${timing.stepLabel}`;
  const btn=document.getElementById('endTurnBtn');
  if(S.playerStep===TURN_STEPS.UPKEEP||S.playerStep===TURN_STEPS.DRAW){
    btn.textContent="I Drew a Card ▸";
  } else if(timing.isMainPhase && S.playerStep===TURN_STEPS.PRECOMBAT_MAIN){
    btn.textContent="Continue to Combat ▸";
  } else if(timing.isCombat){
    btn.textContent="Resolve Combat ▸";
  } else if(timing.isMainPhase && S.playerStep===TURN_STEPS.POSTCOMBAT_MAIN){
    btn.textContent="End Turn ▸";
  } else {
    btn.textContent="Continue ▸";
  }
  btn.className="endturn";
  const quickEnd=document.getElementById('quickEndBtn');
  quickEnd.hidden=S.playerStep===TURN_STEPS.POSTCOMBAT_MAIN||S.playerStep===TURN_STEPS.END_STEP;
  setBanner("player");render();renderContextualInputs();renderPhaseBar();checkEnd();
}
function startPlayerTurn(){
  S.lastPlayerDamage=0;
  turnInput=null;
  S.playerStepIndex=0;
  S.playerStep=PLAYER_TURN_SEQUENCE[0].step;
  S.playerPhase=PLAYER_TURN_SEQUENCE[0].phase;
  advanceToNextActionableStep();
  showPlayerTurn();
}

/* ---------- phase advancement ---------- */
/**
 * Advances through steps that require no player input (untap, cleanup)
 * and stops at the next step where the player (or opponent) has priority.
 */
function advanceToNextActionableStep(){
  while(S.playerStepIndex < PLAYER_TURN_SEQUENCE.length){
    const entry=PLAYER_TURN_SEQUENCE[S.playerStepIndex];
    S.playerStep=entry.step;
    S.playerPhase=entry.phase;
    // Skip automatic steps and fold upkeep into the following draw confirmation.
    if(NO_PRIORITY_STEPS.has(entry.step)||entry.step===TURN_STEPS.UPKEEP){
      S.playerStepIndex++;
      continue;
    }
    // Stop here — this step grants priority
    break;
  }
}

/**
 * Move to the next step in the turn sequence.
 * Called when the player passes priority / finishes actions in the current step.
 * Returns true if the turn has ended (past cleanup).
 */
function advancePlayerStep(){
  S.playerStepIndex++;
  if(S.playerStepIndex >= PLAYER_TURN_SEQUENCE.length){
    // Turn is over
    return true;
  }
  advanceToNextActionableStep();
  if(S.playerStepIndex >= PLAYER_TURN_SEQUENCE.length) return true;
  // Check if the CPU reacts at this new step
  checkCpuReactionAtStep();
  return false;
}

/**
 * Jump directly to a specific step (e.g., skip to combat).
 * Used when the player explicitly moves to combat or ends their main phase.
 */
function jumpToStep(targetStep){
  const idx=PLAYER_TURN_SEQUENCE.findIndex(e=>e.step===targetStep);
  if(idx===-1) return false;
  S.playerStepIndex=idx;
  S.playerStep=PLAYER_TURN_SEQUENCE[idx].step;
  S.playerPhase=PLAYER_TURN_SEQUENCE[idx].phase;
  // Check if the CPU reacts at the step we jumped to
  checkCpuReactionAtStep();
  return true;
}

/**
 * Returns what types of spells/abilities are currently legal.
 * Useful for the CPU to know whether it can respond with an instant
 * or if a sorcery-speed effect would be legal for the active player.
 */
function currentTimingInfo(){
  return {
    phase: S.playerPhase,
    step: S.playerStep,
    stepLabel: STEP_LABELS[S.playerStep] || S.playerStep,
    canCastInstant: canCastAtTiming("instant", S.playerStep, true),
    canCastSorcery: canCastAtTiming("sorcery", S.playerStep, true),
    opponentCanRespond: !NO_PRIORITY_STEPS.has(S.playerStep),
    isMainPhase: SORCERY_SPEED_STEPS.has(S.playerStep),
    isCombat: S.playerPhase===TURN_PHASES.COMBAT
  };
}

function fmtCost(c){return c===0?"0":(c>0?("+"+c):(""+c));}
function setBanner(who){
  const b=document.getElementById('turnBanner');if(!b)return;
  if(who==="player"){
    const timing=currentTimingInfo();
    b.className="turn-banner player sr-only";document.getElementById('tbIco').textContent="🗡️";
    document.getElementById('tbText').textContent=`Your Turn (Turn ${S.turn})`;
    document.getElementById('tbSub').textContent=`— ${timing.stepLabel}`;
  }else{
    b.className="turn-banner garruk sr-only";document.getElementById('tbIco').textContent=modeConfig().icon;
    document.getElementById('tbText').textContent=`${enemyName()}'s Turn (Turn ${S.turn})`;document.getElementById('tbSub').textContent="— respond, then End Turn";
  }
}

/* =====================================================================
   CONTEXTUAL TURN INPUTS
   One inline form tracks only the state changes relevant to the current
   checkpoint. Values are applied together when the checkpoint resolves.
   ===================================================================== */
let turnInput=null;

function currentTurnInputKey(){
  return `${S.phase}:${S.turn}:${S.phase==="player"?S.playerStep:(S.pendingDecl||"enemy")}`;
}
function ensureTurnInput(){
  const key=currentTurnInputKey();
  if(turnInput&&turnInput.key===key)return turnInput;
  const isEnemy=S.phase==="garruk";
  const timing=isEnemy?null:currentTimingInfo();
  const initialCommander=isEnemy&&S.mode==="voltron"?voltronCommander():null;
  turnInput={
    key,
    incomingDamage:isEnemy?totalPower():0,
    incomingDamageAuto:isEnemy,
    commanderDamage:initialCommander&&initialCommander.attacking?tokenPower(initialCommander):0,
    commanderDamageAuto:isEnemy&&S.mode==="voltron",
    playerDeaths:0,
    creaturesPlayed:0,
    damageToEnemy:0,
    commanderDamageToEnemy:0,
    enemyDeaths:new Set(),
    blockedCreatures:new Set(),
    allowEnemyDeaths:S.tokens.length>0&&(isEnemy||timing.canCastInstant),
    slayOutcome:isEnemy&&S.pendingDecl==="slay"?"dies":null,
    slayToughness:1,
    wipeOutcome:isEnemy&&(S.pendingDecl==="wipe"||S.pendingDecl==="conclaveWipe")?"wiped":null,
    wipeSurvivors:0,
    moreOpen:false
  };
  return turnInput;
}
function clampTurnInput(key,value,max){
  const input=ensureTurnInput();
  let next=Math.max(0,parseInt(value,10)||0);
  if(max!=null)next=Math.min(max,next);
  input[key]=next;
  if(key==="incomingDamage")input.incomingDamageAuto=false;
  if(key==="commanderDamage")input.commanderDamageAuto=false;
}
function selectedEnemyDeathIndices(){
  return turnInput?.enemyDeaths?Array.from(turnInput.enemyDeaths).filter(i=>i>=0&&i<S.tokens.length):[];
}
function projectedEnemyAttackPower(input=ensureTurnInput()){
  const selected=new Set(selectedEnemyDeathIndices());
  const blocked=input?.blockedCreatures||new Set();
  if(selected.size===0&&blocked.size===0)return totalPower();
  const originalTokens=S.tokens;
  S.tokens=originalTokens.filter((_,index)=>!selected.has(index));
  let projected=totalPower();
  // Subtract power of blocked creatures (they still exist, damage just prevented)
  blocked.forEach(index=>{
    if(!selected.has(index)&&index<originalTokens.length){
      const t=originalTokens[index];
      if(t&&t.attacking)projected-=tokenPower(t);
    }
  });
  S.tokens=originalTokens;
  return Math.max(0,projected);
}
function projectedEnemyAttackerCount(input=ensureTurnInput()){
  const selected=new Set(selectedEnemyDeathIndices());
  const blocked=input?.blockedCreatures||new Set();
  return S.tokens.filter((token,index)=>token.attacking&&!selected.has(index)&&!blocked.has(index)).length;
}
function projectedCommanderDamagePower(input=ensureTurnInput()){
  if(S.mode!=="voltron")return 0;
  const selected=new Set(selectedEnemyDeathIndices());
  const blocked=input?.blockedCreatures||new Set();
  const commander=S.tokens.find((token,index)=>token.kind==="commander"&&token.attacking&&!selected.has(index)&&!blocked.has(index));
  return commander?tokenPower(commander):0;
}
function syncIncomingDamageToAttack(){
  if(S.phase!=="garruk"||!turnInput)return;
  const remainingPower=projectedEnemyAttackPower(turnInput);
  if(turnInput.incomingDamageAuto)turnInput.incomingDamage=remainingPower;
  else turnInput.incomingDamage=Math.min(turnInput.incomingDamage,remainingPower);
  if(S.mode==="voltron"){
    const commanderPower=projectedCommanderDamagePower(turnInput);
    if(turnInput.commanderDamageAuto)turnInput.commanderDamage=commanderPower;
    else turnInput.commanderDamage=Math.min(turnInput.commanderDamage,commanderPower,turnInput.incomingDamage);
  }
}
function canSelectEnemyCasualties(){
  return !!(turnInput&&turnInput.allowEnemyDeaths&&S.tokens.length);
}
function toggleEnemyCasualty(index){
  if(!canSelectEnemyCasualties())return;
  if(turnInput.enemyDeaths.has(index))turnInput.enemyDeaths.delete(index);
  else turnInput.enemyDeaths.add(index);
  syncIncomingDamageToAttack();
  renderContextualInputs();
}
/**
 * When clicking an attacking creature during enemy combat, present a choice:
 * block it (stop damage, creature lives) or kill it (goes to graveyard).
 * For non-attacking creatures or non-combat situations, fall back to toggle.
 */
async function handleCombatCreatureClick(index){
  if(!canSelectEnemyCasualties())return;
  const token=S.tokens[index];
  if(!token)return;

  // If already marked, clicking again resets it
  if(turnInput.enemyDeaths.has(index)||turnInput.blockedCreatures.has(index)){
    turnInput.enemyDeaths.delete(index);
    turnInput.blockedCreatures.delete(index);
    syncIncomingDamageToAttack();
    renderContextualInputs();
    return;
  }

  // Non-attacking creatures can only die (pre-combat removal), no block option
  if(!token.attacking){
    toggleEnemyCasualty(index);
    return;
  }

  // Show the combat choice popup
  const choice=await askCombatChoice(token);
  if(!choice)return; // cancelled

  if(choice==="blocked"){
    turnInput.blockedCreatures.add(index);
  }else{
    turnInput.enemyDeaths.add(index);
  }
  syncIncomingDamageToAttack();
  renderContextualInputs();
}
function applyEnemyCasualties(context){
  const indices=selectedEnemyDeathIndices().sort((a,b)=>b-a);
  if(indices.length===0)return;
  const destroyed=[],returned=[];
  indices.forEach(index=>{
    const outcome=removeEnemyBattlefieldToken(index);
    if(!outcome)return;
    if(outcome.commanderReturn)returned.push(outcome.commanderReturn);
    else{ destroyed.push(outcome.token.name); sendToEnemyGraveyard(outcome.token); }
  });
  if(destroyed.length)logP(`You destroy ${destroyed.join(", ")}${context?` ${context}`:""}.`);
  returned.forEach(message=>logP(message));
}
function reindexSelectedCasualties(removedIndex){
  if(!turnInput)return;
  if(turnInput.enemyDeaths){
    turnInput.enemyDeaths=new Set(Array.from(turnInput.enemyDeaths)
      .filter(index=>index!==removedIndex)
      .map(index=>index>removedIndex?index-1:index));
  }
  if(turnInput.blockedCreatures){
    turnInput.blockedCreatures=new Set(Array.from(turnInput.blockedCreatures)
      .filter(index=>index!==removedIndex)
      .map(index=>index>removedIndex?index-1:index));
  }
}

/* =====================================================================
   CPU OPPONENT REACTIONS — phase-aware responses during the player's turn
   The opponent (Garruk/Horde/Conclave) can react at specific priority
   windows during the player's turn. Each reaction is tagged with the
   phase/step it occurs in, enabling future stack validation.
   ===================================================================== */

/**
 * Determines what, if anything, the CPU opponent does at the current
 * player-turn step. Returns null if no reaction, or an object describing
 * the reaction for display and stack purposes.
 *
 * Reaction object shape:
 *   { type: "instant"|"ability", description: string, apply: function,
 *     phase: string, step: string, legal: boolean }
 */
function cpuReaction(){
  // CPU can only react when the player has priority and it's the player's turn
  if(S.phase!=="player") return null;
  const timing=currentTimingInfo();
  if(!timing.opponentCanRespond) return null;

  // The opponent is the non-active player — they can only use instant-speed effects
  const canAct=canCastAtTiming("instant", S.playerStep, false);
  if(!canAct) return null;

  const reaction=evaluateCpuResponse();
  if(!reaction) return null;

  // Tag the reaction with timing metadata
  reaction.phase=S.playerPhase;
  reaction.step=S.playerStep;
  reaction.stepLabel=timing.stepLabel;
  reaction.legal=true; // validated above
  reaction.timing="instant"; // CPU can only use instant-speed on opponent's turn
  return reaction;
}

/**
 * AI evaluation: should the CPU react right now?
 * This is the extensible decision point — modes can add their own logic.
 * Returns null (pass) or a reaction descriptor.
 */
function evaluateCpuResponse(){
  if(S.mode==="vanilla"||S.mode==="hard"){
    return evaluateGarrukReaction();
  }
  if(S.mode==="conclave"){
    return evaluateConclaveReaction();
  }
  // Horde mode has no reactive abilities (mindless attackers)
  return null;
}

/**
 * Garruk's instant-speed reactions during the player's turn.
 * Currently a framework — will fire when specific conditions are met
 * (e.g., player attacks with lethal and Garruk has a combat trick available).
 */
function evaluateGarrukReaction(){
  // Garruk reacts during combat if the incoming damage would be lethal
  // and he has enough loyalty for tricks
  if(S.playerStep===TURN_STEPS.COMBAT){
    if(S.loyalty<=8 && S.tokens.length>0 && S.player.creatures>=3){
      // Garruk could buff a blocker as a combat trick
      const unbuffed=S.tokens.filter(t=>!t.kws.includes("Deathtouch"));
      if(unbuffed.length>0){
        return {
          type:"ability",
          description:`${enemyName()} activates a combat trick — a creature gains deathtouch until end of turn.`,
          apply:()=>{
            const target=unbuffed[0];
            if(!target.kws.includes("Deathtouch")) target.kws.push("Deathtouch");
            logG(`reacts with a combat trick! A ${target.name} gains deathtouch. [${STEP_LABELS[S.playerStep]}]`);
            render();
          }
        };
      }
    }
  }
  return null;
}

/**
 * Conclave's instant-speed reactions during the player's turn.
 * Mirael's ward and Orryx's responses could trigger here.
 */
function evaluateConclaveReaction(){
  // Conclave creatures with ward trigger when targeted
  // Framework: if player tries to remove a warded creature, Conclave responds
  if(S.playerStep===TURN_STEPS.PRECOMBAT_MAIN || S.playerStep===TURN_STEPS.POSTCOMBAT_MAIN){
    // Orryx could respond to spells cast
    if(S.tokens.some(t=>t.unitId==="orryx")){
      // Placeholder for when the stack is implemented —
      // Orryx's restriction is already handled via spellLock
      return null;
    }
  }
  return null;
}

/**
 * Called when transitioning between player-turn steps.
 * Checks if the CPU wants to react and, if so, shows the reaction
 * before the player continues. Returns true if a reaction fires.
 */
function checkCpuReactionAtStep(){
  const reaction=cpuReaction();
  if(!reaction) return false;

  // Apply the reaction
  reaction.apply();
  // Log with phase context is handled inside apply()
  return true;
}

/* ---------- contextual form rendering ---------- */
function numberFieldHtml(key,label,help,max){
  const value=ensureTurnInput()[key]||0;
  const maxAttr=max==null?"":` data-max="${max}"`;
  return `<div class="context-field context-field-${key}">
    <div class="context-field-copy"><strong>${label}</strong>${help?`<span>${help}</span>`:""}</div>
    <div class="inline-stepper">
      <button type="button" data-delta-key="${key}" data-delta="-1"${maxAttr} aria-label="Decrease ${label}">−</button>
      <input type="number" min="0" value="${value}" data-number-key="${key}"${max==null?"":` max="${max}"`} aria-label="${label}">
      <button type="button" data-delta-key="${key}" data-delta="1"${maxAttr} aria-label="Increase ${label}">+</button>
    </div>
  </div>`;
}
function casualtyFieldHtml(label,help){
  const deathCount=selectedEnemyDeathIndices().length;
  const blockedCount=turnInput?.blockedCreatures?turnInput.blockedCreatures.size:0;
  const totalCount=deathCount+blockedCount;
  let countText="None";
  if(totalCount){
    const parts=[];
    if(deathCount)parts.push(`${deathCount} dying`);
    if(blockedCount)parts.push(`${blockedCount} blocked`);
    countText=parts.join(", ");
  }
  return `<div class="casualty-field${totalCount?" has-selection":""}">
    <div><strong>${label}</strong><span>${help}</span></div>
    <span class="casualty-count">${countText}</span>
  </div>`;
}
function outcomeChoiceHtml(key,options){
  const current=ensureTurnInput()[key];
  return `<div class="outcome-choice">${options.map(option=>`<button type="button" data-outcome-key="${key}" data-outcome-value="${option.value}" class="${current===option.value?"active":""}">${option.label}</button>`).join("")}</div>`;
}
function disclosureHtml(label,content){
  const open=ensureTurnInput().moreOpen?" open":"";
  return `<details class="context-disclosure" data-disclosure-key="moreOpen"${open}><summary><span>${label}</span><small>Optional</small></summary><div class="context-disclosure-body">${content}</div></details>`;
}
function orderedEnemyStep(number,title,body,modifier=""){
  return `<section class="resolution-step ${modifier}"><div class="resolution-step-h"><span>${number}</span><strong>${title}</strong></div><div class="resolution-step-b">${body}</div></section>`;
}
function renderEnemyTurnInputs(){
  const input=ensureTurnInput();
  const hasActionEffect=S.pendingDecl==="slay"||S.pendingDecl==="wipe"||S.pendingDecl==="conclaveWipe";
  const initialAttackers=S.tokens.filter(token=>token.attacking).length;
  const remainingPower=projectedEnemyAttackPower(input);
  const remainingAttackers=projectedEnemyAttackerCount(input);
  let step=1;
  let html='<div class="context-form enemy-form">';

  if(hasActionEffect){
    let actionHtml="";
    if(S.pendingDecl==="slay"){
      actionHtml=`<div class="context-section"><div class="context-section-title">Slay targets ${S.slayTarget}</div>${outcomeChoiceHtml("slayOutcome",[
        {value:"dies",label:"Target dies"},{value:"protected",label:"I protected it"}
      ])}${input.slayOutcome==="dies"?numberFieldHtml("slayToughness","Destroyed creature's toughness","Added to Garruk's loyalty."):""}</div>`;
    }else{
      const label=S.pendingDecl==="conclaveWipe"?"Prismatic Ruin":"Overrun the Weak";
      actionHtml=`<div class="context-section"><div class="context-section-title">${label}</div>${outcomeChoiceHtml("wipeOutcome",[
        {value:"wiped",label:"Resolve the board clear"},{value:"protected",label:"I protected my board"}
      ])}${input.wipeOutcome==="wiped"?numberFieldHtml("wipeSurvivors","Your creatures that survive","Defaults to zero.",S.player.creatures):""}</div>`;
    }
    html+=orderedEnemyStep(step++,"Resolve enemy effect",actionHtml,"enemy-effect");
  }

  if(input.allowEnemyDeaths){
    const selectedCount=selectedEnemyDeathIndices().length;
    const blockedCount=input.blockedCreatures?input.blockedCreatures.size:0;
    let noteText="";
    if(selectedCount||blockedCount){
      const parts=[];
      if(selectedCount)parts.push(`${selectedCount} dying`);
      if(blockedCount)parts.push(`${blockedCount} blocked`);
      noteText=`${parts.join(" · ")} · attack now ${remainingPower}`;
    }else{noteText="Tap creatures above to block or kill them";}
    const removalHtml=casualtyFieldHtml("Combat interactions","Tap attacking creatures above.")+`<div class="resolution-note">${noteText}</div>`;
    html+=orderedEnemyStep(step++,"Block / remove creatures",removalHtml,"precombat-removal");
  }

  if(initialAttackers>0){
    let combatHtml;
    if(remainingPower>0){
      const attackerList=S.tokens.filter((token,index)=>token.attacking&&!new Set(selectedEnemyDeathIndices()).has(index));
      const attackerNames=attackerList.map(t=>`<span class="atk-tag">${t.ico} ${t.name} (${tokenPower(t)}/${tokenToughness(t)})</span>`).join(" ");
      combatHtml=`<div class="context-summary danger-summary"><span class="context-summary-icon">⚔️</span><div><strong>${remainingAttackers} attacker${remainingAttackers===1?"":"s"} · ${remainingPower} incoming</strong><span>${input.incomingDamageAuto?"Auto-calculated after removals.":"Damage set manually."}</span></div></div>`;
      combatHtml+=`<div class="attacker-list">${attackerNames}</div>`;
      combatHtml+=numberFieldHtml("incomingDamage","Damage reaching you","Adjust for blocks or prevention.",remainingPower);
      const commanderPower=projectedCommanderDamagePower(input);
      if(commanderPower>0)combatHtml+=numberFieldHtml("commanderDamage","Commander damage reaching you","Only unblocked damage from Rukha counts toward 21.",Math.min(commanderPower,input.incomingDamage));
      combatHtml+=numberFieldHtml("playerDeaths","Your creatures that died","Reduces your creature total.",S.player.creatures);
    }else{
      combatHtml=`<div class="context-summary"><span class="context-summary-icon">✓</span><div><strong>No attackers remain</strong><span>Combat deals no damage.</span></div></div>`;
    }
    html+=orderedEnemyStep(step++,"Resolve combat",combatHtml,"enemy-combat");
  }else if(!hasActionEffect){
    html+=orderedEnemyStep(step++,"Combat","<div class=\"context-summary\"><span class=\"context-summary-icon\">✓</span><div><strong>No attack this turn</strong><span>Continue when ready.</span></div></div>","enemy-combat");
  }

  html+=disclosureHtml("More board changes",numberFieldHtml("creaturesPlayed","Creatures you added","Flash, tokens, or returned creatures."));
  html+='</div>';
  document.getElementById('respTitle').textContent="Resolve in order";
  document.getElementById('respGrid').innerHTML=html;
  document.getElementById('respHint').textContent="Complete each step from top to bottom.";
}
function renderPlayerTurnInputs(){
  const input=ensureTurnInput();
  const timing=currentTimingInfo();
  const resource=modeConfig().resource.toLowerCase();
  let html='<div class="context-form player-form">';
  if(S.playerStep===TURN_STEPS.UPKEEP||S.playerStep===TURN_STEPS.DRAW){
    html+=`<div class="context-summary draw-summary"><span class="context-summary-icon">🃏</span><div><strong>Resolve upkeep, then draw</strong><span>When finished, confirm that you drew a card.</span></div></div>`;
    const changes=numberFieldHtml("creaturesPlayed","Creatures added","Flash, tokens, or returned creatures.")+(input.allowEnemyDeaths?casualtyFieldHtml("Enemy creatures removed","Select cards above."):"");
    html+=disclosureHtml("Record board changes",changes);
  }else if(timing.isMainPhase){
    html+=numberFieldHtml("creaturesPlayed","Creatures added","Cast, created, or returned.");
    if(input.allowEnemyDeaths)html+=casualtyFieldHtml("Enemy creatures removed","Select cards above.");
  }else if(timing.isCombat){
    html+=`<div class="context-summary combat-summary"><span class="context-summary-icon">⚔️</span><div><strong>Final combat result</strong><span>Enter the outcome.</span></div></div>`;
    html+=numberFieldHtml("damageToEnemy",`Damage dealt to ${resource}`,"Damage that reached the enemy resource.");
    if(S.mode==="voltron")html+=numberFieldHtml("commanderDamageToEnemy","Commander damage to Rukha","Unblocked damage from your commander (toward 21).",input.damageToEnemy||undefined);
    html+=numberFieldHtml("playerDeaths","Your creatures that died","Reduces your creature total.",S.player.creatures);
    if(input.allowEnemyDeaths)html+=casualtyFieldHtml("Enemy creatures that died","Select cards above.");
    html+=disclosureHtml("More combat changes",numberFieldHtml("creaturesPlayed","Creatures added","Flash, tokens, or returned creatures."));
  }else{
    html+=`<div class="context-summary"><span class="context-summary-icon">✓</span><div><strong>No input needed</strong><span>Continue when ready.</span></div></div>`;
  }
  html+='</div>';
  document.getElementById('respTitle').textContent=timing.isCombat?"Combat result":timing.isMainPhase?"Board changes":(S.playerStep===TURN_STEPS.UPKEEP||S.playerStep===TURN_STEPS.DRAW)?"Upkeep + Draw":"Current step";
  document.getElementById('respGrid').innerHTML=html;
  document.getElementById('respHint').textContent=input.allowEnemyDeaths?"Select enemy casualties on the battlefield.":"";
}
function wireContextualInputs(){
  const grid=document.getElementById('respGrid');
  grid.querySelectorAll('[data-delta-key]').forEach(button=>{
    button.onclick=()=>{
      const key=button.dataset.deltaKey;
      const max=button.dataset.max==null?null:parseInt(button.dataset.max,10);
      clampTurnInput(key,(ensureTurnInput()[key]||0)+parseInt(button.dataset.delta,10),max);
      renderContextualInputs();
    };
  });
  grid.querySelectorAll('[data-number-key]').forEach(field=>{
    field.onchange=()=>{
      const max=field.max===""?null:parseInt(field.max,10);
      clampTurnInput(field.dataset.numberKey,field.value,max);
      field.value=ensureTurnInput()[field.dataset.numberKey];
    };
  });
  grid.querySelectorAll('[data-toggle-key]').forEach(toggle=>{
    toggle.onchange=()=>{
      ensureTurnInput()[toggle.dataset.toggleKey]=toggle.checked;
      renderContextualInputs();
    };
  });
  grid.querySelectorAll('[data-outcome-key]').forEach(button=>{
    button.onclick=()=>{
      ensureTurnInput()[button.dataset.outcomeKey]=button.dataset.outcomeValue;
      renderContextualInputs();
    };
  });
  grid.querySelectorAll('[data-disclosure-key]').forEach(details=>{
    details.ontoggle=()=>{ensureTurnInput()[details.dataset.disclosureKey]=details.open;};
  });
}
function renderContextualInputs(){
  ensureTurnInput();
  if(S.phase==="garruk")renderEnemyTurnInputs();
  else renderPlayerTurnInputs();
  wireContextualInputs();
  renderTokens();
  document.getElementById('endTurnBtn').disabled=false;
}

/* ---------- resolve ---------- */
function resolveEnemyTurnInputs(input){
  // Enemy abilities resolve before combat.
  if(S.pendingDecl==="slay"){
    if(input.slayOutcome==="protected"){
      logP("You protect the targeted creature — Slay is negated after Garruk spends 10 loyalty.");
    }else if(S.player.creatures>0){
      adjust("creatures",-1);
      gainLoyalty(input.slayToughness);
      logP(`The targeted creature dies; Garruk gains ${input.slayToughness} loyalty → ${S.loyalty}.`);
    }
  }
  if(S.pendingDecl==="wipe"||S.pendingDecl==="conclaveWipe"){
    const label=S.pendingDecl==="conclaveWipe"?"Prismatic Ruin":"Overrun the Weak";
    if(input.wipeOutcome==="protected")logP(`Your creatures survive ${label}.`);
    else{
      setStat("creatures",input.wipeSurvivors);
      logP(`${label} resolves — ${input.wipeSurvivors} of your creature(s) survive.`);
    }
  }

  // Selected enemy creatures leave before attackers are counted. Recalculate here
  // after removal so Conclave auras and thresholds affect the actual combat total.
  applyEnemyCasualties("before combat");
  const remainingAttackPower=totalPower();
  const damage=Math.min(input.incomingDamage,remainingAttackPower);
  const commander=voltronCommander();
  const commanderCombatDamage=S.mode==="voltron"&&commander&&commander.attacking
    ?Math.min(input.commanderDamage||0,damage,tokenPower(commander)):0;
  if(remainingAttackPower>0){
    if(damage>0)adjust("life",-damage);
    if(commanderCombatDamage>0){
      S.commanderDamage+=commanderCombatDamage;
      logG(`${commander.name} deals ${commanderCombatDamage} commander damage (${S.commanderDamage}/21).`);
    }
    if(damage>0)logP(`You take ${damage} combat damage. Life → ${S.player.life}.`);
    else logP("No combat damage gets through.");
    if(input.playerDeaths>0){
      adjust("creatures",-input.playerDeaths);
      logP(`${input.playerDeaths} of your creature(s) died in combat.`);
    }
  }else if(S.attackPower>0){
    logP("No enemy attackers remain, so combat deals no damage.");
  }
  if(input.creaturesPlayed>0){
    adjust("creatures",input.creaturesPlayed);
    logP(`You add ${input.creaturesPlayed} creature(s) to your board during the enemy turn.`);
  }
}
function resolvePlayerTurnInputs(input){
  const timing=currentTimingInfo();
  if(input.creaturesPlayed>0){
    adjust("creatures",input.creaturesPlayed);
    logP(`You add ${input.creaturesPlayed} creature(s) to your board.`);
  }
  if(timing.isCombat){
    if(input.damageToEnemy>0){
      damageLoyalty(input.damageToEnemy);
      logP(`You deal ${input.damageToEnemy} to ${modeConfig().resource.toLowerCase()} → ${S.loyalty}.`);
    }
    if(S.mode==="voltron"&&input.commanderDamageToEnemy>0){
      const cmdrDmg=Math.min(input.commanderDamageToEnemy,input.damageToEnemy);
      S.commanderDamageToEnemy+=cmdrDmg;
      logP(`Your commander deals ${cmdrDmg} commander damage to ${enemyName()} (${S.commanderDamageToEnemy}/21).`);
    }
    if(input.playerDeaths>0){
      adjust("creatures",-input.playerDeaths);
      logP(`${input.playerDeaths} of your creature(s) die in combat.`);
    }
    applyEnemyCasualties("in combat");
  }else if(timing.isMainPhase){
    applyEnemyCasualties(`during ${timing.stepLabel}`);
  }else if(timing.canCastInstant){
    applyEnemyCasualties(`during ${timing.stepLabel}`);
  }
}
function resolveTurn(){
  if(!S)return;
  snapshot();
  const isEnemyTurn=S.phase==="garruk";
  const input=ensureTurnInput();

  if(isEnemyTurn){
    resolveEnemyTurnInputs(input);
    turnInput=null;
    render();
    if(checkEnd())return;
    S.tokens.forEach(t=>{t.summoningSick=false;});
    logSys(`— ${enemyName()}'s turn ${S.turn} ends —`);
    startPlayerTurn();save();
    return;
  }

  resolvePlayerTurnInputs(input);
  turnInput=null;
  render();
  if(checkEnd())return;
  const timing=currentTimingInfo();

  if(S.playerStep===TURN_STEPS.DRAW){
    advancePlayerStep();
    showPlayerTurn();save();
    return;
  }
  if(S.playerStep===TURN_STEPS.PRECOMBAT_MAIN){
    jumpToStep(TURN_STEPS.COMBAT);
    showPlayerTurn();save();
    return;
  }
  if(timing.isCombat){
    advancePlayerStep();
    showPlayerTurn();save();
    return;
  }
  if(S.playerStep===TURN_STEPS.POSTCOMBAT_MAIN||S.playerStep===TURN_STEPS.END_STEP){
    logSys(`— Your turn ${S.turn} ends —`);
    S.turn++;
    if(checkEnd())return;
    startGarrukTurn();save();
    return;
  }

  const turnEnded=advancePlayerStep();
  if(turnEnded){
    logSys(`— Your turn ${S.turn} ends —`);
    S.turn++;
    if(checkEnd())return;
    startGarrukTurn();save();
  }else{
    showPlayerTurn();save();
  }
}

function endPlayerTurnNow(){
  if(!S||S.phase!=="player"||gameOver)return;
  snapshot();
  const input=ensureTurnInput();
  resolvePlayerTurnInputs(input);
  turnInput=null;
  render();
  if(checkEnd())return;
  logSys(`— Your turn ${S.turn} ends —`);
  S.turn++;
  if(checkEnd())return;
  startGarrukTurn();
  save();
}

/* =====================================================================
   WIN / LOSE
   ===================================================================== */
function checkPhase(){
  if(S.mode!=="vanilla"&&S.mode!=="hard"){S.enraged=false;return;}
  const was=S.enraged;S.enraged=S.loyalty<=8&&S.loyalty>0;
  if(S.enraged&&!was)logBig(`${enemyName()} enters an ENRAGED phase!`);
}
function checkEnd(){
  const won=S.mode==="horde"?S.loyalty<=0&&S.tokens.length===0:S.loyalty<=0;
  if(won){endGame(true);return true;}
  if(S.mode==="voltron"&&S.commanderDamageToEnemy>=21){endGame(true,"Your commander dealt 21 commander damage to "+enemyName()+".");return true;}
  if(S.mode==="voltron"&&S.commanderDamage>=21){endGame(false,`${enemyName()} dealt 21 commander damage.`);return true;}
  if(S.player.life<=0){endGame(false,"Your life total hit 0.");return true;}
  return false;
}
function endGame(won,reason){
  if(gameOver)return;gameOver=true;save();
  const m=document.getElementById('modal'),o=document.getElementById('overlay'),cfg=modeConfig();
  if(won){
    const victory=reason||( S.mode==="horde"?"The final corpse falls and the Horde deck is empty.":`${cfg.enemy}'s ${cfg.resource.toLowerCase()} reaches 0.`);
    m.className="modal";m.innerHTML=`<div class="big-ico">🏆</div><h2>Victory!</h2><p>${victory}<br>You survived <b>${S.turn}</b> turns of ${cfg.name}.</p><button class="cta" onclick="restart()">Choose Another Encounter</button>`;
  }else{
    m.className="modal lose";m.innerHTML=`<div class="big-ico">💀</div><h2>Defeated</h2><p>${reason||`${cfg.enemy} defeated you.`}<br><br>${cfg.resource} remaining: <b>${S.loyalty}</b>.</p><button class="cta" onclick="restart()">Try Another Encounter</button>`;
  }
  o.classList.add("show");
}

/* ---------- toast ---------- */
let toastT;
function toast(msg){
  let el=document.getElementById('toast');
  if(!el){ el=document.createElement('div'); el.id='toast'; el.setAttribute('role','status'); el.setAttribute('aria-live','polite'); el.style.cssText="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e1810;border:1px solid var(--gold-dim);color:var(--gold);padding:10px 18px;border-radius:8px;z-index:99;font-size:13px;box-shadow:0 6px 20px rgba(0,0,0,.5);transition:opacity .3s;"; document.body.appendChild(el); }
  el.textContent=msg; el.style.opacity="1"; clearTimeout(toastT); toastT=setTimeout(()=>el.style.opacity="0",1800);
}

/* =====================================================================
   RENDER
   ===================================================================== */
function modeHelpHtml(){
  if(S.mode==="voltron")return `<div class="tt-header">🔥 Commander Rival: Gruul Voltron</div><div class="tt-passive"><span class="tt-cost tt-free">40 life</span> Rukha is a Commander opponent. Reduce her life to 0, while avoiding a 21 commander-damage defeat.</div><div class="tt-ability"><b>Finite mana deck</b><br>Rukha uses a virtual 99-card deck with 37 lands, 10 normal ramp sources, and 1 rare fast-mana rock. Drawn sources leave the deck and only become mana after they are played.</div><div class="tt-ability"><b>Command zone</b><br>Rukha is cast once her drawn mana sources reach her current cost. When she leaves the battlefield, she returns to the command zone and her next cast costs 2 more.</div><div class="tt-ability"><b>Voltron plan</b><br>With spare mana, Rukha adds gear for permanent power, toughness, trample, and later ward.</div><div class="tt-note">Remove Rukha before combat to stop the attack. If commander damage gets through, record only the unblocked portion.</div>`;
  if(S.mode==="hard")return `<div class="tt-header">🔥 Hard Garruk</div><div class="tt-passive"><span class="tt-cost tt-free">Scaling</span> Loyalty income increases every two turns: +2, +3, +4, up to +6.</div><div class="tt-ability"><span class="tt-cost">[0]</span><b>Summon Wolf</b><br>2/2 through turn 4; every new Wolf is 4/4 from turn 5 onward.</div><div class="tt-ability"><span class="tt-cost tt-gain">[+4]</span><b>Rip and Tear</b><br>+1/+0, deathtouch, and +4 loyalty.</div><div class="tt-note">Garruk normally goes wide, but Hard mode checks board deficits first. With enough loyalty it uses Slay while keeping 8–10 loyalty, or Overrun while keeping at least 8.</div>`;
  if(S.mode==="horde")return `<div class="tt-header">☠️ Horde Mode</div><div class="tt-passive"><span class="tt-cost tt-free">60 cards</span> Each revealed creature and each damage dealt to the Horde mills its deck.</div><div class="tt-ability"><b>Automatic waves</b><br>Wave size grows every two turns. Horde creatures have haste and attack each turn.</div><div class="tt-ability"><b>Events</b><br>Grave Frenzy boosts attacks; Dread Edict forces a sacrifice.</div><div class="tt-note">You win only when the Horde deck is empty and no Horde creatures remain.</div>`;
  if(S.mode==="conclave")return `<div class="tt-header">✦ Aether Conclave</div><div class="tt-passive"><span class="tt-cost tt-free">Random roster</span> Unique named creatures enter in a different order each game.</div><div class="tt-ability"><b>Shared network</b><br>War Song, Bulwark, ward, spell locks, and threshold bonuses disappear when their key creature dies.</div><div class="tt-ability"><b>Vaelora</b><br>Builds Ascension at 3+ allies and casts Prismatic Ruin against wide player boards.</div><div class="tt-note">Identify and remove the key creature holding each synergy together.</div>`;
  return `<div class="tt-header">🐺 Easy Garruk</div><div class="tt-passive"><span class="tt-cost tt-free">Passive</span> +2 loyalty at the start of each turn.</div><div class="tt-ability"><span class="tt-cost">[0]</span><b>Summon Wolf</b><br>Put a 2/2 Wolf onto the battlefield.</div><div class="tt-ability"><span class="tt-cost tt-gain">[+4]</span><b>Rip and Tear</b><br>+1/+0, deathtouch, and +4 loyalty.</div><div class="tt-ability"><span class="tt-cost tt-spend">[-10]</span><b>Slay</b> — destroy a creature.</div><div class="tt-ability"><span class="tt-cost tt-spend">[-25]</span><b>Overrun the Weak</b> — clear the player's board.</div><div class="tt-note">Baseline encounter: Wolves remain 2/2 for the entire game.</div>`;
}
function updateModePresentation(){
  const cfg=modeConfig();
  document.getElementById('brandTitle').textContent="Magic No Gathering";
  document.getElementById('brandSub').textContent=cfg.name;
  document.getElementById('modePill').textContent=cfg.name;
  document.getElementById('boardIcon').textContent=cfg.boardIcon;
  document.getElementById('boardTitle').textContent=cfg.boardTitle;
  document.getElementById('enemyName').textContent=cfg.enemy;
  document.getElementById('resourceLabel').textContent=cfg.resource;
  document.getElementById('creatureFieldLabel').textContent="Enemy creatures";
  document.getElementById('portraitTooltip').innerHTML=modeHelpHtml();
  document.getElementById('addWolfBtn').textContent=S.mode==="conclave"?"+ Conclave":S.mode==="horde"?"+ Horde":S.mode==="voltron"?"+ Drawn Ramp":"+ Wolf";
}
function render(){
  if(!S)return;
  updateModePresentation();
  document.getElementById('turnNum').textContent=S.turn;
  document.getElementById('phasePill').textContent=S.phase==="garruk"?`${enemyName()}'s Turn`:"Your Turn";
  document.getElementById('phasePill').classList.toggle('active',S.phase==="player");
  document.getElementById('loyaltyNum').textContent=S.loyalty;
  const baseline=modeConfig().startResource;
  const pct=Math.max(0,Math.min(100,(S.loyalty/Math.max(baseline,S.maxLoyaltySeen||baseline))*100));
  const fill=document.getElementById('loyaltyFill');fill.style.width=pct+"%";
  fill.style.background=S.enraged?"linear-gradient(90deg,#7a1f1f,#c0392b)":S.mode==="voltron"?"linear-gradient(90deg,#9c3d1d,#d9b45a)":"linear-gradient(90deg,#2e7d32,#6faf52)";
  const port=document.getElementById('portrait'),ptag=document.getElementById('phaseTag'),board=document.getElementById('board');
  if(S.enraged){port.classList.add('enraged');board.classList.add('enraged');document.getElementById('portraitGlyph').textContent="😤";ptag.textContent="⚡ Enraged";ptag.classList.add('enraged');}
  else{port.classList.remove('enraged');board.classList.remove('enraged');document.getElementById('portraitGlyph').textContent=modeConfig().icon;ptag.textContent=S.mode==="horde"?"Wave Phase":S.mode==="conclave"?"Resonance Phase":S.mode==="voltron"?"Commander Plan":"Hunt Phase";ptag.classList.remove('enraged');}
  const commanderStatus=document.getElementById('commanderStatus');
  if(S.mode==="voltron"){
    commanderStatus.hidden=false;
    const commander=voltronCommander();
    const deck=S.voltronDeck||newVoltronDeck();
    const rampInPlay=(S.voltronRampInPlay||0)+(S.voltronExplosiveInPlay||0);
    const handSize=(S.voltronTypedHand?.length||0)+(S.voltronHand?.lands||0)+(S.voltronHand?.ramp||0)+(S.voltronHand?.explosive||0);
    const protectionInHand=(S.voltronTypedHand||[]).filter(c=>c.ref?.category==="protection").length;
    commanderStatus.innerHTML=`<span>${commander?"On field":"Command zone"}</span><span>Tax +${S.commanderTax}</span><span>${S.voltronLandsInPlay||0} lands + ${rampInPlay} ramp</span><span>Hand ${handSize}</span>${protectionInHand?`<span>🛡 ${protectionInHand}</span>`:""}<span>Cmdr dmg dealt ${S.commanderDamage}/21</span><span>Cmdr dmg taken ${S.commanderDamageToEnemy}/21</span>`;
  }else{commanderStatus.hidden=true;commanderStatus.textContent="";}
  // Graveyard counter
  const gyBtn=document.getElementById('graveyardBtn');
  const gyCount=S.enemyGraveyardCount||0;
  if(gyBtn){gyBtn.hidden=gyCount===0;document.getElementById('graveyardCount').textContent=gyCount;}
  const exBtn=document.getElementById('exileBtn');
  const exCount=S.enemyExileCount||0;
  if(exBtn){exBtn.hidden=exCount===0;document.getElementById('exileCount').textContent=exCount;}
  document.getElementById('pLife').textContent=S.player.life;document.getElementById('pCreatures').textContent=S.player.creatures;
  document.getElementById('lifeStat').classList.toggle('warn',S.player.life<=10);
  const cmdrLifeStat=document.getElementById('cmdrLifeStat');
  if(S.mode==="voltron"){
    cmdrLifeStat.hidden=false;
    const cmdrLifeLeft=commanderLifeRemaining();
    document.getElementById('pCmdrLife').textContent=cmdrLifeLeft;
    cmdrLifeStat.classList.toggle('warn',cmdrLifeLeft<=7);
  }else{
    cmdrLifeStat.hidden=true;
  }
  const readyCount=S.tokens.filter(t=>!t.summoningSick).length,sickCount=S.tokens.length-readyCount;
  const attackerCount=S.tokens.filter(t=>t.attacking).length;
  const holdingBackCount=readyCount-attackerCount;
  let atkText=attackerCount?`Attacking: ${attackerCount} for ${totalPower()}`:"";
  if(holdingBackCount>0)atkText+=`${atkText?" · ":""}${holdingBackCount} holding back`;
  if(sickCount)atkText+=`${atkText?" · ":""}${sickCount} summoning sick`;
  document.getElementById('atkNote').textContent=atkText;
  renderTokens();updateUndoBtn();
}
function renderTokens(){
  const c=document.getElementById('tokens');
  if(S.tokens.length===0){c.innerHTML=`<div class="empty-field">Battlefield clear</div>`;return;}
  c.innerHTML="";
  const casualtyMode=canSelectEnemyCasualties();
  S.tokens.forEach((t,i)=>{
    const d=document.createElement('div');
    const selectedCasualty=casualtyMode&&turnInput.enemyDeaths.has(i);
    const isBlocked=casualtyMode&&turnInput.blockedCreatures&&turnInput.blockedCreatures.has(i);
    const isAttacking=!!t.attacking;
    d.className="card"+(t.kind==="commander"?" commander":t.kind==="synergy"?" synergy":t.kind==="horde"?" horde":t.kind==="beast"?" beast":t.kind==="voltron-creature"?" voltron-creature":"")+(t.summoningSick?" sick":"")+(isAttacking?" tapped":"")+(casualtyMode?" casualty-selectable":"")+(selectedCasualty?" casualty-selected":"")+(isBlocked?" casualty-blocked":"");
    const p=tokenPower(t),toughness=tokenToughness(t);
    const primaryLabel=casualtyMode?(selectedCasualty||isBlocked?`Reset ${t.name}`:`Choose block or kill for ${t.name}`):`View details for ${t.name}`;
    const statusBadge=selectedCasualty?'<div class="c-casualty">✓ Dies</div>':isBlocked?'<div class="c-blocked">🛡️ Blocked</div>':isAttacking?'<div class="c-atk">⚔️</div>':t.summoningSick?'<div class="c-sick">💤</div>':'';
    d.innerHTML=`
      ${statusBadge}
      <button type="button" class="card-main" aria-label="${primaryLabel}"${casualtyMode?` aria-pressed="${selectedCasualty||isBlocked?"true":"false"}"`:""}>
        <span class="c-name"><span>${t.name}</span><span class="mana">${t.kind==="commander"?"⚜":t.kind==="voltron-creature"||t.kind==="voltron-support"?"🌲":t.kind==="synergy"?"✦":t.kind==="horde"?"☠":"🌲"}</span></span>
        <span class="c-art">${t.ico}</span>
        <span class="c-pt">${p}/${toughness}</span>
      </button>
      ${casualtyMode?`<button type="button" class="c-info" aria-label="View details for ${t.name}" title="View details">i</button>`:""}
      <button type="button" class="c-remove" title="Remove ${t.name}" aria-label="Remove ${t.name}">↗</button>`;
    d.querySelector('.card-main').onclick=()=>casualtyMode?handleCombatCreatureClick(i):showTokenDetails(i);
    const info=d.querySelector('.c-info');if(info)info.onclick=()=>showTokenDetails(i);
    d.querySelector('.c-remove').onclick=()=>manualRemove(i);
    c.appendChild(d);
  });
}
async function manualRemove(i){
  const token=S.tokens[i];
  if(!token)return;

  // Commanders always go back to command zone, no choice needed
  if(S.mode==="voltron"&&token.kind==="commander"){
    const outcome=removeEnemyBattlefieldToken(i);if(!outcome)return;
    reindexSelectedCasualties(i);
    logP(outcome.commanderReturn);
    render();
    if(turnInput){
      const timing=S.phase==="player"?currentTimingInfo():null;
      turnInput.allowEnemyDeaths=S.tokens.length>0&&(S.phase==="garruk"||timing.canCastInstant);
      syncIncomingDamageToAttack();
      renderContextualInputs();
    }
    checkEnd();
    return;
  }

  // Ask where the card goes
  const dest=await askRemovalDestination(token);
  if(!dest)return; // cancelled

  const outcome=removeEnemyBattlefieldToken(i);if(!outcome)return;
  reindexSelectedCasualties(i);
  if(dest==="exile"){
    sendToEnemyExile(outcome.token);
    logP(`You exile ${outcome.token.name}.`);
  }else{
    sendToEnemyGraveyard(outcome.token);
    logP(`You destroy ${outcome.token.name}.`);
  }
  render();
  if(turnInput){
    const timing=S.phase==="player"?currentTimingInfo():null;
    turnInput.allowEnemyDeaths=S.tokens.length>0&&(S.phase==="garruk"||timing.canCastInstant);
    syncIncomingDamageToAttack();
    renderContextualInputs();
  }
  checkEnd();
}

/* ---------- phase bar ---------- */
function renderPhaseBar(){
  const wrap=document.getElementById('phaseBarWrap');
  if(!wrap) return;
  // Only show during the player's turn
  if(S.phase!=="player"){wrap.style.display="none";return;}
  wrap.style.display="block";

  const bar=document.getElementById('phaseBar');
  const label=document.getElementById('phaseBarLabel');
  const timing=currentTimingInfo();

  // Build the step indicators grouped by phase with dividers between phases
  let html="";
  let lastPhase=null;
  PLAYER_TURN_SEQUENCE.forEach((entry,i)=>{
    // Untap and cleanup are automatic; upkeep is combined into the draw confirmation.
    if(NO_PRIORITY_STEPS.has(entry.step)||entry.step===TURN_STEPS.UPKEEP) return;
    // Add a divider between phase groups
    if(lastPhase && entry.phase!==lastPhase){
      html+=`<div class="pb-divider"></div>`;
    }
    lastPhase=entry.phase;
    const isCombatStep=(entry.phase===TURN_PHASES.COMBAT);
    const isActive=(entry.step===S.playerStep);
    const isDone=(i<S.playerStepIndex);
    let cls="pb-step";
    if(isCombatStep) cls+=" combat";
    if(isActive) cls+=" active";
    else if(isDone) cls+=" done";
    html+=`<div class="${cls}" title="${STEP_LABELS[entry.step]}"></div>`;
  });
  bar.innerHTML=html;

  // Label row: phase name | step name | timing indicator
  const phaseNames={
    [TURN_PHASES.BEGINNING]:"Beginning",
    [TURN_PHASES.PRECOMBAT_MAIN]:"Main Phase 1",
    [TURN_PHASES.COMBAT]:"Combat",
    [TURN_PHASES.POSTCOMBAT_MAIN]:"Main Phase 2",
    [TURN_PHASES.ENDING]:"Ending"
  };
  let timingCls="none", timingText="No Priority";
  if(timing.canCastSorcery){timingCls="sorcery";timingText="Sorcery + Instant";}
  else if(timing.canCastInstant){timingCls="instant";timingText="Instant Only";}

  label.innerHTML=`
    <span class="pbl-phase">${phaseNames[S.playerPhase]||S.playerPhase}</span>
    <span class="pbl-step">${timing.stepLabel}</span>
    <span class="pbl-timing ${timingCls}">${timingText}</span>`;
}

function renderLog(){
  if(!S)return;
  const l=document.getElementById('log'); if(!l)return; l.innerHTML="";
  S.log.forEach(e=>{ const d=document.createElement('div'); d.className="log-e "+e.cls; d.innerHTML=(e.who?`<span class="who">${e.who} · T${e.turn}</span>`:"")+e.msg; l.appendChild(d); });
  const cnt=document.getElementById('logCount'); if(cnt) cnt.textContent=S.log.length;
}

/* =====================================================================
   SETUP / INIT
   ===================================================================== */
function showSetup(){
  // If the commander module is loaded, it provides the split menu
  if(window._commanderMain){
    window._commanderMain.showSetup();
    return;
  }
  // Fallback: original setup (should not normally be reached)
  const m=document.getElementById('modal'),o=document.getElementById('overlay');
  m.className="modal setup-modal";
  m.innerHTML=`
    <div class="big-ico">🎴</div><h2>Choose an encounter</h2>
    <p>Five solo modes. You start at 40 life.</p>
    <div class="mode-grid" role="radiogroup" aria-label="Encounter mode">
      <label class="mode-option"><input type="radio" name="encounterMode" value="vanilla" checked><div class="mode-card"><div class="mode-title">🐺 Easy Garruk</div><div class="mode-desc">Steady Wolves and cautious removal.</div><span class="mode-tag">Baseline</span></div></label>
      <label class="mode-option"><input type="radio" name="encounterMode" value="hard"><div class="mode-card"><div class="mode-title">🔥 Hard Garruk</div><div class="mode-desc">Scaling Wolves and aggressive removal.</div><span class="mode-tag">Escalating</span></div></label>
      <label class="mode-option"><input type="radio" name="encounterMode" value="horde"><div class="mode-card"><div class="mode-title">🧟 Horde Mode</div><div class="mode-desc">Survive growing waves and empty the deck.</div><span class="mode-tag">Survival</span></div></label>
      <label class="mode-option"><input type="radio" name="encounterMode" value="conclave"><div class="mode-card"><div class="mode-title">✦ Aether Conclave</div><div class="mode-desc">Break a randomized network of synergies.</div><span class="mode-tag">Puzzle</span></div></label>
      <label class="mode-option"><input type="radio" name="encounterMode" value="voltron"><div class="mode-card commander-mode"><div class="mode-title">🪓 Commander Rival: Gruul Voltron</div><div class="mode-desc">Stop a ramping commander before 21 commander damage gets through.</div><span class="mode-tag">Commander</span></div></label>
    </div>
    <button class="cta" onclick="beginGame()">Begin Encounter</button>`;
  o.classList.add("show");
}
function beginGame(){
  const chosen=document.querySelector('input[name="encounterMode"]:checked');
  const mode=chosen?chosen.value:"vanilla";
  S=freshState(mode);turnInput=null;gameOver=false;undoStack=[];updateUndoBtn();
  document.getElementById('overlay').classList.remove("show");
  logBig(`${modeConfig().name} begins. ${enemyName()} enters with ${S.loyalty} ${modeConfig().resource.toLowerCase()}.`);
  logSys(`${modeConfig().summary} Starting life: ${S.player.life}.`);
  startGarrukTurn();
}
async function confirmRestart(){const ok=await askConfirm("Restart encounter?","This clears the current encounter and returns to mode selection. This cannot be undone.","Restart");if(ok)restart();}
function restart(){safeRemove(SAVE_KEY);safeRemove(LEGACY_SAVE_KEY);S=null;turnInput=null;undoStack=[];gameOver=false;document.getElementById('overlay').classList.remove("show");document.getElementById('inputOverlay').classList.remove("show");document.getElementById('logOverlay').classList.remove("show");showSetup();}
function manualAddEnemy(){
  let added=true;
  if(S.mode==="horde")addHordeUnit();
  else if(S.mode==="conclave")nextConclaveUnit();
  else if(S.mode==="voltron")added=addVoltronSupport();
  else addWolf();
  if(!added){toast("No drawn ramp source is available");return;}
  logSys(`Creature added manually to ${enemyName()}'s battlefield.`);render();
  if(turnInput){
    const timing=S.phase==="player"?currentTimingInfo():null;
    turnInput.allowEnemyDeaths=S.tokens.length>0&&(S.phase==="garruk"||timing.canCastInstant);
    syncIncomingDamageToAttack();
    renderContextualInputs();
  }
}

/* ---------- wire ---------- */
function setUtilityMenu(open){
  const menu=document.getElementById('utilityMenu');
  const trigger=document.getElementById('menuBtn');
  menu.classList.toggle('show',open);
  trigger.setAttribute('aria-expanded',open?"true":"false");
}
function wire(){
  document.querySelectorAll('.adj button').forEach(b=>{
    b.onclick=()=>b.dataset.stat==="commanderLife"?adjustCommanderLife(parseInt(b.dataset.d,10)):adjust(b.dataset.stat, parseInt(b.dataset.d,10));
  });
  document.getElementById('addWolfBtn').onclick=manualAddEnemy;
  document.getElementById('endTurnBtn').onclick=resolveTurn;
  document.getElementById('quickEndBtn').onclick=endPlayerTurnNow;
  document.getElementById('saveBtn').onclick=()=>{save();setUtilityMenu(false);toast("Encounter saved");};
  document.getElementById('undoBtn').onclick=undo;
  document.getElementById('resetBtn').onclick=()=>{setUtilityMenu(false);confirmRestart();};
  document.getElementById('menuBtn').onclick=(event)=>{
    event.stopPropagation();
    setUtilityMenu(!document.getElementById('utilityMenu').classList.contains('show'));
  };
  document.getElementById('utilityMenu').onclick=event=>event.stopPropagation();
  document.addEventListener('click',()=>setUtilityMenu(false));
  document.getElementById('rulesBtn').onclick=showModeRules;
  document.getElementById('graveyardBtn').onclick=showEnemyGraveyard;
  document.getElementById('exileBtn').onclick=showEnemyExile;
  document.getElementById('portrait').onclick=showModeRules;
  document.getElementById('portrait').onkeydown=event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();showModeRules();}};
  document.getElementById('infoClose').onclick=closeInfoModal;
  document.getElementById('infoOverlay').onclick=event=>{if(event.target.id==='infoOverlay')closeInfoModal();};
  document.getElementById('logBtn').onclick=()=>{setUtilityMenu(false);openLog();};
  document.getElementById('themeToggleBtn').onclick=()=>{
    setUtilityMenu(false);
    const themes=["classic","fantasy","poker"];
    const current=document.documentElement.getAttribute('data-theme')||"classic";
    const next=themes[(themes.indexOf(current)+1)%themes.length];
    document.documentElement.setAttribute('data-theme',next);
    try{localStorage.setItem('mng_theme',next);}catch(e){}
  };
  document.getElementById('logClose').onclick=closeLog;
  document.getElementById('logOverlay').onclick=event=>{if(event.target.id==='logOverlay')closeLog();};
  document.addEventListener('keydown',event=>{
    const infoOverlay=document.getElementById('infoOverlay');
    const logOverlay=document.getElementById('logOverlay');
    if(event.key==="Tab"){
      if(infoOverlay.classList.contains('show'))trapDialogFocus(event,infoOverlay);
      else if(logOverlay.classList.contains('show'))trapDialogFocus(event,logOverlay);
      return;
    }
    if(event.key!=="Escape")return;
    setUtilityMenu(false);
    if(infoOverlay.classList.contains('show'))closeInfoModal();
    else if(logOverlay.classList.contains('show'))closeLog();
    else if(document.getElementById('inputOverlay').classList.contains('show'))document.getElementById('inputCancel').click();
  });
}

/* ---------- adventure engine interface (for commander module integration) ---------- */
window._adventureEngine = {
  start: function(mode) {
    S=freshState(mode);turnInput=null;gameOver=false;undoStack=[];updateUndoBtn();
    document.getElementById('overlay').classList.remove("show");
    logBig(`${modeConfig().name} begins. ${enemyName()} enters with ${S.loyalty} ${modeConfig().resource.toLowerCase()}.`);
    logSys(`${modeConfig().summary} Starting life: ${S.player.life}.`);
    startGarrukTurn();
  },
  resume: function(savedState) {
    S=normalizeState(savedState);gameOver=false;undoStack=[];
    turnInput=restoreTurnInput(S.pendingTurnInput);S.pendingTurnInput=null;
    render();renderLog();
    if(S.phase==="player")showPlayerTurn();
    else if(S.pendingDecl)showGarrukTurn();
    else startGarrukTurn();
    updateUndoBtn();logSys(`${modeConfig().name} resumed from save.`);
  },
  isActive: function() { return S !== null && S.turn > 0 && !gameOver; }
};

/* ---------- boot ---------- */
wire();
const saved=load();
// If this is a commander battle save, defer to the module system
const isCommanderSave = saved && saved._type === "commander";
if(isCommanderSave){
  // The module (src/main.js) handles commander saves — do nothing here
}else{
const commanderDamageDefeat=saved&&saved.mode==="voltron"&&saved.commanderDamage>=21;
const resumable=!commanderDamageDefeat&&saved&&saved.player&&saved.player.life>0&&(saved.mode==="horde"?(saved.loyalty>0||saved.tokens.length>0):saved.loyalty>0);
if(commanderDamageDefeat){
  S=normalizeState(saved);gameOver=false;undoStack=[];render();renderLog();
  endGame(false,`${enemyName()} dealt 21 commander damage.`);
}else if(resumable){
  S=normalizeState(saved);gameOver=false;undoStack=[];
  turnInput=restoreTurnInput(S.pendingTurnInput);S.pendingTurnInput=null;
  render();renderLog();
  if(S.phase==="player")showPlayerTurn();
  else if(S.pendingDecl)showGarrukTurn();
  else startGarrukTurn();
  updateUndoBtn();logSys(`${modeConfig().name} resumed from save.`);
}else{
  // Let the module system (src/main.js) handle showing the setup screen.
  // Don't set S — leave it null so the module knows no game is active.
}
} // end isCommanderSave else block