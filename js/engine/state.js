/* =====================================================================
   state.js — Game State Module
   Contains: save/load constants, state factory and normalization,
   persistence helpers (localStorage with fallback), undo system,
   and turn-input serialization.
   Globals expected from other modules: MODES, CONCLAVE_UNITS,
   PLAYER_TURN_SEQUENCE, TURN_STEPS, TURN_PHASES, turnInput,
   currentTurnInputKey, logSys, render, renderLog, showPlayerTurn,
   showEnemyTurn, and the UI globals updateUndoBtn / hideGameOverlay.
   ===================================================================== */

/* ---------- constants ---------- */
var SAVE_KEY = "ratt_save_adventure_v1";
var ADVENTURE_SAVE_KEY = SAVE_KEY; // alias for code that shadows SAVE_KEY (commander-ui.js)
var COMMANDER_SAVE_KEY = "ratt_save_commander_v2";
/* Pre-rename storage keys → current keys. Migrated once on load by
   migrateLegacyStorageKeys() (see the persistence section). Order matters:
   the first old key that exists wins for a given new key. */
var LEGACY_STORAGE_KEYS = [
  ["magic_no_gathering_save_v1", "ratt_save_adventure_v1"],
  ["garruk_slayer_save_v4",      "ratt_save_adventure_v1"],
  ["magic_no_gathering_save_v2", "ratt_save_commander_v2"],
  ["mng_theme",                  "ratt_theme"],
  ["mng_recap",                  "ratt_recap"],
  ["mng_commander_setup",        "ratt_commander_setup"]
];

/* ---------- helpers ---------- */
function shuffled(values){ return values.slice().sort(function(){ return Math.random()-.5; }); }

/* ---------- state factory ---------- */
function freshState(mode){
  var cfg = MODES[mode] || MODES.vanilla;
  return {
    version:1, mode:cfg.id, turn:1, phase:"enemy", loyalty:cfg.startResource, maxLoyaltySeen:cfg.startResource,
    difficulty:cfg.id, enraged:false, player:{life:cfg.life,creatures:0}, tokens:[], pendingDecl:null,
    attackPower:0, slayTarget:null, declFlavor:"", actionSteps:[], log:[], turnPowerBonus:0,
    spellLock:"", lastPlayerDamage:0, conclaveAscension:0, conclaveRoster:shuffled(CONCLAVE_UNITS.map(function(c){ return c.id; })), lastConclaveId:null,
    enemyGraveyard:[], enemyGraveyardCount:0,
    enemyExile:[], enemyExileCount:0,
    commanderDamage:0, commanderDamageToEnemy:0, commanderTax:0, commanderZone:cfg.id==="voltron", voltronMana:0, voltronGear:0,
    voltronDeck:null, voltronHand:{lands:0,ramp:0,explosive:0,other:0}, voltronBottom:{lands:0,ramp:0,explosive:0,other:0}, voltronLandsInPlay:0, voltronRampInPlay:0, voltronExplosiveInPlay:0, voltronMulligans:0,
    voltronOtherDeck:null, voltronTypedHand:[], voltronProtectionHeld:0,
    playerPhase: TURN_PHASES.BEGINNING,
    playerStep: TURN_STEPS.UNTAP,
    playerStepIndex: 0
  };
}

/* ---------- legacy name migration ----------
   A short-lived build (names version 2) used invented card, deck and enemy
   names. Saves from it are rewritten back to the current names
   (LEGACY_CARD_NAMES in js/data/decks/index.js, LEGACY_TITLE_NAMES in
   js/data/modes.js) in every string — token / hand / graveyard names,
   stored CPU results and the log. Saves from before that build already use
   the current names, so the rewrite is a no-op for them. Runs once per save
   (state.namesVersion). */
var NAMES_VERSION = 3;
var legacyNamePattern = null, legacyNameLookup = null;
function legacyNamePairs(){
  return [].concat(typeof LEGACY_TITLE_NAMES!=="undefined"?LEGACY_TITLE_NAMES:[], typeof LEGACY_CARD_NAMES!=="undefined"?LEGACY_CARD_NAMES:[]);
}
function replaceLegacyNames(text){
  if(!legacyNamePattern){
    var pairs=legacyNamePairs();
    legacyNameLookup={};
    pairs.forEach(function(pair){ if(!(pair[0] in legacyNameLookup)) legacyNameLookup[pair[0]]=pair[1]; });
    // Longest first so "Ulvar, the Pack Warden" wins over "Pack Warden".
    var keys=Object.keys(legacyNameLookup).sort(function(a,b){ return b.length-a.length; });
    legacyNamePattern=keys.length?new RegExp("(^|[^A-Za-z])("+keys.map(function(k){ return k.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }).join("|")+")(?![A-Za-z])","g"):null;
  }
  if(!legacyNamePattern||typeof text!=="string") return text;
  return text.replace(legacyNamePattern,function(_m,lead,name){ return lead+legacyNameLookup[name]; });
}
/** Rewrites pre-rename names in every string of a saved state (in place). Returns the state. */
function migrateLegacyNames(state){
  if(!state||typeof state!=="object"||state.namesVersion===NAMES_VERSION) return state;
  var seen=[];
  (function walk(node){
    if(!node||typeof node!=="object"||seen.indexOf(node)>=0) return;
    seen.push(node);
    Object.keys(node).forEach(function(key){
      var value=node[key];
      if(typeof value==="string") node[key]=replaceLegacyNames(value);
      else if(value&&typeof value==="object") walk(value);
    });
  })(state);
  state.namesVersion=NAMES_VERSION;
  return state;
}

/* ---------- state normalization ---------- */
function normalizeState(state){
  if(!state) return null;
  if(!state.mode) state.mode="vanilla";
  if(state.phase==="garruk") state.phase="enemy"; // pre-rename saves
  migrateLegacyNames(state); // pre-rename titles / card names in tokens, hands and the log
  state.version=1;
  state.actionSteps=state.actionSteps||[]; state.tokens=state.tokens||[]; state.log=state.log||[];
  state.turnPowerBonus=state.turnPowerBonus||0; state.spellLock=state.spellLock||""; state.lastPlayerDamage=state.lastPlayerDamage||0;
  state.conclaveAscension=state.conclaveAscension||0;
  state.conclaveRoster=state.conclaveRoster||shuffled(CONCLAVE_UNITS.map(function(c){ return c.id; }));
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
  if(state.mode==="voltron"&&state.commanderZone==null)state.commanderZone=!state.tokens.some(function(token){ return token.kind==="commander"; });
  state.tokens.forEach(function(t){ if(t.baseP==null)t.baseP=t.p; if(t.baseT==null)t.baseT=t.t; });
  if(!state.playerPhase) state.playerPhase=TURN_PHASES.BEGINNING;
  if(!state.playerStep) state.playerStep=TURN_STEPS.UNTAP;
  if(state.playerStepIndex==null) state.playerStepIndex=0;
  if(state.playerStep===TURN_STEPS.UPKEEP){
    state.playerPhase=TURN_PHASES.BEGINNING;
    state.playerStep=TURN_STEPS.DRAW;
    state.playerStepIndex=PLAYER_TURN_SEQUENCE.findIndex(function(entry){ return entry.step===TURN_STEPS.DRAW; });
  }
  return state;
}

/* ---------- global state ---------- */
var S = null, gameOver = false;
var undoStack = [];

/* ---------- log ---------- */
function logG(m){push("garruk",enemyName(),m);} function logP(m){push("player","You",m);}
function logSys(m){push("sys","",m);} function logBig(m){push("big","⚔ Encounter",m);}
function push(cls,who,msg){
  var entry={cls:cls,who:who,msg:msg,turn:S.turn};
  if(S.phase==="player"){
    entry.playerPhase=S.playerPhase;
    entry.playerStep=S.playerStep;
  }
  S.log.unshift(entry); if(S.log.length>80)S.log.pop(); if(typeof renderLog==='function')renderLog();
}

/* ---------- persistence ----------
   Canonical storage helpers for every mode: localStorage when available,
   an in-memory fallback when it is blocked (sandboxed iframes, private mode). */
var memStore = {};
function safeGet(k){ try{ return localStorage.getItem(k); }catch(e){ return (k in memStore)?memStore[k]:null; } }
function safeSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){ memStore[k]=v; } }
function safeRemove(k){ try{ localStorage.removeItem(k); }catch(e){ delete memStore[k]; } }

/* Copy oldKey → newKey when newKey is empty, then remove oldKey. If newKey
   already holds data the stale oldKey is simply removed. */
function migrateStorageKey(oldKey,newKey){
  var old = safeGet(oldKey);
  if(old==null) return false;
  var moved = false;
  if(safeGet(newKey)==null){ safeSet(newKey, old); moved = true; }
  safeRemove(oldKey);
  return moved;
}
function migrateLegacyStorageKeys(){
  LEGACY_STORAGE_KEYS.forEach(function(pair){ migrateStorageKey(pair[0], pair[1]); });
}
migrateLegacyStorageKeys();

function serializeTurnInput(){
  if(!turnInput) return null;
  return {...turnInput, enemyDeaths:Array.from(turnInput.enemyDeaths||[]), blockedCreatures:Array.from(turnInput.blockedCreatures||[])};
}
function restoreTurnInput(savedInput){
  if(!savedInput||savedInput.key!==currentTurnInputKey()) return null;
  var {enemyDeaths, blockedCreatures, ...rest} = savedInput;
  return {...rest, enemyDeaths:new Set(Array.isArray(enemyDeaths)?enemyDeaths:[]), blockedCreatures:new Set(Array.isArray(blockedCreatures)?blockedCreatures:[])};
}

/* "1 creature" / "3 creatures" — used by log and action text instead of "creature(s)" */
function plural(count,singular,pluralForm){ return count+" "+(count===1?singular:(pluralForm||singular+"s")); }
function save(){ safeSet(SAVE_KEY, JSON.stringify({...S,pendingTurnInput:serializeTurnInput()})); }
function load(){
  try{
    var current = safeGet(SAVE_KEY);
    return current ? normalizeState(JSON.parse(current)) : null;
  }catch(e){ return null; }
}

/* ---------- undo ---------- */
/* updateUndoBtn() and hideGameOverlay() are UI globals (js/ui/render.js); called at runtime only. */
function snapshot(){ undoStack.push(JSON.stringify(S)); if(undoStack.length>25) undoStack.shift(); if(typeof updateUndoBtn==='function') updateUndoBtn(); }
function undo(){
  if(undoStack.length===0) return;
  S = JSON.parse(undoStack.pop());
  turnInput = null;
  gameOver = false;
  if(typeof hideGameOverlay==='function') hideGameOverlay();
  if(typeof render==='function') render();
  if(typeof renderLog==='function') renderLog();
  if(S.phase==="player"){ if(typeof showPlayerTurn==='function') showPlayerTurn(); }
  else{ if(typeof showEnemyTurn==='function') showEnemyTurn(); }
  if(typeof updateUndoBtn==='function') updateUndoBtn();
  if(typeof logSys==='function') logSys("↶ Reverted to the previous step.");
  save();
}
