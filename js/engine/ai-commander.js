/* =====================================================================
   ai-commander.js — Commander Battle AI & Game Logic

   Contains all non-UI logic for the Commander Battle mode:
   - Opponent creation (London mulligan) and token identity (uid/enteredTurn)
   - CPU turn split into main phase / combat / end step
   - Targeting AI (threat scoring, strategy selection)
   - Board wipe + haymaker evaluation (with undo records for counters)
   - Countering CPU spells (counterOpponentAction)
   - CPU interaction: held mana, protection responses, intent preview,
     hand breakdown, lethal warnings
   - Battlefield rules system (taxes, bans, prevention)
   - Player effect resolution (discard, mill, destroy, exile, bounce,
     reanimate, poison, tokens, ...)
   - Graveyard/exile card management

   Canonical deck/hand/mana helpers (drawCard, drawOpponentCard,
   manaAvailable, commanderCost, refreshCommanderGear, opponentHandSize,
   opponentDeckSize, isOpponentDead, returnCommanderToZone, ...) live in
   js/data/decks/deck-base.js, which loads first. Do NOT redefine them here.
   Combat math lives in combat.js.

   NO DOM ACCESS. UI hooks used when present (all guarded with typeof):
   logCommander, renderBoardView, cmdSnapshot, saveState,
   showCommanderGame, askConfirm.
   ===================================================================== */

/* ---------- small helpers ---------- */
function cmdLog(message){if(typeof logCommander==="function")logCommander(message);}
function shortName(owner){return owner&&owner.id==="player"?"You":String(owner&&owner.name||"?").split(",")[0];}
function currentCommanderTurn(){return (typeof gameState!=="undefined"&&gameState&&gameState.turn)||0;}
function liveGameState(){return typeof gameState!=="undefined"&&gameState?gameState:null;}

/* ---------- token identity ---------- */
/** Next stable token uid for an owner ("cpu_0:t7", "player:t2"). Unique for the game. */
function nextTokenUid(owner){
  owner.nextTokenUid=(owner.nextTokenUid||0)+1;
  return `${owner.id}:t${owner.nextTokenUid}`;
}
/** Ensures a token has a uid and enteredTurn. Returns the token. */
function registerToken(owner,token){
  if(!token.uid)token.uid=nextTokenUid(owner);
  if(token.enteredTurn==null)token.enteredTurn=currentCommanderTurn();
  return token;
}
/** Every token creation path goes through here. */
function addOpponentToken(opp,token){
  opp.tokens.push(token);
  return registerToken(opp,token);
}
function findTokenByUid(opp,uid){
  if(!opp||!uid)return null;
  return (opp.tokens||[]).find(token=>token.uid===uid)||null;
}
function removeOpponentPermanentByUid(opp,uid,destination){
  const index=(opp&&opp.tokens||[]).findIndex(token=>token.uid===uid);
  if(index<0)return null;
  return removeOpponentPermanent(opp,`token:${index}`,destination||"graveyard");
}
/** Finds the typed ref for a card name in an opponent's deck (default deck without opp) — for bounce/regrowth. */
function findCardRefByName(name,opp){
  const deck=opp?deckOf(opp):defaultCommanderDeck();
  if(!deck||!name)return null;
  for(const [category,pool] of Object.entries(deck.cards)){
    const index=(pool||[]).findIndex(card=>card.name===name);
    if(index>=0)return {category,index};
  }
  return null;
}
/**
 * Card definition by name for display (hover text, action cards): the
 * opponent's own deck first, then every deck in DECK_REGISTRY. Returns the
 * card object or null.
 */
function cardDefinitionByName(name,opp){
  if(!name)return null;
  const decks=[opp?deckOf(opp):null].concat(typeof DECK_REGISTRY!=="undefined"?DECK_REGISTRY:[defaultCommanderDeck()]).filter(Boolean);
  for(const deck of decks){
    for(const pool of Object.values(deck.cards||{})){
      const card=(pool||[]).find(candidate=>candidate.name===name);
      if(card)return card;
    }
  }
  return null;
}
function isManaToken(token){return token.kind==="voltron-support"&&!!token.effect&&token.effect.includes("mana");}

/* =====================================================================
   AI SETTINGS — gameState.settings.cpu = {powerLevel 1-5, aggression 0-1,
   interaction 0-1}. Defaults 3 / 0.5 / 0.5 keep the tuned pacing.
   - powerLevel: mulligan keep quality, fast-mana count, gear efficiency
   - aggression: share of the board kept home (0 keeps twice the estimated
     need back, 0.5 keeps exactly the need, 1 keeps nothing back)
   - interaction: probability of instant-speed responses and of holding
     mana open for them (0 = never)
   ===================================================================== */
var CPU_AI_DEFAULTS={powerLevel:3,aggression:0.5,interaction:0.5};
function clampUnit(value){return Math.max(0,Math.min(1,value));}
function normalizeCpuSettings(raw){
  const source=raw||{};
  const num=(value,fallback)=>{const n=Number(value);return value==null||value===""||!isFinite(n)?fallback:n;};
  return {
    powerLevel:Math.max(1,Math.min(5,Math.round(num(source.powerLevel,CPU_AI_DEFAULTS.powerLevel)))),
    aggression:clampUnit(num(source.aggression,CPU_AI_DEFAULTS.aggression)),
    interaction:clampUnit(num(source.interaction,CPU_AI_DEFAULTS.interaction))
  };
}
/** Current CPU AI settings (normalized). */
function cpuSettings(state){
  const s=state||liveGameState();
  return normalizeCpuSettings(s&&s.settings&&s.settings.cpu);
}
/** Probability that a CPU uses a held instant when it can (interaction 0.5 → 0.8). */
function cpuResponseChance(settings){return clampUnit(1.6*(settings||cpuSettings()).interaction);}
/** Per-game AI counters (plain JSON; read by tests and optional UI stats). */
function aiStats(state){
  const s=state||liveGameState();
  if(!s)return {};
  s.aiStats=s.aiStats||{};
  return s.aiStats;
}
function bumpAiStat(key,amount){const stats=aiStats();stats[key]=(stats[key]||0)+(amount==null?1:amount);}

/* ---------- opponent creation ---------- */
/**
 * Creates CPU seat `index` playing deck `deckId` (an id in DECK_REGISTRY;
 * missing / unknown → Gruul Voltron). The seat's name, icon and colour come
 * from that deck's cpuNames[index]. The legacy call shape
 * createOpponent(index, settings) is still accepted.
 */
function createOpponent(index, deckId, settings) {
  if(deckId&&typeof deckId==="object"){settings=deckId;deckId=null;}
  const deckDef=(deckId&&typeof getDeck==="function"?getDeck(deckId):null)||defaultCommanderDeck();
  const names=deckDef.cpuNames||CPU_NAMES;
  const id=names[index]||names[0];
  const config=normalizeCpuSettings(settings);
  const opp={
    id:`cpu_${index}`, index, name:id.name, ico:id.ico, color:id.color, deckId:deckDef.id, archetype:deckDef.archetype||"voltron",
    life:40, poison:0, commanderDamageReceived:{}, commanderDamageDealt:{},
    commanderZone:true, commanderInHand:false, commanderTax:0,
    deck:newDeck(deckDef,config.powerLevel), otherDeck:generateOtherDeck(deckDef), hand:{lands:0,ramp:0,explosive:0,other:0}, typedHand:[],
    landsInPlay:0, rampInPlay:0, explosiveInPlay:0, gear:0, attachedGear:[], looseGear:[], utilityPermanents:[],
    graveyardCount:0, graveyard:[], nextGraveyardCardId:0, discardHistory:[], exileCount:0, exile:[], nextExileCardId:0,
    tokens:[], nextTokenUid:0, damageLog:{}, lastAttacker:null, grudge:null, grudgeRound:null, grudgeReason:null,
    heldMana:0, turnsTaken:0, mulligans:0,
    currentStrategy:(deckDef.strategies||STRATEGIES).THREAT, actionSteps:[], attackTarget:null, attackPower:0,
    tokensCreated:0,
  };
  // Opening hand: 7 typed cards, London mulligan (first one free, max 2).
  londonMulligan(opp,2,config.powerLevel);
  return opp;
}

function commanderOnField(opp) { return opp.tokens.find(t=>t.kind==="commander")||null; }

/** Casts the commander from the command zone (or from hand after a bounce). Returns the token or false. */
function deployCommander(opp) {
  const token=deployCommanderGeneric(opp,deckCommanderBase(opp));
  if(!token)return false;
  registerToken(opp,token);
  return token;
}

/* =====================================================================
   ROUND BOOKKEEPING — beginCommanderRound (contract, wave 2)
   ===================================================================== */
/** Shared per-round reset: target counts, grudge decay, last-round damage. */
function startAiRound(state){
  if(!state)return;
  const turn=state.turn||0;
  state.roundTargets={};
  state.aiRound=turn;
  (state.opponents||[]).forEach(opp=>{
    opp.damageLog=opp.damageLog||{};
    // Damage taken last round, by source.
    const before=opp._damageLogAtRoundStart||{};
    const lastRound={};
    Object.keys(opp.damageLog).forEach(id=>{const dealt=(opp.damageLog[id]||0)-(before[id]||0);if(dealt>0)lastRound[id]=dealt;});
    opp.damageLastRound=lastRound;
    opp._damageLogAtRoundStart={...opp.damageLog};
    // Grudges decay after 2 rounds.
    if(opp.grudge&&opp.grudgeRound!=null&&turn-opp.grudgeRound>2){opp.grudge=null;opp.grudgeRound=null;opp.grudgeReason=null;}
    // Whoever dealt this CPU the most damage last round earns a grudge,
    // unless a fresher commander-removal grudge is in place.
    const top=Object.entries(lastRound).filter(([id])=>id!==opp.id).sort((a,b)=>b[1]-a[1])[0];
    const removalGrudgeFresh=opp.grudgeReason==="commander"&&opp.grudgeRound!=null&&turn-opp.grudgeRound<=1;
    if(top&&top[1]>=4&&!removalGrudgeFresh){opp.grudge=top[0];opp.grudgeRound=turn;opp.grudgeReason="damage";}
  });
}
/**
 * Contract: the UI calls this once at the start of every round, before the
 * first seat acts. Resets state.roundTargets (how many CPUs have chosen each
 * player as their attack target this round), decays grudges and records who
 * dealt each CPU the most damage last round.
 */
function beginCommanderRound(state){
  const s=state||liveGameState();
  if(!s)return;
  startAiRound(s);
  s.aiRoundManaged=true;
}
/** Fallback when the caller never calls beginCommanderRound: reset once per turn number. */
function ensureAiRound(state){
  if(!state||state.aiRoundManaged)return;
  if(state.aiRound!==(state.turn||0)||!state.roundTargets)startAiRound(state);
}
function recordRoundTarget(state,targetId){
  if(!state||!targetId)return;
  state.roundTargets=state.roundTargets||{};
  state.roundTargets[targetId]=(state.roundTargets[targetId]||0)+1;
}

/* ---------- grudges from commander removal ---------- */
/** Explicit culprit for the next CPU-commander removal (set by engine paths that know it). */
var cpuRemovalSource=null;
function withRemovalSource(sourceId,fn){
  const previous=cpuRemovalSource;
  cpuRemovalSource=sourceId;
  try{return fn();}finally{cpuRemovalSource=previous;}
}
/** Who removed this CPU's commander: explicit source, else the acting CPU during a CPU turn, else the player. */
function inferRemovalCulprit(owner){
  if(cpuRemovalSource)return cpuRemovalSource;
  const state=liveGameState();
  if(state&&state.phase!=="player"&&state.aiActiveOppId){
    if(state.aiActiveOppId!==owner.id)return state.aiActiveOppId;
    const active=state.opponents.find(o=>o.id===state.aiActiveOppId);
    return active&&active.attackTarget&&active.attackTarget!==owner.id?active.attackTarget:"player";
  }
  return "player";
}
function noteCommanderRemoved(owner){
  if(!owner||owner.id==="player")return;
  const culprit=inferRemovalCulprit(owner);
  if(!culprit||culprit===owner.id)return;
  owner.grudge=culprit;owner.grudgeRound=currentCommanderTurn();owner.grudgeReason="commander";
}

/* =====================================================================
   TABLE EVALUATION — board power, archenemy score, lethal and defense math
   ===================================================================== */
function isPlayerEntry(p){return !!p&&p.id==="player";}
/** The player's creatures as combat profiles: tracked tokens with P/T, else 2/2 per creature. */
function playerCreatureProfile(p){
  const count=Math.max(0,p.creatures||0);
  const tracked=(p.tokens||[]).filter(t=>typeof t.p==="number").map(t=>({name:t.name,p:t.p||0,t:t.t||1,kws:t.kws||[]}));
  const list=tracked.slice(0,count);
  while(list.length<count)list.push({name:"Creature",p:2,t:2,kws:[]});
  return list;
}
/** Creatures that can deal combat damage (mana dorks never attack). */
function combatTokens(p,assumeUntapped){
  if(isPlayerEntry(p))return playerCreatureProfile(p);
  return (p.tokens||[]).filter(t=>!isManaToken(t)&&(t.p||0)>=1&&(assumeUntapped||!t.summoningSick));
}
function attackPowerOf(token){return (token.p||0)*combatStrikeCount(token);}
function boardPower(p){return combatTokens(p,true).reduce((sum,t)=>sum+attackPowerOf(t),0);}
/** Commander pressure: power on the battlefield, half its base when castable next turn. */
function commanderPressure(p){
  if(isPlayerEntry(p))return Math.max(0,p.commanderPower||0);
  const commander=commanderOnField(p);
  if(commander)return attackPowerOf(commander);
  return manaAvailable(p)+1>=commanderCost(p)?(deckCommanderBase(p).p||0)*0.5:0;
}
function entryHandSize(p){return isPlayerEntry(p)?Math.max(0,p.handSize!=null?p.handSize:7):opponentHandSize(p);}
function maxCommanderDamageDealt(p){return Object.values(p.commanderDamageDealt||{}).reduce((best,d)=>Math.max(best,d||0),0);}
/**
 * Table-wide archenemy score: who is AHEAD scores high. Board power,
 * commander power/gear, hand size, life, planeswalkers and commander-damage
 * progress all count. The same number for every CPU (no human bonus).
 */
function archenemyScore(p){
  if(!p)return 0;
  return boardPower(p)+1.5*commanderPressure(p)+entryHandSize(p)+0.5*Math.max(0,p.life||0)
    +6*(p.planeswalkers||[]).length+0.5*maxCommanderDamageDealt(p);
}
/** Back-compat name used by older callers. */
function threatScore(p){return archenemyScore(p);}
/** Alive table entries (player projection + CPUs) for a state. */
function tableEntries(state){return state?allPlayersForTargeting(state).filter(p=>!isEliminatedTarget(p)):[];}
/** Sorted standings [{id, score}] for the alive table. */
function tableStandings(state){
  return tableEntries(state||liveGameState()).map(p=>({id:p.id,score:archenemyScore(p)})).sort((a,b)=>b.score-a.score);
}
/** True when this CPU leads the table (it never casts a board wipe then). */
function cpuIsAhead(opp,allPlayers){
  const alive=(allPlayers||[]).filter(p=>!isEliminatedTarget(p)||p.id===opp.id);
  const mine=archenemyScore(opp);
  return alive.filter(p=>p.id!==opp.id).every(p=>archenemyScore(p)<mine);
}
/** The leading opponent from this CPU's point of view. */
function archenemyFor(opp,allPlayers){
  return (allPlayers||[]).filter(p=>p.id!==opp.id&&!isEliminatedTarget(p))
    .sort((a,b)=>archenemyScore(b)-archenemyScore(a))[0]||null;
}

/** True when a player/opponent (or a targeting projection) is out of the game. */
function isEliminatedTarget(p){
  if(!p||p.life<=0)return true;
  if((p.poison||0)>=10)return true;
  return !!(p.commanderDamageReceived&&Object.values(p.commanderDamageReceived).some(d=>d>=21));
}
function liveOpponentObject(id,allPlayers){
  const state=liveGameState();
  const fromState=state?state.opponents.find(o=>o.id===id):null;
  return fromState||(allPlayers||[]).find(p=>p.id===id)||null;
}

/**
 * Damage a set of attackers would deal to a target right now.
 * CPU defender: exact blocks via cpuAssignBlockers/resolveSingleBlock (no
 * state change). Player: the player blocks the biggest attackers (commander
 * first) with one creature each; blocked tramplers deal their excess over 2.
 * Returns {damage, commanderDamage, poison}.
 */
function estimateAttackDamage(opp,target,attackers){
  if(!attackers.length||!target)return {damage:0,commanderDamage:0,poison:0};
  const poisonOf=list=>list.filter(t=>hasKeyword(t,"Infect")||hasKeyword(t,"Toxic")).reduce((s,t)=>s+attackPowerOf(t),0);
  if(!isPlayerEntry(target)&&target.tokens){
    const combat=resolveCpuCombat(opp,target,attackers);
    const prevented=previewCpuDamagePrevention(combat.damageToDefender,combat.commanderDamage);
    return {damage:prevented.damage,commanderDamage:prevented.commanderDamage,poison:poisonOf(combat.unblocked)};
  }
  const blockers=playerCreatureProfile(target).length;
  const ordered=[...attackers].sort((a,b)=>(b.kind==="commander")-(a.kind==="commander")||attackPowerOf(b)-attackPowerOf(a));
  let damage=0,commanderDamage=0;const unblocked=[];
  ordered.forEach((attacker,index)=>{
    const dealt=index<blockers?trampleExcess(attacker,2)*combatStrikeCount(attacker):attackPowerOf(attacker);
    if(index>=blockers)unblocked.push(attacker);
    damage+=dealt;
    if(attacker.kind==="commander")commanderDamage+=dealt;
  });
  const prevented=previewCpuDamagePrevention(damage,commanderDamage);
  return {damage:prevented.damage,commanderDamage:prevented.commanderDamage,poison:poisonOf(unblocked)};
}
/**
 * Can this CPU eliminate the target this turn? Life ≤ likely unblocked
 * damage, commander damage + commander power ≥ 21, or poison.
 * Returns {lethal, kind, attackers}.
 */
function lethalPlan(opp,target,options){
  const assumeUntapped=!!(options&&options.assumeUntapped);
  const none={lethal:false,kind:null,attackers:[]};
  if(!target||isEliminatedTarget(target)||cpuCreaturesCannotAttack())return none;
  const attackers=combatTokens(opp,assumeUntapped);
  if(!attackers.length)return none;
  const commander=attackers.find(t=>t.kind==="commander");
  const estimate=estimateAttackDamage(opp,target,attackers);
  if(estimate.damage>=target.life)return {lethal:true,kind:"life",attackers};
  const received=(target.commanderDamageReceived||{})[opp.id]||0;
  if(commander){
    const reach=isPlayerEntry(target)?Math.min(attackPowerOf(commander),previewCpuDamagePrevention(attackPowerOf(commander),attackPowerOf(commander)).commanderDamage):estimate.commanderDamage;
    if(received+reach>=21)return {lethal:true,kind:"commander",attackers};
  }
  if(estimate.poison>0&&(target.poison||0)+estimate.poison>=10)return {lethal:true,kind:"poison",attackers};
  return none;
}

/* ---------- per-deck attack policy (deck.ai.attackPolicy) ---------- */
/**
 * commanderAlwaysAttacks: the commander swings whenever it can (Voltron);
 *   false = it is evaluated like any other creature.
 * minPower: smallest power a non-commander needs to attack on its own.
 * goWide: also send every ready creature when the attackers outnumber the
 *   defender's untapped blockers by at least goWideMargin.
 * commanderRaces: applyHomeGuard keeps a racing commander attacking.
 */
var DEFAULT_ATTACK_POLICY={commanderAlwaysAttacks:true,minPower:2,goWide:false,goWideMargin:2,commanderRaces:true};
function deckAi(opp){const deck=deckOf(opp);return (deck&&deck.ai)||(defaultCommanderDeck()||{}).ai||null;}
function deckAttackPolicy(opp){
  const ai=deckAi(opp);
  return Object.assign({},DEFAULT_ATTACK_POLICY,(ai&&ai.attackPolicy)||{});
}
/** Strategy labels for an opponent's deck (shared targeting strategies). */
function deckStrategyLabels(opp){const deck=deckOf(opp);return (deck&&deck.strategyLabels)||STRATEGY_LABELS;}

/** Attackers worth sending at a target (no lethal): bad trades stay home. */
function profitableAttackers(opp,target){
  const policy=deckAttackPolicy(opp);
  const ready=opp.tokens.filter(t=>!t.summoningSick&&!isManaToken(t));
  const defenders=isPlayerEntry(target)?playerCreatureProfile(target):(target&&target.tokens||[]);
  const options={commanderAlwaysAttacks:policy.commanderAlwaysAttacks};
  const chosen=ready.filter(t=>{
    if(t.kind==="commander"&&policy.commanderAlwaysAttacks)return (t.p||0)>=1;
    if((t.p||0)<(t.kind==="commander"?1:policy.minPower))return false;
    return evaluateAttackProfitability(t,defenders,options)>0;
  });
  if(!policy.goWide)return chosen;
  // Go wide: more attackers than blockers means the extras connect.
  const wide=ready.filter(t=>(t.p||0)>=1&&(t.kind!=="commander"||chosen.includes(t)));
  const blockers=cpuCreaturesCannotBlockFor(target)?0:defenders.filter(canBlockCreature).length;
  return wide.length-blockers>=policy.goWideMargin?wide:chosen;
}
function cpuCreaturesCannotBlockFor(target){return !!target&&!isPlayerEntry(target)&&cpuCreaturesCannotBlock();}
/** Potential attack powers (desc) each other player could aim at this CPU before its next turn. */
function incomingThreats(opp,allPlayers){
  return (allPlayers||[]).filter(p=>p.id!==opp.id&&!isEliminatedTarget(p)).map(p=>{
    const attackers=combatTokens(p,true).map(t=>({power:attackPowerOf(t),commander:t.kind==="commander",trample:hasKeyword(t,"Trample")}))
      .sort((a,b)=>b.power-a.power);
    const commanderDamageSoFar=(opp.commanderDamageReceived||{})[p.id]||0;
    const commander=attackers.find(a=>a.commander);
    return {id:p.id,attackers,total:attackers.reduce((s,a)=>s+a.power,0),
      commanderLethal:!!commander&&commanderDamageSoFar+commander.power>=21};
  }).sort((a,b)=>b.total-a.total);
}
/** Does this home guard survive the threat? Each blocker stops one attacker (the biggest first). */
function guardSurvives(threat,blockers,life,factor){
  if(!threat)return true;
  const stopped=threat.attackers.slice(0,blockers);
  let through=threat.attackers.slice(blockers).reduce((s,a)=>s+a.power,0);
  stopped.forEach(a=>{if(a.trample)through+=Math.max(0,a.power-2);});
  if(threat.commanderLethal&&blockers===0)return factor<=0;
  return through*factor<life;
}
/** True when some opponent threatens to eliminate this CPU before its next turn. */
function threatensLethalOn(opp,allPlayers){
  const blockers=opp.tokens.length;
  return incomingThreats(opp,allPlayers).some(threat=>!guardSurvives(threat,blockers,opp.life,1));
}
/**
 * Keeps back enough untapped blockers to survive the strongest opponent who
 * acts before this CPU's next turn (scaled by aggression). Smallest
 * non-commander attackers stay home first; the commander last. When even an
 * all-home guard would not survive, the CPU races instead.
 */
function applyHomeGuard(opp,attackers,allPlayers,settings,target){
  const factor=2*(1-settings.aggression);
  if(factor<=0||!attackers.length)return attackers;
  const threat=incomingThreats(opp,allPlayers)[0];
  if(!threat)return attackers;
  const sending=[...attackers];
  const homeCount=()=>opp.tokens.length-sending.length;
  if(guardSurvives(threat,homeCount(),opp.life,factor))return sending;
  if(!guardSurvives(threat,opp.tokens.length,opp.life,factor))return sending; // can't hold: race
  // A Voltron commander keeps swinging while it is racing (target within two
  // hits by life or commander damage) unless the threat is commander-lethal.
  const commander=deckAttackPolicy(opp).commanderRaces?sending.find(t=>t.kind==="commander"):null;
  const racing=!!commander&&!!target&&(()=>{
    const hit=attackPowerOf(commander);
    const commanderLeft=21-((target.commanderDamageReceived||{})[opp.id]||0);
    return Math.min(target.life,commanderLeft)<=2*hit;
  })();
  const order=[...sending].sort((a,b)=>(a.kind==="commander")-(b.kind==="commander")||(a.p||0)-(b.p||0))
    .filter(t=>t.kind!=="commander"||!racing||threat.commanderLethal);
  for(const token of order){
    sending.splice(sending.indexOf(token),1);
    if(guardSurvives(threat,homeCount(),opp.life,factor))break;
  }
  return sending;
}

/**
 * Decides whether a CPU should redirect its attack to one of the player's
 * planeswalkers instead of the player's life total (attackers may target
 * planeswalkers). CPUs do this when:
 * - The player has a planeswalker with meaningful loyalty
 * - The planeswalker hasn't already been reduced to low loyalty
 * - Random chance (not every turn — sometimes face is still better)
 * Never when the attack is lethal on the player.
 * Returns the planeswalker object to target, or null (attack life).
 */
function choosePlaneswalkerTarget(opp, playerState){
  const pws=playerState.planeswalkers||[];
  if(pws.length===0)return null;
  const viable=pws.filter(pw=>pw.loyalty>0).sort((a,b)=>b.loyalty-a.loyalty);
  if(viable.length===0)return null;
  const targetChance=viable[0].loyalty>=5?0.7:viable[0].loyalty>=3?0.55:0.35;
  if(Math.random()<targetChance)return viable[0];
  return null;
}

/**
 * Target selection (deterministic — cpuIntentPreview uses the same plan):
 * 1. Lethal: any opponent this CPU can eliminate this turn (the 2-per-round
 *    cap does not apply).
 * 2. Otherwise the archenemy (table leader by archenemyScore), adjusted for
 *    this CPU's grudge, the player who dealt it the most damage, and the last
 *    big hitter this round. At most 2 CPUs choose the same player per round
 *    (state.roundTargets); a target the attack can't damage loses to one it can.
 * options.assumeUntapped: plan as if this CPU's turn started now (preview).
 * Returns {targetId, strategy, lethal, lethalKind, attackers} or null.
 */
function planTarget(opp,allPlayers,options){
  const opts=options||{};
  const alive=(allPlayers||[]).filter(p=>p.id!==opp.id&&!isEliminatedTarget(p));
  if(!alive.length)return null;
  const state=liveGameState();
  const lethal=alive.map(p=>({p,plan:lethalPlan(opp,p,opts)})).filter(entry=>entry.plan.lethal)
    .sort((a,b)=>archenemyScore(b.p)-archenemyScore(a.p))[0];
  if(lethal)return {targetId:lethal.p.id,strategy:STRATEGIES.LETHAL,lethal:true,lethalKind:lethal.plan.kind,attackers:lethal.plan.attackers};
  if(alive.length===1)return {targetId:alive[0].id,strategy:STRATEGIES.THREAT,lethal:false,attackers:null};

  const counts=(state&&state.roundTargets)||{};
  const damageLog=opp.damageLog||{};
  const topDamage=Object.entries(damageLog).filter(([id])=>alive.some(p=>p.id===id)).sort((a,b)=>b[1]-a[1])[0];
  const roundStart=opp._damageLogAtRoundStart||{};
  const thisRound={};
  Object.keys(damageLog).forEach(id=>{thisRound[id]=(damageLog[id]||0)-(roundStart[id]||0);});
  const scored=alive.map(p=>{
    const base=archenemyScore(p);
    const bonuses={};
    // GRUDGE: removed this CPU's commander. MOST_DAMAGE: dealt it the most
    // damage last round (grudge reason "damage") or the most damage overall.
    if(opp.grudge===p.id&&opp.grudgeReason==="commander")bonuses[STRATEGIES.GRUDGE]=25;
    let damageBonus=opp.grudge===p.id&&opp.grudgeReason!=="commander"?12:0;
    if(topDamage&&topDamage[0]===p.id&&topDamage[1]>=8)damageBonus=Math.max(damageBonus,Math.min(15,0.3*topDamage[1]));
    if(damageBonus)bonuses[STRATEGIES.MOST_DAMAGE]=damageBonus;
    if(opp.lastAttacker===p.id&&(thisRound[p.id]||0)>=10)bonuses[STRATEGIES.LAST_HITTER]=10;
    const bonus=Object.values(bonuses).reduce((s,v)=>s+v,0);
    const attackers=opts.assumeUntapped?combatTokens(opp,true):profitableAttackers(opp,p);
    const expected=estimateAttackDamage(opp,p,attackers).damage;
    return {p,base,bonuses,total:base+bonus,expected,capped:(counts[p.id]||0)>=2};
  });
  const leader=[...scored].sort((a,b)=>b.base-a.base)[0];
  let pool=scored.filter(entry=>!entry.capped);
  if(!pool.length)pool=scored;
  if(pool.some(entry=>entry.expected>0))pool=pool.filter(entry=>entry.expected>0);
  const chosen=pool.sort((a,b)=>b.total-a.total||b.base-a.base)[0];
  let strategy=STRATEGIES.THREAT;
  if(chosen!==leader){
    const best=Object.entries(chosen.bonuses).sort((a,b)=>b[1]-a[1])[0];
    strategy=best&&chosen.base+best[1]>=leader.base?best[0]:STRATEGIES.OPENING;
  }
  return {targetId:chosen.p.id,strategy,lethal:false,attackers:null};
}
/** Legacy name: kept for callers that only want a target. */
function evaluateStrategy(opp,alive){const plan=planTarget(opp,alive);return plan?plan.strategy:STRATEGIES.THREAT;}
/** Last plan per CPU (module state, not saved). */
var lastTargetPlans={};
function chooseTarget(opp, allPlayers) {
  const state=liveGameState();
  ensureAiRound(state);
  const plan=planTarget(opp,allPlayers);
  if(!plan)return null;
  opp.currentStrategy=plan.strategy;
  lastTargetPlans[opp.id]=plan;
  return plan.targetId;
}

/* =====================================================================
   UNDO RECORDS — lets counterOpponentAction genuinely reverse a spell
   that already changed CPU state (wipes, haymakers, rule removal, ...).
   Records are plain JSON (they are saved inside opp.actionSteps).
   ===================================================================== */
function newUndoRecord(){return {removed:[],life:[],pumps:[],rule:null,regrowth:null};}
function cpuOpponentsFrom(allPlayers){
  const state=liveGameState();
  if(state)return state.opponents;
  return (allPlayers||[]).filter(p=>p.id!=="player"&&p.tokens);
}
function findOwnerById(id){
  const state=liveGameState();
  if(!state)return null;
  if(id==="player")return state.player;
  return state.opponents.find(o=>o.id===id)||null;
}
/** Removes a CPU token (to graveyard) and records what is needed to put it back. */
function removeTokenWithUndo(owner,token,destination,undo){
  const index=owner.tokens.indexOf(token);
  if(index<0)return null;
  const snapshot={ownerId:owner.id,token:JSON.parse(JSON.stringify(token)),commanderTax:owner.commanderTax||0,
    attachedGear:JSON.parse(JSON.stringify(owner.attachedGear||[]))};
  const moved=removeOpponentPermanent(owner,`token:${index}`,destination||"graveyard");
  snapshot.entryId=moved&&moved.id?moved.id:null;
  if(undo)undo.removed.push(snapshot);
  return moved;
}
function removeZoneEntryById(owner,entryId){
  if(!entryId)return;
  let index=(owner.graveyard||[]).findIndex(card=>card.id===entryId);
  if(index>=0){owner.graveyard.splice(index,1);owner.graveyardCount=Math.max(0,(owner.graveyardCount||0)-1);return;}
  index=(owner.exile||[]).findIndex(card=>card.id===entryId);
  if(index>=0){owner.exile.splice(index,1);owner.exileCount=Math.max(0,(owner.exileCount||0)-1);}
}
function restoreRemovedToken(snapshot){
  const owner=findOwnerById(snapshot.ownerId);
  if(!owner||!owner.tokens)return false;
  if(findTokenByUid(owner,snapshot.token.uid))return false;
  const token=snapshot.token;
  if(token.kind==="commander"){
    if(commanderOnField(owner))return false;
    owner.commanderZone=false;
    owner.commanderTax=snapshot.commanderTax;
    owner.looseGear=owner.looseGear||[];
    snapshot.attachedGear.forEach(gear=>{
      const looseIndex=owner.looseGear.findIndex(candidate=>candidate.name===gear.name);
      if(looseIndex>=0)owner.looseGear.splice(looseIndex,1);
    });
    owner.attachedGear=snapshot.attachedGear;
    owner.tokens.push(token);
    refreshCommanderGear(owner);
    return true;
  }
  removeZoneEntryById(owner,snapshot.entryId);
  if(isManaToken(token))owner.rampInPlay=(owner.rampInPlay||0)+(token.rampValue||1);
  owner.tokens.push(token);
  return true;
}
/** Applies noncombat CPU damage to a player/opponent life total (prevention applies). */
function applyNoncombatCpuDamage(target,amount,undo){
  if(amount<=0||!target)return 0;
  const prevention=applyCpuDamagePrevention(amount,0);
  const dealt=Math.min(prevention.damage,Math.max(0,target.life));
  if(dealt<=0)return 0;
  target.life=Math.max(0,target.life-dealt);
  if(undo)undo.life.push({id:target.id,amount:dealt});
  return dealt;
}
/** Removes the tokens an undo record created (a countered token maker). Returns log notes. */
function undoCreatedTokens(undo){
  const notes=[];
  if(!undo||!undo.created)return notes;
  undo.created.forEach(entry=>{
    const owner=findOwnerById(entry.ownerId);
    const token=owner&&findTokenByUid(owner,entry.uid);
    if(token){owner.tokens.splice(owner.tokens.indexOf(token),1);notes.push(`${token.name} token is removed`);}
  });
  undo.created=[];
  return notes;
}
function undoRecord(undo){
  if(!undo)return [];
  const notes=undoCreatedTokens(undo);
  (undo.removed||[]).slice().reverse().forEach(snapshot=>{if(restoreRemovedToken(snapshot))notes.push(`${snapshot.token.name} returns to the battlefield`);});
  (undo.life||[]).forEach(entry=>{
    const owner=findOwnerById(entry.id);
    if(owner){owner.life+=entry.amount;notes.push(`${shortName(owner)} regains ${entry.amount} life`);}
  });
  (undo.pumps||[]).forEach(entry=>{
    const owner=findOwnerById(entry.ownerId);
    const token=owner&&findTokenByUid(owner,entry.uid);
    if(token){token.pumpP=(token.pumpP||0)-entry.p;token.pumpT=(token.pumpT||0)-entry.t;if(entry.kw&&token.pumpKws)token.pumpKws=token.pumpKws.filter(kw=>kw!==entry.kw);if(entry.wasSick)token.summoningSick=true;}
  });
  if(undo.rule){
    const state=liveGameState();
    if(state&&!state.battlefieldRules.some(rule=>rule.id===undo.rule.id)){state.battlefieldRules.push(undo.rule);notes.push(`${undo.rule.sourceName||"The battlefield rule"} stays in play`);}
  }
  applyBattlefieldRuleModifiers();
  return notes;
}

/* ---------- board wipe strategy ---------- */
/** The CPU's commander survives a symmetric wipe: in the command zone / hand, indestructible, or a wipeProtect spell ready. */
function commanderSafeFromWipe(opp,manaAfterWipe){
  const commander=commanderOnField(opp);
  if(!commander)return true;
  if(hasKeyword(commander,"Indestructible"))return true;
  return opp.typedHand.some(card=>isWipeProtectionCard(card)&&cpuCanCast(card,card.cost,manaAfterWipe,"protection",null).canCast);
}
/**
 * Evaluates whether the CPU should cast a board wipe this turn.
 * Never while this CPU leads the table (archenemyScore).
 * - Symmetric (wipeType "symmetric"; commanders are spared by this model):
 *   total enemy creature power ≥ own power + 6, OR an opponent threatens
 *   lethal on this CPU before its next turn — AND this CPU's commander is in
 *   the command zone / hand or protected.
 * - Targeted (wipeType "targeted"): only at the archenemy's board, and only when
 *   that board is the biggest threat at the table (3+ creatures).
 * Returns { cast: boolean, manaRemaining: number }
 */
function evaluateAndCastBoardWipe(opp, mana, allPlayers, actions, turnSpellState){
  const wipesInHand=opp.typedHand.filter(c=>c.ref?.category==="boardwipes");
  if(wipesInHand.length===0)return {cast:false,manaRemaining:mana};
  if(cpuIsAhead(opp,allPlayers))return {cast:false,manaRemaining:mana};

  const opponents=allPlayers.filter(p=>p.id!==opp.id&&!isEliminatedTarget(p));
  const countOf=p=>p.creatures!=null?p.creatures:(p.tokens?p.tokens.length:0);
  const totalEnemyCreatures=opponents.reduce((sum,p)=>sum+countOf(p),0);
  const enemyPower=opponents.reduce((sum,p)=>sum+boardPower(p),0);
  const ownPower=boardPower(opp);
  const lethalThreat=threatensLethalOn(opp,allPlayers);
  const stats=aiStats();

  const symmetricWipe=wipesInHand.find(c=>c.wipeType==="symmetric");
  if(symmetricWipe){
    const casting=cpuCanCast(symmetricWipe,symmetricWipe.cost,mana,"boardwipes",turnSpellState);
    if(casting.canCast&&totalEnemyCreatures>=3&&(enemyPower>=ownPower+6||lethalThreat)&&commanderSafeFromWipe(opp,mana-casting.cost)){
      mana-=casting.cost;
      removeTypedCardFromHand(opp,symmetricWipe);
      addOpponentGraveyardCard(opp,typedGraveyardCard(symmetricWipe));
      recordCpuSpellCast(turnSpellState);
      const undo=newUndoRecord();
      withRemovalSource(opp.id,()=>cpuOpponentsFrom(allPlayers).forEach(cpu=>{
        if(cpu!==opp&&isOpponentDead(cpu))return;
        cpu.tokens.filter(token=>token.kind!=="commander").forEach(token=>removeTokenWithUndo(cpu,token,"graveyard",undo));
      }));
      stats.wipes=(stats.wipes||0)+1;stats.symmetricWipes=(stats.symmetricWipes||0)+1;
      actions.push({
        label:`⚡ Cast ${symmetricWipe.name}`,
        detail:`${symmetricWipe.effect} All non-commander creatures on every battlefield are destroyed.`+(lethalThreat?" (Facing a lethal attack.)":""),
        boardWipe:"symmetric",wipeName:symmetricWipe.name,cardName:symmetricWipe.name,
        type:"wipe",counterable:true,undo,
        playerRemoval:{cardName:symmetricWipe.name,instruction:"Destroy all non-commander creatures you control."}
      });
      return {cast:true,manaRemaining:mana};
    }
  }

  const targetedWipe=wipesInHand.find(c=>c.wipeType==="targeted");
  const archenemy=archenemyFor(opp,allPlayers);
  if(targetedWipe&&archenemy&&countOf(archenemy)>=3){
    const biggest=opponents.every(p=>p===archenemy||boardPower(p)<=boardPower(archenemy));
    const casting=cpuCanCast(targetedWipe,targetedWipe.cost,mana,"boardwipes",turnSpellState);
    const worthIt=boardPower(archenemy)>=ownPower||incomingThreats(opp,allPlayers).some(t=>t.id===archenemy.id&&t.total>=opp.life);
    if(casting.canCast&&biggest&&worthIt){
      mana-=casting.cost;
      removeTypedCardFromHand(opp,targetedWipe);
      addOpponentGraveyardCard(opp,typedGraveyardCard(targetedWipe));
      recordCpuSpellCast(turnSpellState);
      const undo=newUndoRecord();
      // Another CPU's creatures are destroyed immediately. For the player the
      // UI gives a response window before the player clears their board.
      if(archenemy.id!=="player"){
        const cpuOpp=cpuOpponentsFrom(allPlayers).find(o=>o.id===archenemy.id);
        if(cpuOpp)withRemovalSource(opp.id,()=>cpuOpp.tokens.filter(token=>token.kind!=="commander").forEach(token=>removeTokenWithUndo(cpuOpp,token,"graveyard",undo)));
      }
      stats.wipes=(stats.wipes||0)+1;stats.targetedWipes=(stats.targetedWipes||0)+1;
      const targetName=archenemy.id==="player"?"You":archenemy.name.split(',')[0];
      const action={
        label:`⚡ Cast ${targetedWipe.name} targeting ${targetName}`,
        detail:`${targetedWipe.effect} ${targetName}'s creatures are destroyed.`,
        boardWipe:"targeted",wipeTarget:archenemy.id,wipeTargetName:targetName,wipeName:targetedWipe.name,cardName:targetedWipe.name,
        type:"wipe",counterable:true,undo
      };
      if(archenemy.id==="player")action.playerRemoval={cardName:targetedWipe.name,instruction:"Destroy all non-commander creatures you control."};
      actions.push(action);
      return {cast:true,manaRemaining:mana};
    }
  }
  return {cast:false,manaRemaining:mana};
}

/* ---------- haymakers ---------- */
function allBattlefieldCreatureCount(opp,allPlayers){
  const cpus=cpuOpponentsFrom(allPlayers).filter(cpu=>cpu===opp||!isOpponentDead(cpu));
  const cpuCount=cpus.reduce((sum,cpu)=>sum+cpu.tokens.length,0);
  const player=(allPlayers||[]).find(p=>p.id==="player");
  return cpuCount+(player?Math.max(0,player.creatures||0):0);
}
function greatestPower(tokens){return tokens.reduce((best,token)=>Math.max(best,token.p||0),0);}
function readyAttackers(opp){return opp.tokens.filter(token=>!token.summoningSick&&!isManaToken(token)&&(token.p||0)>=1);}
function tokenValue(token){
  if(token.kind==="commander")return 20+(token.p||0);
  return (token.p||0)+(token.t||0)+(isManaToken(token)?3:0);
}
function haymakerCost(card,opp,allPlayers){
  if(card.scaleCost)return Math.max(0,card.cost-allBattlefieldCreatureCount(opp,allPlayers));
  return card.cost;
}
/** Damage a "damage each creature" haymaker would deal right now. */
function haymakerDamage(card,opp,allPlayers){
  if(card.damage==="creatureCount")return allBattlefieldCreatureCount(opp,allPlayers);
  return parseInt(card.damage)||0;
}
function damageWouldDestroy(token,damage){return damage>0&&!hasKeyword(token,"Indestructible")&&damage>=(token.t||0);}
/**
 * Scores a haymaker for this turn. Positive = worth casting.
 * pumpTeam: value of the extra attack damage. damageEach/ignition: value of
 * enemy creatures destroyed minus our own losses (the CPU never kills its
 * own commander with these).
 */
function scoreHaymaker(card,opp,allPlayers){
  const player=(allPlayers||[]).find(p=>p.id==="player");
  const others=cpuOpponentsFrom(allPlayers).filter(cpu=>cpu!==opp&&!isOpponentDead(cpu));
  if(card.haymaker==="pumpTeam"){
    const attackers=readyAttackers(opp);
    const commander=commanderOnField(opp);
    if(!attackers.length||cpuCreaturesCannotAttack())return {score:-1};
    const x=greatestPower(opp.tokens);
    const swing=x*attackers.length;
    const commanderReady=commander&&!commander.summoningSick;
    return {score:(commanderReady||attackers.length>=2)&&swing>=6?swing:-1,x};
  }
  if(card.haymaker==="anthem")return scoreAnthem(card,opp,allPlayers);
  if(card.haymaker==="damageEach"){
    const damage=haymakerDamage(card,opp,allPlayers);
    const own=opp.tokens.filter(token=>damageWouldDestroy(token,damage));
    if(own.some(token=>token.kind==="commander"))return {score:-1};
    const enemyValue=others.reduce((sum,cpu)=>sum+cpu.tokens.filter(token=>damageWouldDestroy(token,damage)).reduce((s,t)=>s+tokenValue(t),0),0)
      +(player&&damage>=2?Math.max(0,player.creatures||0)*4:0);
    const ownValue=own.reduce((sum,token)=>sum+tokenValue(token),0);
    return {score:enemyValue-ownValue>=8?enemyValue-ownValue:-1,damage};
  }
  if(card.haymaker==="ignition"){
    const source=[...opp.tokens].sort((a,b)=>(b.p||0)-(a.p||0))[0];
    if(!source||(source.p||0)<5)return {score:-1};
    const damage=source.p;
    const ownLoss=opp.tokens.filter(token=>token!==source&&damageWouldDestroy(token,damage));
    if(ownLoss.some(token=>token.kind==="commander"))return {score:-1};
    const enemyValue=others.reduce((sum,cpu)=>sum+cpu.tokens.filter(token=>damageWouldDestroy(token,damage)).reduce((s,t)=>s+tokenValue(t),0),0)
      +(player?Math.max(0,player.creatures||0)*4:0);
    const faceValue=damage*(others.length+(player&&!isEliminatedTarget(player)?1:0));
    return {score:enemyValue+faceValue-ownLoss.reduce((s,t)=>s+tokenValue(t),0),damage,source};
  }
  return {score:-1};
}
/**
 * Anthem haymaker ("creatures you control get +P/+T and gain haste until end
 * of turn"): every non-mana creature can attack after it resolves. Worth it
 * when the pumped team is lethal on some opponent (score 100), or when it
 * adds at least card.minSwing (default 8) damage over attacking without it
 * against the best target. Damage uses estimateAttackDamage (real CPU
 * blocks, the player's one-blocker-each model).
 */
function scoreAnthem(card,opp,allPlayers){
  if(cpuCreaturesCannotAttack())return {score:-1};
  const bonusP=card.pumpP!=null?card.pumpP:2,bonusT=card.pumpT!=null?card.pumpT:1;
  const team=opp.tokens.filter(token=>!isManaToken(token));
  if(team.length<2)return {score:-1};
  const pumped=team.map(token=>Object.assign({},token,{p:(token.p||0)+bonusP,t:(token.t||0)+bonusT,summoningSick:false}));
  const unpumped=team.filter(token=>!token.summoningSick&&(token.p||0)>=1);
  let best={score:-1};
  (allPlayers||[]).filter(p=>p.id!==opp.id&&!isEliminatedTarget(p)).forEach(target=>{
    const withAnthem=estimateAttackDamage(opp,target,pumped).damage;
    const without=estimateAttackDamage(opp,target,unpumped).damage;
    let score=-1;
    if(withAnthem>=target.life)score=100+withAnthem-target.life;
    else if(withAnthem-without>=(card.minSwing||8))score=withAnthem-without;
    if(score>best.score)best={score,targetId:target.id,p:bonusP,t:bonusT};
  });
  return best;
}
/** Resolves a haymaker that scoreHaymaker approved. Returns the action. */
function castHaymaker(opp,card,evaluation,allPlayers){
  const undo=newUndoRecord();
  const others=cpuOpponentsFrom(allPlayers).filter(cpu=>cpu!==opp&&!isOpponentDead(cpu));
  const action={label:`Cast ${card.name}`,detail:card.effect,cardName:card.name,type:"haymaker",counterable:true,undo};
  if(card.haymaker==="anthem"){
    let count=0;
    opp.tokens.forEach(token=>{
      if(isManaToken(token))return;
      token.pumpP=(token.pumpP||0)+evaluation.p;token.pumpT=(token.pumpT||0)+evaluation.t;
      undo.pumps.push({ownerId:opp.id,uid:token.uid,p:evaluation.p,t:evaluation.t,kw:null,wasSick:!!token.summoningSick});
      token.summoningSick=false; // haste until end of turn
      count++;
    });
    applyBattlefieldRuleModifiers();
    action.detail=`${count} creature${count===1?"":"s"} get +${evaluation.p}/+${evaluation.t} and haste until end of turn.`;
    return action;
  }
  if(card.haymaker==="pumpTeam"){
    const x=evaluation.x;
    opp.tokens.forEach(token=>{
      token.pumpP=(token.pumpP||0)+x;token.pumpT=(token.pumpT||0)+x;
      const addsTrample=!hasKeyword(token,"Trample");
      token.pumpKws=(token.pumpKws||[]).concat(addsTrample?["Trample"]:[]);
      undo.pumps.push({ownerId:opp.id,uid:token.uid,p:x,t:x,kw:addsTrample?"Trample":null});
    });
    applyBattlefieldRuleModifiers();
    action.detail=`Your creatures get +${x}/+${x} and trample until end of turn.`;
    return action;
  }
  const damage=evaluation.damage;
  const source=evaluation.source||null;
  const killed=[];
  withRemovalSource(opp.id,()=>[opp,...others].forEach(cpu=>{
    cpu.tokens.filter(token=>token!==source&&damageWouldDestroy(token,damage)).forEach(token=>{
      if(removeTokenWithUndo(cpu,token,"graveyard",undo))killed.push(`${token.name}${cpu===opp?"":` (${shortName(cpu)})`}`);
    });
  }));
  const parts=[`${damage} damage to each ${source?"other ":""}creature.`];
  if(killed.length)parts.push(`Destroyed: ${killed.join(", ")}.`);
  if(card.haymaker==="ignition"){
    const state=liveGameState();
    const faceHits=[];
    others.forEach(cpu=>{const dealt=applyNoncombatCpuDamage(cpu,damage,undo);if(dealt){cpu.lastAttacker=opp.id;cpu.damageLog[opp.id]=(cpu.damageLog[opp.id]||0)+dealt;faceHits.push(`${shortName(cpu)} ${dealt}`);}});
    let playerDealt=0;
    if(state&&!isPlayerDead(state)){playerDealt=applyNoncombatCpuDamage(state.player,damage,undo);if(playerDealt)faceHits.push(`you ${playerDealt}`);}
    if(faceHits.length)parts.push(`Damage to each opponent: ${faceHits.join(", ")}.`);
    action.label=`Cast ${card.name}`;
    action.playerRemoval={cardName:card.name,instruction:`${source.name} deals ${damage} damage to each creature you control${playerDealt?` and ${playerDealt} damage to you (already applied to your life)`:""}. Destroy your creatures with toughness ${damage} or less.`};
  }else{
    action.playerRemoval={cardName:card.name,instruction:`${card.name} deals ${damage} damage to each creature you control. Destroy your creatures with toughness ${damage} or less.`};
  }
  action.detail=parts.join(" ");
  return action;
}
function clearTemporaryPumps(opp){
  let changed=false;
  opp.tokens.forEach(token=>{
    if(token.pumpP||token.pumpT||(token.pumpKws&&token.pumpKws.length)){token.pumpP=0;token.pumpT=0;token.pumpKws=[];changed=true;}
  });
  if(changed)applyBattlefieldRuleModifiers();
}

/* ---------- typed hand helpers ---------- */
function removeTypedCardFromHand(opp,card){
  const index=opp.typedHand.indexOf(card);
  if(index<0)return false;
  opp.typedHand.splice(index,1);
  opp.hand.other=Math.max(0,opp.hand.other-1);
  return true;
}
function isCreatureCard(card){return card.ref?.category==="creatures"||!!card.rampValue||!!card.isCreature;}
function addTypedRefToHand(opp,ref){
  opp.typedHand.push(typedHandCard(ref,deckOf(opp)));
  opp.hand.other++;
  return opp.typedHand[opp.typedHand.length-1];
}
/** Draws n cards for an effect. A draw from an empty library loses the game. */
function drawCardsForOpponent(opp,count,actions){
  let drawn=0;
  for(let i=0;i<count;i++){
    if(opponentDeckSize(opp)===0){
      opp.life=0;
      if(actions)actions.push({label:"Decked out",detail:"Tried to draw from an empty library. Life → 0.",deckOut:true,type:"deckOut"});
      break;
    }
    if(drawOpponentCard(opp)!=="none")drawn++;
  }
  return drawn;
}
/** Best graveyard card to regrow (typed cards only). */
function chooseRegrowthTarget(opp){
  const commander=commanderOnField(opp);
  const candidates=(opp.graveyard||[]).filter(card=>card.ref&&!card.virtual&&!card.isToken);
  if(!candidates.length)return null;
  const score=card=>{
    const category=card.ref.category;
    if(category==="gear")return commander?30+(card.bonus||0):12;
    if(category==="haymakers"||category==="boardwipes")return 20;
    if(category==="creatures")return 10+(card.cost||0);
    if(category==="protection")return commander?18:8;
    return 5;
  };
  return candidates.sort((a,b)=>score(b)-score(a))[0];
}
function regrowCard(opp,undo){
  const target=chooseRegrowthTarget(opp);
  if(!target)return null;
  const index=opp.graveyard.indexOf(target);
  opp.graveyard.splice(index,1);
  opp.graveyardCount=Math.max(0,(opp.graveyardCount||0)-1);
  addTypedRefToHand(opp,target.ref);
  if(undo)undo.regrowth={entry:target};
  return target;
}
function undoRegrowth(opp,undo){
  if(!undo||!undo.regrowth)return null;
  const entry=undo.regrowth.entry;
  const index=opp.typedHand.map((card,i)=>({card,i})).reverse().find(({card})=>card.ref&&card.ref.category===entry.ref.category&&card.ref.index===entry.ref.index);
  if(!index)return null;
  opp.typedHand.splice(index.i,1);
  opp.hand.other=Math.max(0,opp.hand.other-1);
  opp.graveyard.push(entry);opp.graveyardCount=(opp.graveyardCount||0)+1;
  return entry.name;
}

/* ---------- utility permanents (card.permanent) ---------- */
/**
 * Noncreature utility cards that stay on the battlefield. Deck files flag
 * them with card.permanent = {effect, types, ...}. Modeled effects:
 *   upkeepCard   extra card each upkeep          creatureDraw  draw on creature cast
 *   upkeepToken  create card.permanent.tokens at upkeep
 *   anthem       your creatures get +permanent.p/+permanent.t
 *   none         stays on the battlefield, no modeled trigger
 * Saves made before the flag existed get entry.permanent from
 * migrateLegacyCardNames (js/engine/state.js).
 */
/** Modeled definition of a utility permanent (card or battlefield entry), or null. */
function utilityPermanentDef(entry){return entry&&entry.permanent||null;}
function utilityPermanentTypes(entry){return (utilityPermanentDef(entry)||{}).types||["Permanent"];}
function isUtilityPermanentCard(card){return !!card&&!!utilityPermanentDef(card)&&!isCreatureCard(card);}
function utilityPermanentCount(opp,effect){
  return (opp.utilityPermanents||[]).filter(entry=>(utilityPermanentDef(entry)||{}).effect===effect).length;
}
/** Static +P/+T from this owner's anthem permanents. */
function ownerAnthemBonus(opp){
  return (opp.utilityPermanents||[]).reduce((sum,entry)=>{
    const def=utilityPermanentDef(entry);
    if(!def||def.effect!=="anthem")return sum;
    return {p:sum.p+(def.p||0),t:sum.t+(def.t||0)};
  },{p:0,t:0});
}

/* ---------- created creature tokens (go-wide decks) ---------- */
/**
 * Creates `count` creature tokens from a spec {name, ico, p, t, kws, haste}
 * for an opponent. Every token gets a uid/enteredTurn (addOpponentToken),
 * isToken:true (it ceases to exist when it leaves the battlefield) and is
 * recorded in undo.created so a countered source removes it again.
 * Returns the created tokens.
 */
function createTokenCreatures(opp,spec,count,sourceName,undo){
  const made=[];
  const p=spec.p!=null?spec.p:1,t=spec.t!=null?spec.t:1;
  for(let i=0;i<Math.max(0,count||0);i++){
    const kws=spec.kws?[...spec.kws]:[];
    const token=addOpponentToken(opp,{name:spec.name||"Soldier",ico:spec.ico||"🪖",kind:"voltron-creature",type:`Creature Token — ${spec.type||spec.name||"Soldier"}`,
      p,t,baseP:p,baseT:t,kws:[...kws],baseKws:kws,effect:`Token created by ${sourceName||"an effect"}.`,summoningSick:!spec.haste,owner:opp.id,isToken:true});
    made.push(token);
    if(undo){undo.created=undo.created||[];undo.created.push({ownerId:opp.id,uid:token.uid});}
  }
  if(made.length){
    opp.tokensCreated=(opp.tokensCreated||0)+made.length;
    bumpAiStat("tokensCreated",made.length);
    applyBattlefieldRuleModifiers();
  }
  return made;
}
function tokenSpecText(spec,count){return `${count} ${spec.p!=null?spec.p:1}/${spec.t!=null?spec.t:1} ${spec.name||"Soldier"} token${count===1?"":"s"}`;}
/** How many tokens a card's makesTokens spec creates right now. */
function makesTokensCount(opp,spec){
  if(!spec)return 0;
  if(spec.perCreature)return Math.min(spec.max||5,Math.max(spec.min||1,opp.tokens.filter(t=>!isManaToken(t)).length));
  return spec.count||1;
}
/** Upkeep: each upkeepToken permanent creates its tokens. Returns the action or null. */
function applyUpkeepTokenTriggers(opp){
  const sources=(opp.utilityPermanents||[]).filter(entry=>(utilityPermanentDef(entry)||{}).effect==="upkeepToken");
  if(!sources.length)return null;
  const made=[],names=[];
  sources.forEach(entry=>{
    const spec=utilityPermanentDef(entry).tokens||{};
    createTokenCreatures(opp,spec,spec.count||1,entry.name).forEach(token=>made.push(token));
    names.push(entry.name);
  });
  return made.length?{label:"Upkeep tokens",detail:`${names.join(", ")}: ${made.length} token${made.length===1?"":"s"} enter.`,type:"upkeep",tokenUids:made.map(t=>t.uid)}:null;
}
/**
 * Commander "beginning of combat on your turn" trigger (deck.commanderTrigger
 * = {when:"beginCombat", tokens:{...spec, count}}). Runs at the start of
 * executeOpponentCombat while the commander is on the battlefield.
 * Returns the action or null. Not a spell (not counterable).
 */
function applyBeginCombatTriggers(opp){
  const trigger=deckOf(opp).commanderTrigger;
  const commander=commanderOnField(opp);
  if(!trigger||trigger.when!=="beginCombat"||!commander)return null;
  const spec=trigger.tokens||{};
  const made=createTokenCreatures(opp,spec,spec.count||1,commander.name.split(",")[0]);
  if(!made.length)return null;
  return {label:`${commander.name.split(",")[0]}: create ${tokenSpecText(spec,made.length)}`,detail:trigger.text||"Beginning of combat trigger.",type:"trigger",counterable:false,
    tokenUid:made[0].uid,tokenUids:made.map(t=>t.uid)};
}
/** creatureDraw permanents: whenever this CPU casts a creature spell, draw a card. Appends to the action. */
function applyCreatureCastTriggers(opp,action){
  const count=utilityPermanentCount(opp,"creatureDraw");
  if(!count||!action)return action;
  const source=(opp.utilityPermanents||[]).find(entry=>(utilityPermanentDef(entry)||{}).effect==="creatureDraw");
  let drawn=0;
  for(let i=0;i<count;i++)if(opponentDeckSize(opp)>0&&drawOpponentCard(opp)!=="none")drawn++;
  if(drawn)action.detail=`${action.detail||""} ${source.name} draws ${drawn} card${drawn===1?"":"s"}.`.trim();
  return action;
}
/** upkeepCard permanents: an extra card at the beginning of each upkeep. Returns the action or null. */
function applyUpkeepCardTriggers(opp){
  const count=utilityPermanentCount(opp,"upkeepCard");
  if(!count)return null;
  let drawn=0;
  for(let i=0;i<count;i++)if(opponentDeckSize(opp)>0&&drawOpponentCard(opp)!=="none")drawn++;
  const source=(opp.utilityPermanents||[]).find(entry=>(utilityPermanentDef(entry)||{}).effect==="upkeepCard");
  return drawn?{label:source.name,detail:`Exiles the top card of the library and may play it this turn (+${drawn} card${drawn===1?"":"s"}).`,type:"upkeep"}:null;
}

/* ---------- CPU spell casting helpers (main phase) ---------- */
/** Creates a creature token from a typed card. */
function createCreatureTokenFromCard(opp,card){
  const p=card.p||1,t=card.t||1;
  const baseKws=card.kws?[...card.kws]:[];
  return addOpponentToken(opp,{name:card.name,ico:card.ico||"🐾",kind:card.rampValue?"voltron-support":"voltron-creature",
    type:"Creature",p,t,baseP:p,baseT:t,kws:[...baseKws],baseKws,effect:card.effect||"",summoningSick:!card.haste,owner:opp.id,
    rampValue:card.rampValue||0,ref:card.ref?{...card.ref}:null});
}
function castCreatureCard(opp,card,casting){
  removeTypedCardFromHand(opp,card);
  const token=createCreatureTokenFromCard(opp,card);
  if(card.rampValue)opp.rampInPlay+=card.rampValue;
  const action={label:`Cast ${card.name}`,detail:`${token.p}/${token.t} enters.`+(casting.additional?" Creature tax paid: "+casting.additional+".":""),
    tokenUid:token.uid,cardName:card.name,type:"creature",counterable:true};
  if(card.regrowth){
    const undo=newUndoRecord();
    const regrown=regrowCard(opp,undo);
    if(regrown){action.detail+=` Returns ${regrown.name} from the graveyard to hand.`;action.undo=undo;}
  }
  if(card.makesTokens){
    // "When this enters, create N tokens."
    const undo=action.undo||newUndoRecord();
    const made=createTokenCreatures(opp,card.makesTokens,makesTokensCount(opp,card.makesTokens),card.name,undo);
    if(made.length){action.detail+=` Creates ${tokenSpecText(card.makesTokens,made.length)}.`;action.undo=undo;action.tokenUids=[token.uid,...made.map(t=>t.uid)];}
  }
  return applyCreatureCastTriggers(opp,action);
}
function castFallbackRampCreature(opp,casting){
  const deck=deckOf(opp);
  const def=(deck&&deck.fallbackRampCreature)||(typeof FALLBACK_RAMP_CREATURE!=="undefined"&&FALLBACK_RAMP_CREATURE)||{name:"Wilds Guide",ico:"🌿",type:"Creature — Shaman",p:2,t:2,effect:"Taps for mana.",rampValue:1};
  opp.hand.ramp--;opp.rampInPlay+=def.rampValue||1;
  const token=addOpponentToken(opp,{name:def.name,ico:def.ico,kind:"voltron-support",type:def.type,p:def.p,t:def.t,baseP:def.p,baseT:def.t,
    kws:[],baseKws:[],effect:def.effect,summoningSick:true,owner:opp.id,rampValue:def.rampValue||1,fromRampCard:true});
  return applyCreatureCastTriggers(opp,{label:`Cast ${def.name}`,detail:`${def.p}/${def.t} ramp creature enters.`+(casting.additional?" Creature tax paid: "+casting.additional+".":""),
    tokenUid:token.uid,cardName:def.name,type:"creature",counterable:true});
}
function drawSpellCount(opp,card){
  const spec=card.draw||{mode:"fixed",count:3};
  if(spec.mode==="fixed")return spec.count||1;
  if(spec.mode==="power")return Math.max(1,Math.min(spec.max||5,greatestPower(opp.tokens)));
  if(spec.mode==="creatures")return Math.max(1,Math.min(spec.max||4,opp.tokens.filter(t=>!isManaToken(t)).length));
  return 0;
}
function greaterGoodSacrifice(opp){
  return opp.tokens.filter(token=>token.kind!=="commander").sort((a,b)=>(b.p||0)-(a.p||0))[0]||null;
}
/** Is a noncreature, non-protection spell worth casting right now? */
function spellIsUseful(opp,card){
  if(card.draw&&card.draw.mode==="sacrifice"){
    const victim=greaterGoodSacrifice(opp);
    return !!victim&&(victim.p||0)>=2&&opponentHandSize(opp)<=4;
  }
  if(card.draw)return true;
  if(card.regrowth)return !!chooseRegrowthTarget(opp);
  return true;
}
function castNoncreatureSpell(opp,card,casting,actions){
  removeTypedCardFromHand(opp,card);
  const tax=casting.additional?` Noncreature tax paid: ${casting.additional}.`:"";
  if(isUtilityPermanentCard(card)){
    // Stays on the battlefield; its modeled trigger runs from now on.
    const entry={name:card.name,ico:card.ico||"✦",ref:card.ref?{...card.ref}:null};
    if(card.permanent)entry.permanent=JSON.parse(JSON.stringify(card.permanent));
    opp.utilityPermanents=(opp.utilityPermanents||[]).concat(entry);
    if(card.permanent&&card.permanent.effect==="anthem")applyBattlefieldRuleModifiers();
    return {label:`Cast ${card.name}`,detail:(card.effect||"A permanent enters.")+tax,cardName:card.name,utilityName:card.name,type:"spell",counterable:true};
  }
  addOpponentGraveyardCard(opp,typedGraveyardCard(card));
  if(card.makesTokens){
    const undo=newUndoRecord();
    const made=createTokenCreatures(opp,card.makesTokens,makesTokensCount(opp,card.makesTokens),card.name,undo);
    return {label:`Cast ${card.name}`,detail:`${card.effect||""} Creates ${tokenSpecText(card.makesTokens,made.length)}.${tax}`.trim(),cardName:card.name,type:"spell",counterable:true,undo,
      tokenUid:made.length?made[0].uid:undefined,tokenUids:made.map(t=>t.uid)};
  }
  if(card.draw&&card.draw.mode==="sacrifice"){
    const victim=greaterGoodSacrifice(opp);
    const count=Math.max(1,victim.p||1);
    const undo=newUndoRecord();
    removeTokenWithUndo(opp,victim,"graveyard",undo);
    const drawn=drawCardsForOpponent(opp,count,actions);
    const discarded=discardFromOpponent(opp,3);
    return {label:`Cast ${card.name}`,detail:`Sacrifices ${victim.name}, draws ${drawn} card${drawn===1?"":"s"}, then discards ${discarded.length}.${tax}`,
      cardName:card.name,type:"draw",counterable:true,discarded};
  }
  if(card.draw){
    const count=drawSpellCount(opp,card);
    const drawn=drawCardsForOpponent(opp,count,actions);
    return {label:`Cast ${card.name}`,detail:`${card.effect} Draws ${drawn} card${drawn===1?"":"s"}.${tax}`,cardName:card.name,type:"draw",counterable:true};
  }
  if(card.regrowth){
    const undo=newUndoRecord();
    const regrown=regrowCard(opp,undo);
    return {label:`Cast ${card.name}`,detail:regrown?`Returns ${regrown.name} from the graveyard to hand.${tax}`:`${card.effect}${tax}`,cardName:card.name,type:"spell",counterable:true,undo};
  }
  return {label:`Cast ${card.name}`,detail:(card.effect||"Resolves a spell.")+tax,cardName:card.name,type:"spell",counterable:true};
}
/*
 * Card roles — every deck flags its cards in the deck file:
 *   card.protect: true      instant that protects a creature (held-mana response)
 *   card.wipeProtect: true  also protects the whole board from a wipe
 *   card.removal: true      spot removal aimed at the archenemy's best threat;
 *                           card.removalInstruction ("{target}" placeholder) is
 *                           shown to the player when they are the target
 *   card.ruleRemoval: "any" | "artifactEnchantment"  can remove battlefield rules
 *   card.removalLeavesToken: {name, ico, p, t}  the removed permanent's
 *                           controller creates this token
 */
function isProtectionCard(card){return !!card&&!!card.protect;}
function isWipeProtectionCard(card){return !!card&&!!card.wipeProtect;}
function isRemovalCard(card){return !!card&&!!card.removal;}
/** Instruction shown to the player when a removal card targets them. */
function removalInstructionText(card,what){
  if(card.removalInstruction)return card.removalInstruction.replace("{target}",what);
  return `Remove ${what} from the battlefield.`;
}
/**
 * Spot removal (card.removal) aimed at the archenemy's best
 * threat. Player archenemy → a playerRemoval instruction (planeswalker first,
 * else the most threatening creature). CPU archenemy → its commander when it
 * is a real threat (8+ power, or 12+ commander damage dealt to this CPU);
 * that CPU may answer with a held protection spell (cpuRespondToRemoval).
 * Returns {action, cost} or null.
 */
function tryCpuRemoval(opp,mana,allPlayers,turnSpellState){
  const archenemy=archenemyFor(opp,allPlayers);
  if(!archenemy)return null;
  const card=opp.typedHand.filter(isRemovalCard)
    .map(candidate=>({card:candidate,casting:cpuCanCast(candidate,candidate.cost,mana,"protection",turnSpellState)}))
    .filter(entry=>entry.casting.canCast)[0];
  if(!card)return null;
  if(archenemy.id==="player"){
    const hasTargets=(archenemy.creatures||0)>=2||(archenemy.planeswalkers||[]).length>0;
    if(!hasTargets)return null;
    removeTypedCardFromHand(opp,card.card);
    addOpponentGraveyardCard(opp,typedGraveyardCard(card.card));
    const pw=[...(archenemy.planeswalkers||[])].sort((a,b)=>(b.loyalty||0)-(a.loyalty||0))[0];
    const best=playerCreatureProfile(archenemy).filter(t=>t.name!=="Creature").sort((a,b)=>(b.p||0)-(a.p||0))[0];
    const what=pw?`${pw.name||"your highest-loyalty planeswalker"} (your highest-loyalty planeswalker)`:best?`${best.name} (your most threatening creature)`:"your most threatening creature";
    const instruction=removalInstructionText(card.card,what);
    bumpAiStat("playerRemovals");
    return {action:{label:`Cast ${card.card.name} targeting you`,detail:`${card.card.effect} You are leading the table.`,cardName:card.card.name,type:"removal",counterable:true,
      playerRemoval:{cardName:card.card.name,instruction,leavesToken:card.card.removalLeavesToken?1:0}},cost:card.casting.cost};
  }
  const target=liveOpponentObject(archenemy.id,allPlayers);
  const commander=target&&commanderOnField(target);
  if(!commander||hasKeyword(commander,"Hexproof"))return null;
  const dealtToMe=(opp.commanderDamageReceived||{})[target.id]||0;
  if((commander.p||0)<8&&dealtToMe<12)return null;
  removeTypedCardFromHand(opp,card.card);
  addOpponentGraveyardCard(opp,typedGraveyardCard(card.card));
  bumpAiStat("cpuRemovals");
  const action={label:`Cast ${card.card.name} targeting ${shortName(target)}'s ${commander.name.split(",")[0]}`,detail:card.card.effect,
    cardName:card.card.name,type:"removal",counterable:true,removalTarget:{ownerId:target.id,uid:commander.uid}};
  const response=cpuRespondToRemoval(target,commander);
  if(response){
    action.detail+=` ${response.label}.`;
    action.response=response;
    return {action,cost:card.casting.cost};
  }
  const undo=newUndoRecord();
  withRemovalSource(opp.id,()=>removeTokenWithUndo(target,commander,"graveyard",undo));
  const leaves=card.card.removalLeavesToken;
  if(leaves){
    const p=leaves.p!=null?leaves.p:3,t=leaves.t!=null?leaves.t:3,tokenName=leaves.name||"Beast";
    const beast=addOpponentToken(target,{name:tokenName,ico:leaves.ico||"🐗",kind:"voltron-creature",type:`Creature — ${tokenName}`,p,t,baseP:p,baseT:t,kws:[],baseKws:[],
      effect:`Token created by ${card.card.name}.`,summoningSick:true,owner:target.id,isToken:true});
    undo.created=[{ownerId:target.id,uid:beast.uid}];
  }
  action.undo=undo;
  action.detail+=` ${commander.name.split(",")[0]} goes to the command zone${leaves?`; ${shortName(target)} creates a ${leaves.p!=null?leaves.p:3}/${leaves.t!=null?leaves.t:3} ${leaves.name||"Beast"}`:""}.`;
  return {action,cost:card.casting.cost};
}
/** Back-compat name. */
function tryCpuPlayerRemoval(opp,mana,allPlayers,turnSpellState){return tryCpuRemoval(opp,mana,allPlayers,turnSpellState);}

/* ---------- gear choice (scaled by power level) ---------- */
/**
 * Equip cost after power-level efficiency: level 1 pays 1 more (clunky
 * sequencing), level 5 equips for 1 less (minimum 1).
 */
function gearEquipCost(gear,settings){
  const base=gear.equip!=null?gear.equip:2;
  const level=(settings||cpuSettings()).powerLevel;
  if(level<=1)return base+1;
  return level>=5?Math.max(1,base-1):base;
}
/**
 * Best gear to cast + equip with this mana. Level 1 picks any affordable
 * piece at random, level 2 the cheapest, level 3+ the most bonus per mana.
 */
function chooseGearToCast(opp,mana,turnSpellState,settings){
  const options=opp.typedHand.filter(c=>c.ref?.category==="gear")
    .map(card=>({card,casting:cpuCanCast(card,card.cost,mana,"gear",turnSpellState),equip:gearEquipCost(card,settings)}))
    .filter(({casting,equip})=>casting.canCast&&casting.cost+equip<=mana);
  if(!options.length)return null;
  const level=settings.powerLevel;
  if(level<=1)return options[Math.floor(Math.random()*options.length)];
  if(level===2)return options.sort((a,b)=>(a.casting.cost+a.equip)-(b.casting.cost+b.equip))[0];
  return options.sort((left,right)=>(right.card.bonus/(right.casting.cost+right.equip))-(left.card.bonus/(left.casting.cost+left.equip)))[0];
}
/** Casts + equips a chosen gear entry. Returns the action. */
function castAndEquipGear(opp,commander,best){
  const gear=best.card;
  opp.attachedGear=(opp.attachedGear||[]).concat({name:gear.name,bonus:gear.bonus||0,kw:gear.kw||null,equip:gear.equip||0,ref:gear.ref?{...gear.ref}:null});
  removeTypedCardFromHand(opp,gear);
  refreshCommanderGear(opp);
  return {label:`Cast + Equip ${gear.name}`,detail:gear.effect+". Now "+commander.p+"/"+commander.t+"."+(best.casting.additional?" Noncreature tax paid: "+best.casting.additional+".":""),
    gearName:gear.name,cardName:gear.name,type:"gear",counterable:true};
}

/** Re-equips loose equipment (activated ability: not a spell, not counterable). */
function equipLooseGear(opp,mana,actions){
  const commander=commanderOnField(opp);
  if(!commander)return mana;
  const settings=cpuSettings();
  opp.looseGear=opp.looseGear||[];
  const ordered=opp.looseGear.map(gear=>({gear,equip:gearEquipCost(gear,settings)})).sort((a,b)=>(b.gear.bonus||0)/(b.equip||1)-(a.gear.bonus||0)/(a.equip||1));
  ordered.forEach(({gear,equip})=>{
    if(equip>mana)return;
    mana-=equip;
    opp.looseGear.splice(opp.looseGear.indexOf(gear),1);
    opp.attachedGear.push(gear);
    refreshCommanderGear(opp);
    actions.push({label:`Equip ${gear.name}`,detail:`Pays equip ${equip}. Now ${commander.p}/${commander.t}.`,gearName:gear.name,type:"equip",counterable:false});
  });
  return mana;
}

/* =====================================================================
   CPU TURN — split into main phase / combat / end step
   ===================================================================== */
/** Untap + upkeep: untaps this CPU's creatures, ends summoning sickness, resets held mana. */
function untapOpponent(opp){
  clearTemporaryPumps(opp);
  opp.tokens.forEach(token=>{
    token.attacking=false;token.tapped=false;token.summoningSick=false;
    // Upkeep triggers modelled: "+1/+1 counter at the beginning of your upkeep" (Primal Hydra).
    if(token.effect&&/upkeep, put a \+1\/\+1 counter/i.test(token.effect)){token.baseP=(token.baseP||0)+1;token.baseT=(token.baseT||0)+1;}
  });
  opp.heldMana=0;
  applyBattlefieldRuleModifiers();
}
/** Should this CPU skip its first draw (first player in a 1-CPU game)? */
function skipsFirstDraw(opp){
  const state=liveGameState();
  return !!state&&state.opponents.length===1&&state.firstSeat===opp.id&&!(opp.turnsTaken>0);
}
/** Cheapest castable protection instant in hand (for holding mana), or null. */
function cheapestHeldProtection(opp){
  return opp.typedHand.filter(isProtectionCard)
    .map(card=>({card,cost:cpuCastingRequirement(card,card.cost,"protection").cost}))
    .filter(entry=>isFinite(entry.cost))
    .sort((a,b)=>a.cost-b.cost)[0]||null;
}
/**
 * Mana to keep open for instant-speed protection: 1-2 once the commander is
 * out, the CPU has 6+ mana and a protection card (interaction > 0).
 */
function protectionReserve(opp,mana,settings){
  if(settings.interaction<=0||!commanderOnField(opp)||manaAvailable(opp)<6)return 0;
  const held=cheapestHeldProtection(opp);
  if(!held)return 0;
  return Math.min(mana,Math.max(1,Math.min(2,held.cost)));
}

/**
 * CPU main phase. Shared steps for every deck: untap, upkeep triggers, draw,
 * upkeep token triggers, land, battlefield-rule removal. Then the deck's own
 * priority hook deck.ai.mainPhase(opp, ctx) spends the mana (see
 * createMainPhaseContext for ctx). The shared wipe / haymaker / removal
 * policies are ctx steps the hook calls in its own order; the discard to
 * hand size is shared in executeOpponentEndStep.
 * Gruul Voltron's hook: ONE primary action (commander / fast mana / ramp, or
 * gear when the commander is out), loose equipment re-equips, then AT MOST
 * ONE secondary cast (board wipe, haymaker, removal, creature, draw/utility
 * spell). With the commander out and 6+ mana it keeps 1-2 mana open for a
 * protection instant.
 * Returns {actions}. Sets opp.heldMana to the mana left open.
 */
function executeOpponentMainPhase(opp, allPlayers){
  const actions=[];
  const turnSpellState={spellsCast:0};
  const state=liveGameState();
  const settings=cpuSettings(state);
  ensureAiRound(state);
  if(state)state.aiActiveOppId=opp.id;
  opp.actionSteps=actions;
  opp.attackTarget=null;opp.attackPower=0;opp._planeswalkerTarget=null;
  untapOpponent(opp);

  // Draw. A CPU that cannot complete its required draw loses the game.
  if(skipsFirstDraw(opp)){
    actions.push({label:"No draw",detail:"First player in a two-player game skips the first draw.",type:"drawStep"});
  }else if(opponentDeckSize(opp)===0){
    opp.life=0;
    actions.push({label:"Decked out",detail:"Cannot draw from an empty deck. Life → 0.",deckOut:true,type:"deckOut"});
    opp.turnsTaken=(opp.turnsTaken||0)+1;
    return {actions};
  }else{
    const upkeep=applyUpkeepCardTriggers(opp);
    if(upkeep)actions.push(upkeep);
    const drawn=drawOpponentCard(opp);
    if(drawn!=="none")actions.push({label:"Draw",detail:"Draws a card.",type:"drawStep"});
  }
  opp.turnsTaken=(opp.turnsTaken||0)+1;
  const upkeepTokens=applyUpkeepTokenTriggers(opp);
  if(upkeepTokens)actions.push(upkeepTokens);

  // Land drop
  if(opp.hand.lands>0){opp.hand.lands--;opp.landsInPlay++;actions.push({label:"Land drop",detail:`${plural(opp.landsInPlay,"land")} in play.`,type:"land"});}

  let mana=manaAvailable(opp);
  applyBattlefieldRuleModifiers();
  mana=tryCpuRemoveBattlefieldRule(opp,mana,actions,turnSpellState);

  // Deck-specific priorities.
  const ctx=createMainPhaseContext(opp,allPlayers,{mana,actions,turnSpellState,settings,state});
  const ai=deckAi(opp);
  if(ai&&typeof ai.mainPhase==="function")ai.mainPhase(opp,ctx);
  else defaultDeckMainPhase(opp,ctx);

  applyBattlefieldRuleModifiers();
  opp.heldMana=Math.max(0,ctx.mana);
  return {actions};
}

/** Fallback hook for a deck without ai.mainPhase: the Voltron priorities. */
function defaultDeckMainPhase(opp,ctx){
  if(!ctx.commander())ctx.castCommander()||ctx.castFastMana()||ctx.castRamp();
  if(ctx.commander()){
    ctx.equipLooseGear();
    if(!ctx.castThisTurn("commander"))ctx.castGear();
  }
  ctx.castSecondary(VOLTRON_SECONDARY_STEPS);
}

/**
 * The ctx handed to deck.ai.mainPhase(opp, ctx). Every step spends from
 * ctx.mana, appends its action to ctx.actions and returns true when it did
 * something. Data (read-only for hooks): opp, allPlayers, state, settings
 * ({powerLevel, aggression, interaction}), actions, mana.
 * Steps:
 *   commander()            commander token on the battlefield or null
 *   castThisTurn(type)     an action of that type was taken this turn
 *   castCommander()        from the command zone (tax) or from hand (no tax)
 *   castFastMana()         one fast-mana card from hand (+2 mana next turn)
 *   castRamp()             one ramp card from hand (+1 mana next turn)
 *   equipLooseGear()       re-equip unattached equipment (not a spell)
 *   castGear()             best gear + equip onto the commander
 *   castTokenMaker()       best castable card that creates creature tokens
 *   castSecondary(steps)   holds protection mana, then casts the FIRST step that
 *                          succeeds from steps (names in SECONDARY_STEP_NAMES)
 *   manaAvailable()        total mana sources (not what is left)
 */
function createMainPhaseContext(opp,allPlayers,base){
  const ctx={opp,allPlayers,state:base.state,settings:base.settings,actions:base.actions,mana:base.mana,turnSpellState:base.turnSpellState};
  const tss=base.turnSpellState,actions=base.actions;
  ctx.commander=()=>commanderOnField(opp);
  ctx.castThisTurn=type=>actions.some(action=>action.type===type);
  ctx.manaAvailable=()=>manaAvailable(opp);
  ctx.castCommander=()=>{
    if(commanderOnField(opp))return false;
    const fromHand=!!opp.commanderInHand;
    const casting=cpuCanCast(null,commanderCost(opp),ctx.mana,"commander",tss);
    if(!(casting.canCast&&deployCommander(opp)))return false;
    ctx.mana-=casting.cost;
    recordCpuSpellCast(tss);
    const commander=commanderOnField(opp);
    const where=fromHand?" from hand (no commander tax)":(opp.commanderTax?` from the command zone (+${opp.commanderTax} tax)`:"");
    actions.push(applyCreatureCastTriggers(opp,{label:`Cast ${opp.name}`,detail:`Commander enters${where}.`+(casting.additional?" Creature tax paid: "+casting.additional+".":""),
      tokenUid:commander.uid,cardName:opp.name,type:"commander",counterable:true,castFrom:fromHand?"hand":"commandZone"}));
    return true;
  };
  ctx.castFastMana=()=>{
    const casting=cpuCanCast(null,1,ctx.mana,"explosive",tss);
    if(!(opp.hand.explosive>0&&casting.canCast))return false;
    opp.hand.explosive--;opp.explosiveInPlay++;ctx.mana-=casting.cost;
    recordCpuSpellCast(tss);
    actions.push({label:"Fast mana",detail:"+2 mana next turn."+(casting.additional?" Noncreature tax paid: "+casting.additional+".":""),cardName:"Fast mana",type:"explosive",counterable:true});
    return true;
  };
  ctx.castRamp=()=>{
    const casting=cpuCanCast(null,2,ctx.mana,"ramp",tss);
    if(!(opp.hand.ramp>0&&casting.canCast))return false;
    opp.hand.ramp--;opp.rampInPlay++;ctx.mana-=casting.cost;
    recordCpuSpellCast(tss);
    actions.push({label:"Ramp",detail:"+1 mana next turn."+(casting.additional?" Noncreature tax paid: "+casting.additional+".":""),cardName:"Ramp spell",type:"ramp",counterable:true});
    return true;
  };
  ctx.equipLooseGear=()=>{
    const before=actions.length;
    ctx.mana=equipLooseGear(opp,ctx.mana,actions);
    return actions.length>before;
  };
  ctx.castGear=()=>{
    const commander=commanderOnField(opp);
    if(!commander)return false;
    const best=chooseGearToCast(opp,ctx.mana,tss,ctx.settings);
    if(!best)return false;
    ctx.mana-=best.casting.cost+best.equip;
    recordCpuSpellCast(tss);
    actions.push(castAndEquipGear(opp,commander,best));
    return true;
  };
  ctx.castTokenMaker=()=>{
    const result=castBestTokenMaker(opp,ctx.mana,actions,tss);
    if(result==null)return false;
    ctx.mana=result;
    return true;
  };
  ctx.castSecondary=steps=>{
    const before=actions.length;
    const reserve=protectionReserve(opp,ctx.mana,ctx.settings);
    if(reserve>0)bumpAiStat("heldManaTurns");
    ctx.mana=castOneSecondarySpell(opp,ctx.mana-reserve,allPlayers,actions,tss,steps)+reserve;
    return actions.length>before;
  };
  return ctx;
}

/** Cards that create creature tokens: makesTokens spells/creatures and upkeepToken permanents. */
function isTokenMakerCard(card){
  return !!card&&(!!card.makesTokens||((utilityPermanentDef(card)||{}).effect==="upkeepToken"&&!isCreatureCard(card)));
}
/** Tokens a token maker is expected to create (upkeep makers count two upkeeps). */
function tokenMakerValue(opp,card){
  if(card.makesTokens)return makesTokensCount(opp,card.makesTokens)*((card.makesTokens.p||1)+(card.makesTokens.t||1))+(isCreatureCard(card)?(card.p||0)+(card.t||0):0);
  const spec=(utilityPermanentDef(card)||{}).tokens||{};
  return 2*(spec.count||1)*((spec.p||1)+(spec.t||1));
}
/** Casts the best castable token maker. Returns the remaining mana, or null when nothing was cast. */
function castBestTokenMaker(opp,mana,actions,turnSpellState){
  const best=opp.typedHand.filter(isTokenMakerCard)
    .map(card=>({card,casting:cpuCanCast(card,card.cost,mana,isCreatureCard(card)?"creatures":card.ref?.category,turnSpellState)}))
    .filter(({casting})=>casting.canCast)
    .sort((a,b)=>tokenMakerValue(opp,b.card)-tokenMakerValue(opp,a.card)||b.card.cost-a.card.cost)[0];
  if(!best)return null;
  mana-=best.casting.cost;
  recordCpuSpellCast(turnSpellState);
  actions.push(isCreatureCard(best.card)?castCreatureCard(opp,best.card,best.casting):castNoncreatureSpell(opp,best.card,best.casting,actions));
  return mana;
}

/** Gruul Voltron's secondary priority (castOneSecondarySpell's default order). */
var VOLTRON_SECONDARY_STEPS=["wipe","haymaker","removalVsCpu","extraGear","creature","fallbackRamp","spell","removalVsPlayer"];
/** Every step name castSecondary understands. */
var SECONDARY_STEP_NAMES=VOLTRON_SECONDARY_STEPS.concat(["tokenMaker"]);

/**
 * Picks and casts the single best secondary spell: the first step in `steps`
 * (default VOLTRON_SECONDARY_STEPS) that casts something. Returns remaining mana.
 *   wipe            board wipe when the table is out of hand (evaluateAndCastBoardWipe)
 *   haymaker        haymaker with real impact (scoreHaymaker, incl. anthems)
 *   removalVsCpu    removal at a CPU archenemy's commander (big threat only)
 *   extraGear       power level 4+: a second piece of gear when the commander is out
 *   creature        a creature (most expensive castable first; mana dorks count)
 *   fallbackRamp    modeled ramp creature from a generic ramp card (commander not out)
 *   spell           draw / utility spells (cheapest useful first; protection stays in hand)
 *   removalVsPlayer removal aimed at the player's board when the player leads
 *   tokenMaker      best castable token maker (castBestTokenMaker)
 */
function castOneSecondarySpell(opp,mana,allPlayers,actions,turnSpellState,steps){
  if(mana<=0&&!opp.typedHand.some(card=>card.scaleCost))return mana;
  const commander=commanderOnField(opp);
  const settings=cpuSettings();
  let archenemy;
  const getArchenemy=()=>archenemy===undefined?(archenemy=archenemyFor(opp,allPlayers)):archenemy;
  const run={
    wipe(){
      const wipe=evaluateAndCastBoardWipe(opp,mana,allPlayers,actions,turnSpellState);
      return wipe.cast?wipe.manaRemaining:null;
    },
    haymaker(){
      const haymakers=opp.typedHand.filter(card=>card.ref?.category==="haymakers"&&card.haymaker)
        .map(card=>{
          const casting=cpuCanCast(card,haymakerCost(card,opp,allPlayers),mana,"haymakers",turnSpellState);
          return {card,casting,evaluation:casting.canCast?scoreHaymaker(card,opp,allPlayers):{score:-1}};
        })
        .filter(entry=>entry.casting.canCast&&entry.evaluation.score>0)
        .sort((a,b)=>b.evaluation.score-a.evaluation.score);
      if(!haymakers.length)return null;
      const {card,casting,evaluation}=haymakers[0];
      removeTypedCardFromHand(opp,card);
      addOpponentGraveyardCard(opp,typedGraveyardCard(card));
      recordCpuSpellCast(turnSpellState);
      actions.push(castHaymaker(opp,card,evaluation,allPlayers));
      return mana-casting.cost;
    },
    removalVsCpu(){
      const enemy=getArchenemy();
      if(!enemy||enemy.id==="player")return null;
      const removal=tryCpuRemoval(opp,mana,allPlayers,turnSpellState);
      if(!removal)return null;
      recordCpuSpellCast(turnSpellState);actions.push(removal.action);
      return mana-removal.cost;
    },
    extraGear(){
      if(!(commander&&settings.powerLevel>=4))return null;
      const gear=chooseGearToCast(opp,mana,turnSpellState,settings);
      if(!gear)return null;
      recordCpuSpellCast(turnSpellState);
      actions.push(castAndEquipGear(opp,commander,gear));
      return mana-(gear.casting.cost+gear.equip);
    },
    creature(){
      const creature=opp.typedHand.filter(isCreatureCard)
        .map(card=>({card,casting:cpuCanCast(card,card.cost,mana,"creatures",turnSpellState)}))
        .filter(({casting})=>casting.canCast)
        .sort((left,right)=>right.card.cost-left.card.cost)[0];
      if(!creature)return null;
      recordCpuSpellCast(turnSpellState);
      actions.push(castCreatureCard(opp,creature.card,creature.casting));
      return mana-creature.casting.cost;
    },
    fallbackRamp(){
      const casting=cpuCanCast(null,2,mana,"creatures",turnSpellState);
      if(!(opp.hand.ramp>0&&!commander&&casting.canCast))return null;
      recordCpuSpellCast(turnSpellState);
      actions.push(castFallbackRampCreature(opp,casting));
      return mana-casting.cost;
    },
    spell(){
      const spell=opp.typedHand
        .filter(card=>!isCreatureCard(card)&&!["gear","protection","boardwipes","haymakers"].includes(card.ref?.category)&&spellIsUseful(opp,card))
        .map(card=>({card,casting:cpuCanCast(card,card.cost,mana,card.ref?.category,turnSpellState)}))
        .filter(({casting})=>casting.canCast)
        .sort((left,right)=>{
          const rank=entry=>entry.card.draw||entry.card.regrowth?0:1;
          return rank(left)-rank(right)||left.card.cost-right.card.cost;
        })[0];
      if(!spell)return null;
      recordCpuSpellCast(turnSpellState);
      actions.push(castNoncreatureSpell(opp,spell.card,spell.casting,actions));
      return mana-spell.casting.cost;
    },
    removalVsPlayer(){
      const enemy=getArchenemy();
      if(!enemy||enemy.id!=="player")return null;
      const removal=tryCpuRemoval(opp,mana,allPlayers,turnSpellState);
      if(!removal)return null;
      recordCpuSpellCast(turnSpellState);
      actions.push(removal.action);
      return mana-removal.cost;
    },
    tokenMaker(){return castBestTokenMaker(opp,mana,actions,turnSpellState);}
  };
  for(const step of steps||VOLTRON_SECONDARY_STEPS){
    const fn=run[step];
    if(!fn)continue;
    const remaining=fn();
    if(remaining!=null)return remaining;
  }
  return mana;
}

/**
 * CPU combat: choose a target (planTarget: lethal first, then the
 * archenemy) and declare attackers (sets token.attacking). Without lethal,
 * attackers that would die to blockers for no value stay home and enough
 * blockers stay back to survive the strongest opponent (applyHomeGuard).
 * Damage is resolved by the caller (UI response window / simulation).
 * Returns {target, attackPower, commanderAttacking, planeswalkerTarget, actions}.
 */
function executeOpponentCombat(opp, allPlayers){
  const actions=[];
  opp.actionSteps=opp.actionSteps||[];
  const none={target:null,attackPower:0,commanderAttacking:false,planeswalkerTarget:null,actions};
  opp.tokens.forEach(t=>{t.attacking=false;});
  opp.attackPower=0;opp._planeswalkerTarget=null;
  if(isOpponentDead(opp))return none;
  const state=liveGameState();
  if(state)state.aiActiveOppId=opp.id;
  const settings=cpuSettings(state);
  // Beginning of combat: commander token triggers (e.g. Boros Tokens).
  const trigger=applyBeginCombatTriggers(opp);
  if(trigger)actions.push(trigger);

  const target=chooseTarget(opp,allPlayers);
  const plan=lastTargetPlans[opp.id]||null;
  opp.attackTarget=target;
  let attackPower=0; let commanderAttacking=false;
  const targetEntry=target?allPlayers.find(p=>p.id===target):null;

  if(cpuCreaturesCannotAttack()){
    const restriction=activeBattlefieldRules("cpuCreatureAttackBan")[0];
    actions.push({label:"Combat restricted",detail:`${restriction.sourceName||"A battlefield rule"} prevents CPU creatures from attacking.`,type:"combat"});
  }else if(targetEntry){
    let attackers=plan&&plan.lethal&&plan.attackers?plan.attackers.filter(t=>opp.tokens.includes(t)&&!t.summoningSick)
      :profitableAttackers(opp,targetEntry);
    if(!(plan&&plan.lethal))attackers=applyHomeGuard(opp,attackers,allPlayers,settings,targetEntry);
    attackers.forEach(t=>{
      t.attacking=true;
      attackPower+=attackPowerOf(t);
      if(t.kind==="commander")commanderAttacking=true;
    });
  }
  opp.attackPower=attackPower;
  if(attackPower>0&&target){
    recordRoundTarget(state,target);
    if(target==="player")bumpAiStat("attacksOnPlayer");
    if(plan&&plan.lethal)bumpAiStat("lethalAttacks");
  }

  let planeswalkerTarget=null;
  if(attackPower>0&&target==="player"&&state&&!(plan&&plan.lethal))planeswalkerTarget=choosePlaneswalkerTarget(opp,state.player);
  opp._planeswalkerTarget=planeswalkerTarget;

  if(attackPower>0&&target){
    const tn=allPlayers.find(p=>p.id===target);
    let attackLabel=`Attack ${tn?(tn.id==="player"?"you":tn.name.split(',')[0]):"?"} for ${attackPower}`;
    const attackers=opp.tokens.filter(t=>t.attacking);
    const attackerCount=attackers.length;
    const held=opp.tokens.filter(t=>!t.attacking&&!t.summoningSick&&!isManaToken(t)&&(t.p||0)>=2).length;
    const heldText=held?` · ${held} held back to block`:"";
    let attackDetail=`${attackerCount} attacker${attackerCount===1?"":"s"}${heldText} · Target choice: ${deckStrategyLabels(opp)[opp.currentStrategy]}.`;
    if(planeswalkerTarget){
      attackLabel=`Attack ${planeswalkerTarget.name} (⬡ ${planeswalkerTarget.loyalty}) for ${attackPower}`;
      attackDetail=`Targeting your planeswalker · ${attackerCount} attacker${attackerCount===1?"":"s"}${heldText} · Target choice: ${deckStrategyLabels(opp)[opp.currentStrategy]}.`;
    }
    actions.push({label:attackLabel,detail:attackDetail,type:"attack",attackerUids:attackers.map(t=>t.uid),target,lethal:!!(plan&&plan.lethal)});
  }
  opp.actionSteps=opp.actionSteps.concat(actions);
  return {target,attackPower,commanderAttacking,planeswalkerTarget,actions};
}

/**
 * CPU end step: "until end of turn" effects end (unless keepPumps — used by
 * the legacy wrapper because its caller resolves combat afterwards), then the
 * CPU discards down to its maximum hand size, keeping its most useful cards.
 * Returns {actions}.
 */
function executeOpponentEndStep(opp, options){
  const actions=[];
  if(!(options&&options.keepPumps))clearTemporaryPumps(opp);
  const excessCards=Math.max(0,opponentHandSize(opp)-(deckOf(opp).maxCpuHandSize||MAX_CPU_HAND_SIZE));
  if(excessCards>0){
    const discarded=discardFromOpponent(opp,excessCards);
    const details=discarded.map(discardedCardText).join(", ");
    const typeSummary=discardedTypeSummary(discarded);
    actions.push({label:"Discard to hand size",detail:`Discards ${details}. Types: ${typeSummary}. Keeps ${opponentHandSize(opp)} card${opponentHandSize(opp)===1?"":"s"}.`,discarded,type:"discard"});
  }
  opp.actionSteps=(opp.actionSteps||[]).concat(actions);
  return {actions};
}

/**
 * Legacy one-shot CPU turn (main + combat declaration + end step).
 * Kept for the current UI and the simulation; returns the merged result.
 * Temporary pumps survive until the CPU's next untap here, because the
 * caller resolves combat damage after this returns.
 */
function executeOpponentTurn(opp, allPlayers) {
  const main=executeOpponentMainPhase(opp,allPlayers);
  if(isOpponentDead(opp)){
    opp.actionSteps=main.actions;
    return {target:null,attackPower:0,commanderAttacking:false,actions:main.actions,planeswalkerTarget:null};
  }
  const combat=executeOpponentCombat(opp,allPlayers);
  const end=executeOpponentEndStep(opp,{keepPumps:true});
  const actions=main.actions.concat(combat.actions,end.actions);
  opp.actionSteps=actions;
  return {target:combat.target,attackPower:combat.attackPower,commanderAttacking:combat.commanderAttacking,actions,planeswalkerTarget:combat.planeswalkerTarget};
}

/* =====================================================================
   COMMANDER BATTLE — Game state & orchestration
   ===================================================================== */
/**
 * New Commander battle. settings (optional) = {cpu:{powerLevel, aggression,
 * interaction}}; without it the previous game's settings are kept, else the
 * defaults. Stored as state.settings.cpu.
 */
/**
 * Deck id per CPU seat from settings.decks:
 *   undefined / null   every seat plays the default deck (Gruul Voltron)
 *   "mixed"            random registry decks, distinct while there are enough
 *                      (shuffled registry, then cycled)
 *   "<deck id>"        every seat plays that deck
 *   [id, id, ...]      per seat; missing/unknown entries → default, "random" → any deck
 */
function resolveSeatDecks(spec,seatCount){
  const registry=typeof DECK_REGISTRY!=="undefined"&&DECK_REGISTRY.length?DECK_REGISTRY:[defaultCommanderDeck()];
  const fallback=(defaultCommanderDeck()||registry[0]).id;
  const known=id=>registry.some(deck=>deck.id===id);
  const ids=[];
  if(spec==="mixed"){
    const order=fisherYatesShuffle(registry.map(deck=>deck.id));
    for(let i=0;i<seatCount;i++)ids.push(order[i%order.length]);
    return ids;
  }
  for(let i=0;i<seatCount;i++){
    const entry=Array.isArray(spec)?spec[i]:spec;
    if(entry==="random")ids.push(registry[Math.floor(Math.random()*registry.length)].id);
    else ids.push(typeof entry==="string"&&known(entry)?entry:fallback);
  }
  return ids;
}
function createCommanderBattle(numOpponents, settings) {
  const previous=liveGameState();
  const previousSettings=(previous&&previous.settings)||{};
  const cpuSource=settings&&(settings.cpu||(["powerLevel","aggression","interaction"].some(key=>key in settings)?settings:null));
  const cpu=normalizeCpuSettings(cpuSource||previousSettings.cpu);
  const seatCount=Math.min(4,Math.max(1,numOpponents));
  const decksSetting=settings&&settings.decks!=null?settings.decks:previousSettings.decks;
  const deckIds=resolveSeatDecks(decksSetting,seatCount);
  const opponents=[];
  for(let i=0;i<seatCount;i++) opponents.push(createOpponent(i,deckIds[i],cpu));
  // Random starting seat. The UI decides the flow; the engine only stores it
  // (and makes a CPU that goes first in a 1-CPU game skip its first draw).
  const seats=["player",...opponents.map(o=>o.id)];
  const firstSeat=seats[Math.floor(Math.random()*seats.length)];
  return {
    gameMode:"commanderBattle", turn:1, phase:"cpu", cpuTurnIndex:0, firstSeat,
    opponents, player:{id:"player",name:"You",life:40,poison:0,creatures:0,handSize:7,librarySize:92,graveyardCount:0,graveyard:[],nextGraveyardCardId:0,discardHistory:[],exileCount:0,exile:[],nextExileCardId:0,commanderDamageReceived:{},commanderDamageDealt:{},tokens:[],nextTokenUid:0,planeswalkers:[]},
    battlefieldRules:[], nextBattlefieldRuleId:0,
    discardHistory:[], log:[], viewMode:"table", viewTarget:0, gameOver:false, winner:null,
    settings:decksSetting!=null?{cpu,decks:decksSetting}:{cpu}, roundTargets:{}, aiStats:{},
  };
}

function playerAsTarget(state){
  const p=state.player;
  return {id:"player",name:"You",life:p.life,poison:p.poison||0,creatures:p.creatures,tokens:p.tokens||[],planeswalkers:p.planeswalkers||[],
    commanderDamageReceived:p.commanderDamageReceived||{},commanderDamageDealt:p.commanderDamageDealt||{},
    handSize:p.handSize!=null?p.handSize:7,commanderPower:p.commanderPower||0};
}
function allPlayersForTargeting(state){const all=[playerAsTarget(state)];state.opponents.forEach(o=>{if(!isOpponentDead(o))all.push(o);});return all;}
function aliveOpponents(state){return state.opponents.filter(o=>!isOpponentDead(o));}
function isPlayerDead(state){
  if(state.player.life<=0)return true;
  if((state.player.poison||0)>=10)return true;
  for(const[,dmg]of Object.entries(state.player.commanderDamageReceived)){if(dmg>=21)return true;}
  return false;
}
function playerDeathReason(state){
  const player=state.player;
  if((player.poison||0)>=10)return "You were eliminated by poison counters.";
  const source=Object.entries(player.commanderDamageReceived||{}).find(([,dmg])=>dmg>=21);
  if(source){const opp=state.opponents.find(o=>o.id===source[0]);return `You took 21 commander damage from ${opp?shortName(opp):"a commander"}.`;}
  return "You were eliminated.";
}

/* ---------- combat damage application ---------- */
/** Most commander damage a commander can deal in one combat (its power, twice with double strike). */
function commanderDamageCap(attackerOpp){
  const commander=attackerOpp?commanderOnField(attackerOpp):null;
  return commander?Math.max(0,commander.p||0)*combatStrikeCount(commander):0;
}
/**
 * Applies CPU combat damage to a victim (the player or a CPU): prevention /
 * reduction, then life loss, then commander damage. Commander damage is
 * capped at the attacking commander's current power and never exceeds the
 * life loss (it is always also life loss).
 * Returns {damage, commanderDamage, prevented, reduced}.
 */
function applyCommanderCombatDamage(attackerOpp, victim, damage, commanderDamage){
  const cappedCommander=Math.min(Math.max(0,commanderDamage||0),commanderDamageCap(attackerOpp),Math.max(0,damage||0));
  const prevention=applyCpuDamagePrevention(damage,cappedCommander);
  if(prevention.damage>0){
    victim.life=Math.max(0,victim.life-prevention.damage);
    if(victim.damageLog)victim.damageLog[attackerOpp.id]=(victim.damageLog[attackerOpp.id]||0)+prevention.damage;
    if(victim.id!=="player")victim.lastAttacker=attackerOpp.id;
  }
  if(prevention.commanderDamage>0){
    victim.commanderDamageReceived=victim.commanderDamageReceived||{};
    victim.commanderDamageReceived[attackerOpp.id]=(victim.commanderDamageReceived[attackerOpp.id]||0)+prevention.commanderDamage;
    attackerOpp.commanderDamageDealt=attackerOpp.commanderDamageDealt||{};
    attackerOpp.commanderDamageDealt[victim.id]=(attackerOpp.commanderDamageDealt[victim.id]||0)+prevention.commanderDamage;
  }
  return prevention;
}

/**
 * Resolves a CPU attack on another CPU (blocks, damage, deaths) and logs it.
 * Returns the combat summary from resolveCpuCombat plus the prevention result.
 */
function resolveCpuVsCpuAttack(opp,tgt){
  const attackers=opp.tokens.filter(t=>t.attacking);
  if(!tgt||isOpponentDead(tgt)||attackers.length===0)return null;
  const combat=resolveCpuCombat(opp, tgt, attackers);
  const prevention=applyCommanderCombatDamage(opp,tgt,combat.damageToDefender,combat.commanderDamage);
  if(prevention.reduced)cmdLog(`Battlefield damage reduction lowers ${shortName(opp)}'s combat damage by ${prevention.reduced}.`);
  if(prevention.prevented)cmdLog(`Battlefield prevention stops ${prevention.prevented} damage from ${shortName(opp)}.`);
  withRemovalSource(opp.id,()=>{for(const dead of combat.defenderCreaturesKilled){
    const moved=removeOpponentPermanentByUid(tgt,dead.uid,"graveyard");
    if(moved)cmdLog(`${dead.name} (${shortName(tgt)}) dies blocking → ${moved.destination}.`);
  }});
  withRemovalSource(tgt.id,()=>{for(const dead of combat.attackerCreaturesKilled){
    const moved=removeOpponentPermanentByUid(opp,dead.uid,"graveyard");
    if(moved)cmdLog(`${dead.name} (${shortName(opp)}) dies in combat → ${moved.destination}.`);
  }});
  if(combat.blockedDescriptions.length>0){
    const blockSummary=combat.blockedDescriptions.map(b=>{
      if(b.attackerDies&&b.blockerDies)return `${b.attacker} trades with ${b.blocker}`;
      if(b.attackerDies)return `${b.blocker} kills ${b.attacker}`;
      if(b.blockerDies)return `${b.attacker} kills ${b.blocker}`;
      return `${b.blocker} blocks ${b.attacker}`;
    }).join("; ");
    cmdLog(`Combat: ${blockSummary}.`);
  }
  if(prevention.damage>0)cmdLog(`${combat.unblocked.length} unblocked → ${prevention.damage} damage to ${shortName(tgt)}. Life → ${tgt.life}.`);
  else if(combat.blockedDescriptions.length>0||prevention.prevented||prevention.reduced)cmdLog(`${shortName(tgt)} takes no combat damage from ${shortName(opp)}.`);
  return {...combat,prevention};
}

/* =====================================================================
   CPU-vs-CPU COMBAT SYSTEM
   Combat functions (hasKeyword, creatureCombatValue, combatDamageKills,
   trampleExcess, resolveSingleBlock, evaluateAttackProfitability,
   smartDeclareAttackers, cpuAssignBlockers, resolveCpuCombat) are in combat.js
   ===================================================================== */
function executeCpuTurnCycle(state) {
  const results=[];
  for(const opp of state.opponents){
    if(isOpponentDead(opp))continue;
    const main=executeOpponentMainPhase(opp,allPlayersForTargeting(state));
    if(isOpponentDead(opp)){results.push({opponent:opp,target:null,attackPower:0,commanderAttacking:false,actions:main.actions});continue;}
    const result=executeOpponentCombat(opp,allPlayersForTargeting(state));
    opp._pendingPlayerAttack=null;
    if(result.attackPower>0&&result.target){
      if(result.target==="player"){
        const commander=commanderOnField(opp);
        const cmdDmg=result.commanderAttacking&&commander?commander.p*combatStrikeCount(commander):0;
        opp._pendingPlayerAttack={totalPower:result.attackPower,commanderDamage:cmdDmg,
          attackers:opp.tokens.filter(t=>t.attacking).map(t=>({uid:t.uid,name:t.name,ico:t.ico,p:t.p,t:t.t,kind:t.kind}))};
      }else{
        resolveCpuVsCpuAttack(opp,state.opponents.find(p=>p.id===result.target));
      }
    }
    // Pending player attacks are resolved later, so keep pumps until the CPU's next untap.
    const end=executeOpponentEndStep(opp,{keepPumps:!!opp._pendingPlayerAttack});
    results.push({opponent:opp,...result,actions:main.actions.concat(result.actions,end.actions)});
  }
  return results;
}

function getPendingPlayerAttacks(state){
  const pending=[];
  for(const opp of state.opponents){if(opp._pendingPlayerAttack)pending.push({opponent:opp,attack:opp._pendingPlayerAttack});}
  return pending;
}

function checkCommanderBattleEnd(state){
  if(isPlayerDead(state))return {over:true,won:false,reason:playerDeathReason(state)};
  if(aliveOpponents(state).length===0)return {over:true,won:true,reason:"All opponents eliminated!"};
  return {over:false};
}

/* =====================================================================
   COUNTERING CPU SPELLS
   ===================================================================== */
/**
 * Counters a CPU spell action (from opp.actionSteps / a phase result) and
 * genuinely undoes what it did. Returns a log string (the caller logs it).
 * - Commander: leaves the battlefield to the command zone; the tax
 *   increments because a cast did occur.
 * - Creature: the created token is removed to the graveyard (mana
 *   creatures stop producing mana; an ETB regrowth is reversed).
 * - "Cast + Equip": that equipment is removed to the graveyard and the
 *   commander's stats refresh.
 * - Fast mana / ramp: the extra mana source is removed.
 * - Board wipe / haymaker / rule removal / regrowth: destroyed creatures,
 *   life loss, pumps and removed battlefield rules are restored.
 * - Draw spells: cards already drawn can't be un-drawn — only logged.
 * Mana spent is not refunded (the spell was cast).
 */
function counterOpponentAction(opp, action){
  const who=shortName(opp);
  if(!opp||!action)return "Nothing to counter.";
  if(!action.counterable)return `${action.label||"That action"} is not a spell and can't be countered.`;
  if(action.countered)return `${action.label} was already countered.`;
  action.countered=true;
  const name=action.cardName||action.gearName||String(action.label||"").replace(/^Cast (\+ Equip )?/i,"");
  switch(action.type){
    case "commander":{
      const token=findTokenByUid(opp,action.tokenUid)||commanderOnField(opp);
      if(!token||token.kind!=="commander")return `You counter ${who}'s commander, but it is no longer on the battlefield.`;
      opp.tokens=opp.tokens.filter(t=>t!==token);
      // Tax: +2 is charged when the commander returns to the zone (see commanderCost);
      // a countered cast from hand charges the earlier command-zone cast.
      returnCommanderToZone(opp);
      withRemovalSource("player",()=>noteCommanderRemoved(opp));
      applyBattlefieldRuleModifiers();
      return `You counter ${opp.name}. It returns to the command zone (tax now +${opp.commanderTax}).`;
    }
    case "creature":{
      const regrown=undoRegrowth(opp,action.undo);
      const createdNotes=undoCreatedTokens(action.undo);
      const token=findTokenByUid(opp,action.tokenUid);
      if(!token)return `You counter ${name}, but it is no longer on the battlefield.`;
      const moved=removeOpponentPermanentByUid(opp,token.uid,"graveyard");
      return `You counter ${name}: ${moved?movementCardText(moved):"removed"}.${regrown?` ${regrown} goes back to ${who}'s graveyard.`:""}${createdNotes.length?` Its ${createdNotes.length} token${createdNotes.length===1?" is":"s are"} removed.`:""}`;
    }
    case "gear":{
      const index=(opp.attachedGear||[]).map(g=>g.name).lastIndexOf(action.gearName);
      if(index<0)return `You counter ${action.gearName}, but it is no longer attached.`;
      const moved=removeOpponentPermanent(opp,`gear:${index}`,"graveyard");
      const commander=commanderOnField(opp);
      return `You counter ${action.gearName}: ${moved?movementCardText(moved):"removed"}.${commander?` ${commander.name.split(",")[0]} reverts to ${commander.p}/${commander.t}.`:""}`;
    }
    case "explosive":{
      if(opp.explosiveInPlay>0){opp.explosiveInPlay--;addOpponentGraveyardCard(opp,virtualGraveyardCard("explosive"));}
      return `You counter ${who}'s fast mana. It goes to the graveyard.`;
    }
    case "ramp":{
      if(opp.rampInPlay>0){opp.rampInPlay--;addOpponentGraveyardCard(opp,virtualGraveyardCard("ramp"));}
      return `You counter ${who}'s ramp spell. It goes to the graveyard.`;
    }
    case "draw":
      return `You counter ${name}. ${who} already drew the cards, so they stay in hand.`;
    case "wipe":case "haymaker":case "ruleRemoval":case "spell":case "removal":{
      const notes=undoRecord(action.undo);
      if(action.utilityName){
        const index=(opp.utilityPermanents||[]).map(entry=>entry.name).lastIndexOf(action.utilityName);
        if(index>=0){
          const [entry]=opp.utilityPermanents.splice(index,1);
          if((utilityPermanentDef(entry)||{}).effect==="anthem")applyBattlefieldRuleModifiers();
          const ref=entry.ref||findCardRefByName(entry.name,opp);
          addOpponentGraveyardCard(opp,ref?typedGraveyardCard(typedHandCard(ref,deckOf(opp))):{name:entry.name,ico:entry.ico||"✦",types:utilityPermanentTypes(entry),virtual:false});
          notes.push(`${entry.name} goes to the graveyard`);
        }
      }
      const regrown=undoRegrowth(opp,action.undo);
      if(regrown)notes.push(`${regrown} goes back to ${who}'s graveyard`);
      if(action.playerRemoval)notes.push("ignore its instruction for your board");
      return `You counter ${name}.${notes.length?" "+notes.join("; ")+".":""}`;
    }
    default:
      return `You counter ${name}.`;
  }
}

/* =====================================================================
   CPU INTERACTION — held mana, responses, previews
   Response probability = cpuResponseChance(settings) (interaction 0.5 → 0.8).
   ===================================================================== */
/** Casts a protection card from hand using held mana. Returns {cardName,label} or null. */
function cpuCastHeldProtection(opp,names,reason){
  if(!opp||isOpponentDead(opp))return null;
  const options=heldProtectionOptions(opp,names);
  if(!options.length)return null;
  const {card,casting}=options[0];
  removeTypedCardFromHand(opp,card);
  addOpponentGraveyardCard(opp,typedGraveyardCard(card));
  opp.heldMana=Math.max(0,(opp.heldMana||0)-casting.cost);
  return {cardName:card.name,label:`${shortName(opp)} casts ${card.name}${reason?`: ${reason}`:""}`};
}
function heldProtectionOptions(opp,names){
  const match=typeof names==="function"?names:(card=>names.includes(card.name));
  return opp.typedHand.filter(card=>match(card))
    .map(card=>({card,casting:cpuCanCast(card,card.cost,opp.heldMana||0,"protection",null)}))
    .filter(({casting})=>casting.canCast)
    .sort((a,b)=>a.casting.cost-b.casting.cost);
}
/** A creature worth a protection spell: the commander, 4+ power, or an early mana creature. */
function isKeyCreature(opp,token){
  if(!token)return false;
  if(token.kind==="commander")return true;
  if((token.p||0)>=4)return true;
  return isManaToken(token)&&manaAvailable(opp)<5;
}
/**
 * The CPU may answer removal aimed at one of its creatures with a protection
 * instant paid from opp.heldMana: it protects its commander or a key
 * creature (4+ power, or an early mana creature). Responds with probability
 * cpuResponseChance(settings). Consumes the card and mana.
 * Returns {cardName, label} or null.
 */
function cpuRespondToRemoval(opp, token){
  if(!opp||!token||isOpponentDead(opp))return null;
  if(!isKeyCreature(opp,token))return null;
  const stats=aiStats();
  stats.removalThreats=(stats.removalThreats||0)+1;
  if(!heldProtectionOptions(opp,isProtectionCard).length)return null;
  stats.removalResponseChances=(stats.removalResponseChances||0)+1;
  if(Math.random()>=cpuResponseChance(cpuSettings()))return null;
  const response=cpuCastHeldProtection(opp,isProtectionCard,`${token.name.split(",")[0]} is protected`);
  if(response)stats.removalResponses=(stats.removalResponses||0)+1;
  return response;
}
/**
 * The CPU may answer a board wipe with a wipeProtect spell when it has its
 * commander or 2+ creatures on the battlefield (probability scaled by the
 * interaction setting). Returns {cardName,label} or null.
 */
function cpuRespondToWipe(opp){
  if(!opp||isOpponentDead(opp))return null;
  if(!commanderOnField(opp)&&opp.tokens.length<2)return null;
  const stats=aiStats();
  stats.wipeThreats=(stats.wipeThreats||0)+1;
  if(!heldProtectionOptions(opp,isWipeProtectionCard).length)return null;
  stats.wipeResponseChances=(stats.wipeResponseChances||0)+1;
  if(Math.random()>=cpuResponseChance(cpuSettings()))return null;
  const response=cpuCastHeldProtection(opp,isWipeProtectionCard,"its permanents gain indestructible");
  if(response)stats.wipeResponses=(stats.wipeResponses||0)+1;
  return response;
}
/**
 * Who this CPU would attack if its turn started now: the same planTarget
 * used for its real attack (lethal first, then the archenemy with grudge /
 * damage adjustments and the 2-per-round cap), with its creatures treated
 * as untapped. No randomness, no state change.
 * Returns {targetId, targetName, reason} or null.
 */
function cpuIntentPreview(opp, state){
  const s=state||liveGameState();
  if(!opp||!s||isOpponentDead(opp))return null;
  const all=allPlayersForTargeting(s);
  const alive=all.filter(p=>p.id!==opp.id&&!isEliminatedTarget(p));
  if(!alive.length)return null;
  const plan=planTarget(opp,all,{assumeUntapped:true});
  if(!plan)return null;
  const pick=alive.find(p=>p.id===plan.targetId)||alive[0];
  const labels=deckStrategyLabels(opp);
  let reason=alive.length===1&&!plan.lethal?"Only opponent left":labels[plan.strategy]||labels[STRATEGIES.THREAT];
  if(plan.lethal)reason=`${labels[STRATEGIES.LETHAL]} (${plan.lethalKind==="commander"?"commander damage":plan.lethalKind==="poison"?"poison":"life total"})`;
  return {targetId:pick.id,targetName:pick.id==="player"?"You":shortName(pick),reason,lethal:!!plan.lethal};
}
/** What a CPU hand contains, by type: {lands, creatures, gear, protection, other, unknown}. */
function cpuHandBreakdown(opp){
  const result={lands:opp.hand.lands||0,creatures:0,gear:0,protection:0,other:(opp.hand.ramp||0)+(opp.hand.explosive||0),unknown:0};
  opp.typedHand.forEach(card=>{
    if(isCreatureCard(card))result.creatures++;
    else if(card.ref?.category==="gear")result.gear++;
    else if(card.ref?.category==="protection")result.protection++;
    else result.other++;
  });
  result.unknown=Math.max(0,(opp.hand.other||0)-opp.typedHand.length);
  return result;
}
/**
 * Table warnings for the player: a CPU that can eliminate you on its next
 * turn (same lethal math the AI uses), commander damage at 15+, and boards
 * whose power meets your life. Returns [{oppId, text}].
 */
function cpuLethalWarnings(state){
  const s=state||liveGameState();
  if(!s)return [];
  const warnings=[];
  const player=s.player;
  const projection=playerAsTarget(s);
  aliveOpponents(s).forEach(opp=>{
    const name=shortName(opp);
    const cmd=(player.commanderDamageReceived||{})[opp.id]||0;
    const commander=commanderOnField(opp);
    const commanderHit=commander?commander.p*combatStrikeCount(commander):0;
    const plan=isPlayerDead(s)?{lethal:false}:lethalPlan(opp,projection,{assumeUntapped:true});
    if(plan.lethal&&plan.kind==="commander")warnings.push({oppId:opp.id,text:`${name}: ${cmd}/21 commander damage to you, lethal next hit (${commanderHit} power)`});
    else if(cmd>=15)warnings.push({oppId:opp.id,text:`${name}: ${cmd}/21 commander damage to you`});
    const power=boardPower(opp);
    if(plan.lethal&&plan.kind==="life")warnings.push({oppId:opp.id,text:`${name}: can deal lethal damage next turn (${power} power on board vs your ${player.life} life)`});
    else if(power>0&&power>=player.life)warnings.push({oppId:opp.id,text:`${name}: ${power} power on board vs your ${player.life} life`});
    if(plan.lethal&&plan.kind==="poison")warnings.push({oppId:opp.id,text:`${name}: lethal poison next turn`});
  });
  if((player.poison||0)>=7)warnings.push({oppId:null,text:`You have ${player.poison}/10 poison counters`});
  return warnings;
}
/* =====================================================================
   PLAYER ACTIONS — direct instantiation against Commander Battle state
   ===================================================================== */
var PLAYER_ACTION_SCOPES=[
  {value:"target",label:"Target player"},
  {value:"each",label:"Each player"},
  {value:"eachOpponent",label:"Each opponent"}
];
var PLAYER_ACTIONS=[
  {value:"discard",label:"Discard cards"},
  {value:"mill",label:"Mill cards"},
  {value:"destroy",label:"Destroy permanents"},
  {value:"sacrifice",label:"Sacrifice permanents"},
  {value:"exile",label:"Exile permanents"},
  {value:"bounce",label:"Return permanents to hand"},
  {value:"exileGraveyards",label:"Exile all graveyards"},
  {value:"reanimate",label:"Resurrect selected creatures to your battlefield"},
  {value:"draw",label:"Draw cards"},
  {value:"loseLife",label:"Lose life"},
  {value:"gainLife",label:"Gain life"},
  {value:"poison",label:"Add poison counters"},
  {value:"tokens",label:"You create creature tokens"}
];
var PLAYER_ACTION_CARD_TYPES=["creature","artifact","land","permanent"];
var commanderEffectDraft=null;

function ensureCommanderEffectState(state){
  if(!state||!state.player)return;
  if(state.namesVersion!==NAMES_VERSION){
    migrateLegacyNames(state);
    refreshLegacyCardData(state);
  }
  const player=state.player;
  if(player.handSize==null)player.handSize=7;
  if(player.librarySize==null)player.librarySize=92;
  if(player.graveyardCount==null)player.graveyardCount=0;
  player.graveyard=player.graveyard||[];
  player.nextGraveyardCardId=player.nextGraveyardCardId||player.graveyard.length;
  player.discardHistory=player.discardHistory||[];
  if(player.exileCount==null)player.exileCount=0;
  player.exile=player.exile||[];
  player.nextExileCardId=player.nextExileCardId||player.exile.length;
  player.planeswalkers=player.planeswalkers||[];
  if(player.poison==null)player.poison=0;
  player.tokens=player.tokens||[];
  player.tokens.forEach(token=>registerToken(player,token));
  if(state.firstSeat==null)state.firstSeat="player";
  state.settings=state.settings||{};
  state.settings.cpu=normalizeCpuSettings(state.settings.cpu);
  state.roundTargets=state.roundTargets||{};
  state.aiStats=state.aiStats||{};
  state.discardHistory=state.discardHistory||[];
  state.battlefieldRules=state.battlefieldRules||[];
  state.nextBattlefieldRuleId=state.nextBattlefieldRuleId||state.battlefieldRules.length;
  (state.opponents||[]).forEach(opp=>{
    opp.typedHand=opp.typedHand||[];
    opp.graveyardCount=opp.graveyardCount||0;
    opp.graveyard=opp.graveyard||[];
    opp.nextGraveyardCardId=opp.nextGraveyardCardId||opp.graveyard.length;
    opp.discardHistory=opp.discardHistory||[];
    opp.exileCount=opp.exileCount||0;
    opp.exile=opp.exile||[];
    opp.nextExileCardId=opp.nextExileCardId||opp.exile.length;
    opp.attachedGear=opp.attachedGear||[];
    if(opp.attachedGear.length===0&&opp.gear>0){
      opp.attachedGear=Array.from({length:opp.gear},(_,index)=>({name:`Equipment ${index+1}`,bonus:0,kw:null}));
    }
    opp.gear=opp.attachedGear.length;
    opp.looseGear=opp.looseGear||[];
    if(opp.poison==null)opp.poison=0;
    if(opp.heldMana==null)opp.heldMana=0;
    opp.utilityPermanents=opp.utilityPermanents||[];
    if(opp.commanderInHand==null)opp.commanderInHand=false;
    opp.damageLog=opp.damageLog||{};
    opp.tokens.forEach(token=>registerToken(opp,token));
    normalizeOpponentLibrary(opp);
  });
}
/**
 * Saves made before the card rename / card flags: typed hand cards are
 * re-read from the deck definition (new names + role flags such as protect /
 * removal / permanent), utility permanents get their permanent definition,
 * and stored player-removal prompts learn whether they leave a token.
 */
function refreshLegacyCardData(state){
  (state.opponents||[]).forEach(opp=>{
    const deck=deckOf(opp);
    opp.typedHand=(opp.typedHand||[]).map(card=>{
      const ref=card&&card.ref;
      return ref&&deck&&deck.cards[ref.category]&&deck.cards[ref.category][ref.index]?typedHandCard(ref,deck):card;
    });
    (opp.utilityPermanents||[]).forEach(entry=>{
      if(entry.permanent)return;
      const def=cardDefinitionByName(entry.name,opp);
      if(def&&def.permanent)entry.permanent=JSON.parse(JSON.stringify(def.permanent));
    });
  });
  const seen=new Set();
  const walk=node=>{
    if(!node||typeof node!=="object"||seen.has(node))return;
    seen.add(node);
    if(node.playerRemoval&&node.playerRemoval.cardName&&node.playerRemoval.leavesToken==null){
      const def=cardDefinitionByName(node.playerRemoval.cardName);
      node.playerRemoval.leavesToken=def&&def.removalLeavesToken?1:0;
    }
    Object.values(node).forEach(walk);
  };
  walk(state.activeResult);
  (state.opponents||[]).forEach(opp=>walk(opp.actionSteps));
}
/**
 * Repairs saves made before typed opening hands: every hand.other card needs
 * a typedHand entry and otherDeck must mirror deck.other.
 */
function normalizeOpponentLibrary(opp){
  if(!opp.otherDeck||!opp.deck||!opp.hand)return;
  while(opp.typedHand.length<opp.hand.other&&opp.otherDeck.length>opp.deck.other){
    opp.typedHand.push(typedHandCard(opp.otherDeck.pop(),deckOf(opp)));
  }
  if(opp.typedHand.length<opp.hand.other)opp.hand.other=opp.typedHand.length;
  if(opp.typedHand.length>opp.hand.other)opp.hand.other=opp.typedHand.length;
  if(opp.otherDeck.length>opp.deck.other)opp.otherDeck.splice(0,opp.otherDeck.length-opp.deck.other);
  if(opp.otherDeck.length<opp.deck.other)opp.deck.other=opp.otherDeck.length;
}

var BATTLEFIELD_RULE_TYPES=[
  {value:"artifactCastBan",group:"Can / can't rules",label:"CPU artifacts can't be cast"},
  {value:"noncreatureCastBan",group:"Can / can't rules",label:"CPU noncreature spells can't be cast"},
  {value:"cpuSpellLimit",group:"Can / can't rules",label:"CPU can cast only one spell per turn"},
  {value:"cpuCreatureAttackBan",group:"Can / can't rules",label:"CPU creatures can't attack"},
  {value:"cpuCreatureBlockBan",group:"Can / can't rules",label:"CPU creatures can't block"},
  {value:"noncreatureTax",group:"Cost",label:"CPU noncreature spells cost more"},
  {value:"creatureTax",group:"Cost",label:"CPU creature spells cost more"},
  {value:"preventCpuDamage",group:"Replacement / prevention",label:"Prevent the next CPU damage"},
  {value:"cpuGraveyardExile",group:"Replacement / prevention",label:"CPU cards going to graveyards are exiled instead"},
  {value:"cpuDamageReduction",group:"Replacement / prevention",label:"CPU combat damage is reduced"},
  {value:"cpuCreaturePT",group:"Continuous effects & layers",label:"CPU creatures get +X/+Y"},
  {value:"cpuCreatureMinusPT",group:"Continuous effects & layers",label:"CPU creatures get -X/-Y"},
  {value:"cpuCreaturePowerCap",group:"Continuous effects & layers",label:"CPU creature power can't exceed X"},
  {value:"cpuCreatureKeywordLoss",group:"Continuous effects & layers",label:"CPU creatures lose modeled keywords"}
];
var battlefieldRuleDraft={kind:"artifactCastBan",sourceName:"",sourceType:"Enchantment",amount:2,power:1,toughness:1};

function battlefieldRules(){return gameState?.battlefieldRules||[];}
function activeBattlefieldRules(kind){return battlefieldRules().filter(rule=>!kind||rule.kind===kind);}
function battlefieldRuleLabel(rule){
  const source=rule.sourceName||"Unnamed rule";
  switch(rule.kind){
    case "artifactCastBan":return `${source}: CPU artifacts can't be cast`;
    case "noncreatureCastBan":return `${source}: CPU noncreature spells can't be cast`;
    case "cpuSpellLimit":return `${source}: CPU can cast only one spell each turn`;
    case "cpuCreatureAttackBan":return `${source}: CPU creatures can't attack`;
    case "cpuCreatureBlockBan":return `${source}: CPU creatures can't block`;
    case "noncreatureTax":return `${source}: CPU noncreature spells cost ${rule.amount} more`;
    case "creatureTax":return `${source}: CPU creature spells cost ${rule.amount} more`;
    case "preventCpuDamage":return `${source}: prevent next ${rule.remaining||0} CPU damage`;
    case "cpuGraveyardExile":return `${source}: CPU cards going to graveyards are exiled instead`;
    case "cpuDamageReduction":return `${source}: CPU combat damage is reduced by ${rule.amount}`;
    case "cpuCreaturePT":return `${source}: CPU creatures get ${formatSigned(rule.power)}/${formatSigned(rule.toughness)}`;
    case "cpuCreatureMinusPT":return `${source}: CPU creatures get -${Math.max(0,parseInt(rule.power)||0)}/-${Math.max(0,parseInt(rule.toughness)||0)}`;
    case "cpuCreaturePowerCap":return `${source}: CPU creature power can't exceed ${rule.amount}`;
    case "cpuCreatureKeywordLoss":return `${source}: CPU creatures lose modeled keywords`;
    default:return source;
  }
}
function formatSigned(value){const amount=parseInt(value)||0;return `${amount>=0?"+":""}${amount}`;}
function isPersistentBattlefieldRule(rule){return rule.kind!=="preventCpuDamage";}
function cpuCreatureModifier(){
  const bonus=activeBattlefieldRules("cpuCreaturePT").reduce((modifier,rule)=>({
    power:modifier.power+(parseInt(rule.power)||0),
    toughness:modifier.toughness+(parseInt(rule.toughness)||0)
  }),{power:0,toughness:0});
  const reduction=activeBattlefieldRules("cpuCreatureMinusPT").reduce((modifier,rule)=>({
    power:modifier.power+Math.max(0,parseInt(rule.power)||0),
    toughness:modifier.toughness+Math.max(0,parseInt(rule.toughness)||0)
  }),{power:0,toughness:0});
  return {power:bonus.power-reduction.power,toughness:bonus.toughness-reduction.toughness};
}
function cpuCreaturePowerCap(){
  const caps=activeBattlefieldRules("cpuCreaturePowerCap").map(rule=>Math.max(0,parseInt(rule.amount)||0));
  return caps.length?Math.min(...caps):Infinity;
}
function cpuCreaturesLoseModeledKeywords(){return activeBattlefieldRules("cpuCreatureKeywordLoss").length>0;}
function applyBattlefieldRuleModifiers(){
  if(!gameState)return;
  const modifier=cpuCreatureModifier();
  const powerCap=cpuCreaturePowerCap();
  const removeKeywords=cpuCreaturesLoseModeledKeywords();
  const defeated=[];
  gameState.opponents.forEach(opp=>{
    const anthem=ownerAnthemBonus(opp);
    opp.tokens.forEach(token=>{
      if(token.baseP==null)token.baseP=token.p||0;
      if(token.baseT==null)token.baseT=token.t||0;
      if(token.baseKws==null)token.baseKws=[...(token.kws||[])];
      // Temporary "until end of turn" pumps (haymakers) stack on top of rule modifiers.
      token.p=Math.max(0,Math.min(powerCap,token.baseP+modifier.power+anthem.p+(token.pumpP||0)));
      token.t=token.baseT+modifier.toughness+anthem.t+(token.pumpT||0);
      token.kws=removeKeywords?[]:[...new Set([...token.baseKws,...(token.pumpKws||[])])];
      if(token.t<=0)defeated.push({opp,token});
    });
  });
  defeated.forEach(({opp,token})=>{
    if(opp.tokens.indexOf(token)<0)return;
    const moved=removeOpponentPermanentByUid(opp,token.uid,"graveyard");
    if(moved)cmdLog(`${token.name} has 0 or less toughness and leaves the battlefield → ${moved.destination}.`);
  });
}
function cpuSpellDescriptor(card,category){
  const resolvedCategory=category||card?.ref?.category;
  if(resolvedCategory==="commander"||resolvedCategory==="creatures"||card?.isCreature||card?.rampValue)return {types:["Creature"],nonCreature:false};
  if(resolvedCategory==="gear"||resolvedCategory==="explosive"||(card?.permanent?.types||[]).includes("Equipment"))return {types:["Artifact"],nonCreature:true};
  if(resolvedCategory==="ramp"||resolvedCategory==="draw"||resolvedCategory==="haymakers"||resolvedCategory==="boardwipes")return {types:["Sorcery"],nonCreature:true};
  if(resolvedCategory==="protection")return {types:["Instant"],nonCreature:true};
  if(resolvedCategory==="utility")return {types:["Enchantment"],nonCreature:true};
  return {types:["Sorcery"],nonCreature:true};
}
function cpuCastingRequirement(card,baseCost,category){
  const descriptor=cpuSpellDescriptor(card,category);
  if(descriptor.types.includes("Artifact")&&activeBattlefieldRules("artifactCastBan").length)return {allowed:false,cost:Infinity,reason:"artifacts can't be cast"};
  if(descriptor.nonCreature&&activeBattlefieldRules("noncreatureCastBan").length)return {allowed:false,cost:Infinity,reason:"noncreature spells can't be cast"};
  const noncreatureTax=descriptor.nonCreature?activeBattlefieldRules("noncreatureTax").reduce((sum,rule)=>sum+(parseInt(rule.amount)||0),0):0;
  const creatureTax=descriptor.types.includes("Creature")?activeBattlefieldRules("creatureTax").reduce((sum,rule)=>sum+(parseInt(rule.amount)||0),0):0;
  const additional=noncreatureTax+creatureTax;
  return {allowed:true,cost:Math.max(0,(baseCost||0)+additional),additional,descriptor};
}
function cpuSpellLimitReached(turnSpellState){return activeBattlefieldRules("cpuSpellLimit").length>0&&(turnSpellState?.spellsCast||0)>=1;}
function recordCpuSpellCast(turnSpellState){if(turnSpellState)turnSpellState.spellsCast=(turnSpellState.spellsCast||0)+1;}
function cpuCanCast(card,baseCost,mana,category,turnSpellState){
  const requirement=cpuCastingRequirement(card,baseCost,category);
  if(requirement.allowed&&cpuSpellLimitReached(turnSpellState))return {...requirement,allowed:false,reason:"only one spell can be cast each turn",canCast:false};
  return {...requirement,canCast:requirement.allowed&&mana>=requirement.cost};
}
function cpuCreaturesCannotAttack(){return activeBattlefieldRules("cpuCreatureAttackBan").length>0;}
function cpuCreaturesCannotBlock(){return activeBattlefieldRules("cpuCreatureBlockBan").length>0;}
function cpuCardsGoToExileInstead(){return activeBattlefieldRules("cpuGraveyardExile").length>0;}
function battlefieldRuleRemovalPriority(rule){
  return {cpuSpellLimit:60,artifactCastBan:55,noncreatureCastBan:50,creatureTax:45,noncreatureTax:40,cpuCreatureAttackBan:35,cpuCreatureBlockBan:35,cpuGraveyardExile:30,cpuDamageReduction:25,cpuCreatureKeywordLoss:20,cpuCreaturePowerCap:20,cpuCreaturePT:20,cpuCreatureMinusPT:20}[rule.kind]||0;
}
function canCpuRemovalAffectRule(card,rule){
  if(card.ruleRemoval==="any")return true;
  return card.ruleRemoval==="artifactEnchantment"&&["Artifact","Enchantment"].includes(rule.sourceType);
}
function findCpuRuleRemoval(opp,mana,turnSpellState){
  const rules=activeBattlefieldRules().filter(isPersistentBattlefieldRule).sort((left,right)=>battlefieldRuleRemovalPriority(right)-battlefieldRuleRemovalPriority(left));
  if(!rules.length)return null;
  const answers=opp.typedHand
    .map((card,index)=>({card,index}))
    .filter(({card})=>!!card.ruleRemoval);
  for(const rule of rules){
    for(const answer of answers){
      const casting=cpuCanCast(answer.card,answer.card.cost,mana,undefined,turnSpellState);
      if(casting.canCast&&canCpuRemovalAffectRule(answer.card,rule))return {...answer,rule,casting};
    }
  }
  return null;
}
function tryCpuRemoveBattlefieldRule(opp,mana,actions,turnSpellState){
  const answer=findCpuRuleRemoval(opp,mana,turnSpellState);
  if(!answer)return mana;
  mana-=answer.casting.cost;
  const [card]=opp.typedHand.splice(answer.index,1);
  opp.hand.other=Math.max(0,(opp.hand.other||0)-1);
  const graveyardCard=typedGraveyardCard(card);
  addOpponentGraveyardCard(opp,graveyardCard);
  recordCpuSpellCast(turnSpellState);
  gameState.battlefieldRules=gameState.battlefieldRules.filter(rule=>rule.id!==answer.rule.id);
  applyBattlefieldRuleModifiers();
  const undo=newUndoRecord();undo.rule=JSON.parse(JSON.stringify(answer.rule));
  actions.push({label:`Cast ${card.name}`,detail:`Removes ${battlefieldRuleLabel(answer.rule)}.`,cardName:card.name,type:"ruleRemoval",counterable:true,undo});
  cmdLog(`${opp.name.split(",")[0]} casts ${card.name} to remove ${answer.rule.sourceName||"a battlefield rule"}.`);
  return mana;
}
/**
 * Shared prevention math. Reduction applies first, then one-shot prevention
 * shields (consumed only when consume is true). Commander damage never
 * exceeds the remaining (life-loss) damage.
 */
function computeCpuDamagePrevention(damage,commanderDamage,consume){
  let remainingDamage=Math.max(0,damage||0);
  let remainingCommanderDamage=Math.min(Math.max(0,commanderDamage||0),remainingDamage);
  const damageReduction=activeBattlefieldRules("cpuDamageReduction").reduce((sum,rule)=>sum+(parseInt(rule.amount)||0),0);
  const reduced=Math.min(remainingDamage,damageReduction);
  remainingDamage-=reduced;
  remainingCommanderDamage=Math.max(0,remainingCommanderDamage-reduced);
  let prevented=0;
  activeBattlefieldRules("preventCpuDamage").forEach(rule=>{
    if(remainingDamage<=0||!rule.remaining)return;
    const absorbed=Math.min(remainingDamage,rule.remaining);
    if(consume)rule.remaining-=absorbed;
    remainingDamage-=absorbed;
    remainingCommanderDamage-=Math.min(remainingCommanderDamage,absorbed);
    prevented+=absorbed;
  });
  remainingCommanderDamage=Math.min(remainingCommanderDamage,remainingDamage);
  const state=liveGameState();
  if(consume&&prevented&&state)state.battlefieldRules=state.battlefieldRules.filter(rule=>rule.kind!=="preventCpuDamage"||rule.remaining>0);
  return {damage:remainingDamage,commanderDamage:remainingCommanderDamage,prevented,reduced};
}
/** Applies CPU damage prevention/reduction, consuming prevention shields. */
function applyCpuDamagePrevention(damage,commanderDamage){return computeCpuDamagePrevention(damage,commanderDamage,true);}
/** Same return shape as applyCpuDamagePrevention but does NOT consume prevention shields. */
function previewCpuDamagePrevention(damage,commanderDamage){return computeCpuDamagePrevention(damage,commanderDamage,false);}
function addBattlefieldRule(draft){
  const kind=draft.kind;
  const sourceName=(draft.sourceName||"").trim()||"Unnamed battlefield rule";
  const rule={
    id:`rule:${++gameState.nextBattlefieldRuleId}`,
    kind,
    sourceName,
    sourceType:draft.sourceType||"Enchantment",
    amount:Math.max(0,parseInt(draft.amount)||0),
    power:kind==="cpuCreatureMinusPT"?Math.max(0,parseInt(draft.power)||0):parseInt(draft.power)||0,
    toughness:kind==="cpuCreatureMinusPT"?Math.max(0,parseInt(draft.toughness)||0):parseInt(draft.toughness)||0,
    remaining:kind==="preventCpuDamage"?Math.max(1,parseInt(draft.amount)||1):null,
    createdTurn:gameState.turn
  };
  gameState.battlefieldRules.push(rule);
  applyBattlefieldRuleModifiers();
  if(typeof renderBoardView==="function")renderBoardView(gameState);
  cmdLog(`Battlefield rule added: ${battlefieldRuleLabel(rule)}.`);
  return rule;
}
function removeBattlefieldRule(ruleId,reason="removed"){
  const rule=battlefieldRules().find(candidate=>candidate.id===ruleId);
  if(!rule)return;
  gameState.battlefieldRules=gameState.battlefieldRules.filter(candidate=>candidate.id!==ruleId);
  applyBattlefieldRuleModifiers();
  if(typeof renderBoardView==="function")renderBoardView(gameState);
  cmdLog(`${rule.sourceName||"Battlefield rule"} ${reason}.`);
}

function createPlayerEffect(draft){
  if(draft.action==="exileGraveyards")return {scope:"each",action:"exileGraveyards",count:0,all:true,cardType:null};
  return {
    scope:draft.scope,
    action:draft.action,
    count:Math.max(1,parseInt(draft.count)||1),
    all:!!draft.all,
    cardType:isPermanentPlayerAction(draft)?(draft.cardType||"creature"):draft.action==="reanimate"?"creature":null
  };
}
function playerActionAmount(effect,target){
  if(!effect.all)return effect.count;
  if(effect.action==="discard")return target.id==="player"?Math.max(0,target.handSize||0):opponentHandSize(target);
  if(effect.action==="mill"||effect.action==="draw")return target.id==="player"?Math.max(0,target.librarySize||0):opponentDeckSize(target);
  if(effect.action==="reanimate")return graveyardCreatureCards(target).length;
  if(isPermanentPlayerAction(effect)){
    return target.id==="player"
      ?["creature","permanent"].includes(effect.cardType)?Math.max(0,target.creatures||0):0
      :opponentPermanentOptions(target,effect.cardType).length;
  }
  if(effect.action==="loseLife"||effect.action==="gainLife")return Math.max(0,target.life||0);
  return effect.count;
}
function effectTargets(state,effect,targetId){
  if(effect.action==="tokens")return [state.player];
  const all=[state.player,...aliveOpponents(state)];
  if(effect.scope==="each")return all;
  if(effect.scope==="eachOpponent")return aliveOpponents(state);
  return all.filter(player=>player.id===targetId);
}
function effectTargetName(target){return target.id==="player"?"You":target.name.split(",")[0];}
/** Back-compat alias: CPU draws go through the canonical drawOpponentCard (deck-base.js). */
function drawForOpponent(opp){return drawOpponentCard(opp);}
function typedCardTypes(card){
  const category=card.ref?.category;
  if(category==="creatures"||card.isCreature||card.rampValue)return ["Creature"];
  if(category==="gear")return ["Artifact","Equipment"];
  if(category==="protection")return ["Instant"];
  if(category==="utility")return ["Enchantment"];
  return ["Sorcery"];
}
function virtualGraveyardCard(category){
  const cards={
    lands:{name:"Basic Land",ico:"🌲",types:["Land"]},
    ramp:{name:"Ramp spell",ico:"🌱",types:["Sorcery"]},
    explosive:{name:"Fast mana",ico:"⚙",types:["Artifact"]},
    other:{name:"Unknown spell",ico:"🃏",types:["Sorcery"]}
  };
  return {...(cards[category]||cards.other),virtual:true};
}
function typedGraveyardCard(card){
  return {name:card.name,ico:card.ico||"🃏",types:typedCardTypes(card),p:card.p,t:card.t,kws:card.kws?[...card.kws]:[],effect:card.effect||"",ref:card.ref||null,virtual:false};
}
function battlefieldGraveyardCard(token,opp){
  const ref=token.ref||(token.fromRampCard||token.isToken?null:findCardRefByName(token.name,opp));
  return {name:token.name,ico:token.ico||"🐾",types:(token.type||"Creature").includes("Creature")?["Creature"]:[token.type||"Permanent"],p:token.baseP!=null?token.baseP:token.p,t:token.baseT!=null?token.baseT:token.t,kws:token.baseKws?[...token.baseKws]:token.kws?[...token.kws]:[],effect:token.effect||"",ref:ref||null,virtual:!!token.fromRampCard,isToken:!!token.isToken};
}
function addOpponentExileCard(opp,card){
  if(card.isToken)return null;
  opp.exile=opp.exile||[];
  opp.nextExileCardId=(opp.nextExileCardId||0)+1;
  const {id:_id,ownerId:_ownerId,destination:_destination,...cardData}=card;
  const entry={...cardData,id:`${opp.id}:ex:${opp.nextExileCardId}`,ownerId:opp.id,destination:"exile"};
  opp.exile.push(entry);opp.exileCount=(opp.exileCount||0)+1;
  return entry;
}
function addOpponentGraveyardCard(opp,card){
  if(card.isToken)return null;
  if(cpuCardsGoToExileInstead())return addOpponentExileCard(opp,card);
  opp.graveyard=opp.graveyard||[];
  opp.nextGraveyardCardId=(opp.nextGraveyardCardId||0)+1;
  const entry={id:`${opp.id}:gy:${opp.nextGraveyardCardId}`,ownerId:opp.id,...card,destination:"graveyard"};
  opp.graveyard.push(entry);opp.graveyardCount++;
  return entry;
}
function addPlayerGraveyardCard(player,card){
  if(card.isToken)return null;
  player.graveyard=player.graveyard||[];
  player.nextGraveyardCardId=(player.nextGraveyardCardId||0)+1;
  const entry={id:`${player.id}:gy:${player.nextGraveyardCardId}`,ownerId:player.id,...card};
  player.graveyard.push(entry);player.graveyardCount++;
  return entry;
}
function cardTypeText(card){return card.types&&card.types.length?card.types.join(" · "):"Unknown";}
function discardedCardText(card){return `${card.ico||"🃏"} ${card.name} (${cardTypeText(card)})`;}
function discardedTypeSummary(cards){
  const counts={};
  cards.forEach(card=>(card.types||["Unknown"]).forEach(type=>{counts[type]=(counts[type]||0)+1;}));
  return Object.entries(counts).map(([type,count])=>`${type} ${count}`).join(" · ");
}
function movementCardText(card){return `${discardedCardText(card)} → ${card.destination||"graveyard"}`;}
function recordDiscardedCards(owner,cards){
  const entries=cards.filter(Boolean);
  if(entries.length===0)return entries;
  const turn=typeof gameState!=="undefined"&&gameState?gameState.turn:null;
  const records=entries.map(card=>({id:card.id,name:card.name,ico:card.ico||"🃏",types:[...(card.types||["Unknown"])],ownerId:owner.id,turn}));
  owner.discardHistory=(owner.discardHistory||[]).concat(records).slice(-100);
  if(typeof gameState!=="undefined"&&gameState)gameState.discardHistory=(gameState.discardHistory||[]).concat(records).slice(-250);
  return entries;
}
function unmaterializedGraveyardCount(owner){return Math.max(0,(owner.graveyardCount||0)-(owner.graveyard||[]).length);}
function graveyardCreatureCards(player){return (player.graveyard||[]).filter(card=>!card.isToken&&card.types?.includes("Creature"));}
function reanimateGraveyardCard(owner,cardId){
  const index=(owner.graveyard||[]).findIndex(card=>card.id===cardId&&card.types?.includes("Creature")&&!card.isToken);
  if(index<0)return null;
  const [card]=owner.graveyard.splice(index,1);
  owner.graveyardCount=Math.max(0,(owner.graveyardCount||0)-1);
  const player=gameState.player;
  player.tokens=player.tokens||[];
  const token={name:card.name,ico:card.ico||"🐾",kind:"reanimated-creature",type:"Creature",p:card.p||1,t:card.t||1,baseP:card.p||1,baseT:card.t||1,kws:card.kws?[...card.kws]:[],effect:card.effect||`Resurrected from ${effectTargetName(owner)}'s graveyard.`,summoningSick:true,owner:card.ownerId||owner.id,controller:"player",isToken:false};
  player.tokens.push(token);
  registerToken(player,token);
  player.creatures++;
  return card;
}
function exileOpponentGraveyardCreature(opp,cardId){
  const index=(opp.graveyard||[]).findIndex(card=>card.id===cardId&&card.types?.includes("Creature")&&!card.isToken);
  if(index<0)return null;
  const [card]=opp.graveyard.splice(index,1);
  opp.graveyardCount=Math.max(0,(opp.graveyardCount||0)-1);
  return addOpponentExileCard(opp,card);
}
function cpuDiscardPriority(opp,option){
  if(option.kind==="hand"){
    if(option.category==="lands")return opp.landsInPlay<3?80:10;
    if(option.category==="ramp")return commanderOnField(opp)?35:75;
    return 55; // Explosive mana stays useful but is less critical than development.
  }
  const card=option.card,category=card.ref?.category;
  if(card.makesTokens)return 50;
  if(category==="gear")return commanderOnField(opp)?85:15;
  if(category==="protection")return 80;
  if(category==="creatures")return (card.p||1)+(card.t||1)+(card.rampValue?30:0);
  if(category==="draw")return 45;
  if(category==="haymakers")return 60;
  return card.rampValue?70:30;
}
function discardFromOpponent(opp,count){
  const discarded=[];
  for(let i=0;i<count;i++){
    const options=[];
    ["lands","ramp","explosive"].forEach(category=>{for(let index=0;index<opp.hand[category];index++)options.push({kind:"hand",category});});
    const genericOtherCards=Math.max(0,opp.hand.other-opp.typedHand.length);
    for(let index=0;index<genericOtherCards;index++)options.push({kind:"hand",category:"other"});
    opp.typedHand.forEach((card,index)=>options.push({kind:"typed",index,card}));
    if(options.length===0)break;
    const choice=options.sort((left,right)=>cpuDiscardPriority(opp,left)-cpuDiscardPriority(opp,right))[0];
    if(choice.kind==="hand"){
      opp.hand[choice.category]--;
      const entry=addOpponentGraveyardCard(opp,virtualGraveyardCard(choice.category));if(entry)discarded.push(entry);
    }else{
      const [card]=opp.typedHand.splice(choice.index,1);opp.hand.other=Math.max(0,opp.hand.other-1);
      const entry=addOpponentGraveyardCard(opp,typedGraveyardCard(card));if(entry)discarded.push(entry);
    }
  }
  return recordDiscardedCards(opp,discarded);
}
function millOpponent(opp,count){
  const milled=[];
  for(let i=0;i<count;i++){
    const entries=Object.entries(opp.deck).filter(([,remaining])=>remaining>0);
    const total=entries.reduce((sum,[,remaining])=>sum+remaining,0);
    if(total===0)break;
    let roll=Math.floor(Math.random()*total),category=entries[0][0];
    for(const [name,remaining] of entries){roll-=remaining;if(roll<0){category=name;break;}}
    opp.deck[category]--;
    let card=virtualGraveyardCard(category);
    if(category==="other"&&opp.otherDeck.length>0){card=typedGraveyardCard(typedHandCard(opp.otherDeck.pop(),deckOf(opp)));}
    const entry=addOpponentGraveyardCard(opp,card);if(entry)milled.push(entry);
  }
  return milled;
}
function opponentPermanentOptions(opp,type){
  const options=[];
  const includes=kind=>type==="permanent"||type===kind;
  if(includes("creature"))opp.tokens.forEach((token,index)=>options.push({key:`token:${index}`,uid:token.uid,label:`${token.ico} ${token.name}`,type:"creature"}));
  if(includes("artifact")){
    (opp.attachedGear||[]).forEach((gear,index)=>options.push({key:`gear:${index}`,label:`⚙ ${gear.name}`,type:"artifact"}));
    (opp.looseGear||[]).forEach((gear,index)=>options.push({key:`loose:${index}`,label:`⚙ ${gear.name} (unattached)`,type:"artifact"}));
    for(let index=0;index<opp.explosiveInPlay;index++)options.push({key:`fastMana:${index}`,label:"⚙ Fast mana",type:"artifact"});
  }
  (opp.utilityPermanents||[]).forEach((entry,index)=>{
    const types=utilityPermanentTypes(entry);
    if(type==="permanent"||(type==="artifact"&&types.includes("Artifact")))options.push({key:`util:${index}`,label:`${entry.ico||"✦"} ${entry.name}`,type:types.includes("Artifact")?"artifact":"enchantment"});
  });
  if(includes("land"))for(let index=0;index<opp.landsInPlay;index++)options.push({key:`land:${index}`,label:"🌲 Land",type:"land"});
  return options;
}
function cpuPermanentPriority(opp,option){
  const [kind,indexText]=option.key.split(":"),index=parseInt(indexText);
  if(kind==="uid"||kind==="token"){
    const token=kind==="uid"?findTokenByUid(opp,option.key.slice(4)):opp.tokens[index];
    if(!token)return Infinity;
    if(token.kind==="commander")return 10000;
    return (token.p||0)+(token.t||0)+(isManaToken(token)?30:0);
  }
  if(kind==="gear"){
    const gear=opp.attachedGear[index];
    return (gear?.bonus||0)+(gear?.kw?8:0)+20;
  }
  if(kind==="loose"){
    const gear=(opp.looseGear||[])[index];
    return (gear?.bonus||0)+(gear?.kw?8:0)+10;
  }
  if(kind==="fastMana")return 40;
  if(kind==="util")return 25;
  if(kind==="land")return opp.landsInPlay<=3?70:5;
  return Infinity;
}
function chooseCpuPermanents(opp,type,count){
  return opponentPermanentOptions(opp,type)
    .sort((left,right)=>cpuPermanentPriority(opp,left)-cpuPermanentPriority(opp,right))
    .slice(0,count)
    .map(option=>option.key);
}
function moveGraveyardToExile(owner){
  const graveyard=owner.graveyard||[];
  const total=Math.max(owner.graveyardCount||0,graveyard.length);
  const unmaterialized=Math.max(0,total-graveyard.length);
  owner.exile=owner.exile||[];
  owner.nextExileCardId=owner.nextExileCardId||owner.exile.length;
  const moved=graveyard.map(card=>{
    owner.nextExileCardId++;
    const {destination,...cardData}=card;
    const entry={...cardData,id:`${owner.id}:ex:${owner.nextExileCardId}`,ownerId:owner.id,destination:"exile"};
    owner.exile.push(entry);
    return entry;
  });
  owner.exileCount=(owner.exileCount||0)+total;
  owner.graveyard=[];
  owner.graveyardCount=0;
  return {total,moved,unmaterialized};
}
function recordOpponentPermanentZone(opp,destination,card){
  if(destination==="exile")return card?addOpponentExileCard(opp,card):null;
  return card?addOpponentGraveyardCard(opp,card):null;
}
/** A gear entry as a graveyard/exile card (keeps its ref so it can be regrown). */
function gearZoneCard(gear,opp){
  return {name:gear.name,ico:"⚙",types:["Artifact","Equipment"],effect:gear.kw||"",bonus:gear.bonus||0,ref:gear.ref||findCardRefByName(gear.name,opp)};
}
/** Bounce: a card goes back to its owner's hand (typed when its definition is known). */
function returnPermanentCardToHand(opp,name,fallbackCategory){
  const ref=name?findCardRefByName(name,opp):null;
  if(ref){addTypedRefToHand(opp,ref);return true;}
  if(fallbackCategory){opp.hand[fallbackCategory]=(opp.hand[fallbackCategory]||0)+1;return true;}
  return false;
}
/**
 * Removes a CPU permanent by key: "uid:<tokenUid>", "token:<index>",
 * "gear:<index>", "loose:<index>", "fastMana:<index>", "land:<index>".
 * destination: "graveyard" | "exile" | "hand" (bounce).
 * Commanders always go to the command zone; a bounced commander does NOT
 * increase commander tax. Returns the moved card record or null.
 */
function removeOpponentPermanent(opp,key,destination="graveyard"){
  let [kind,indexText]=String(key).split(":");
  let index=parseInt(indexText);
  if(kind==="uid"){
    const uid=String(key).slice(4);
    index=opp.tokens.findIndex(token=>token.uid===uid);
    kind="token";
  }
  if(kind==="token"&&opp.tokens[index]){
    const [token]=opp.tokens.splice(index,1);
    if(token.kind==="commander"){
      if(destination==="hand")returnCommanderToHand(opp);
      else returnCommanderToZone(opp);
      noteCommanderRemoved(opp);
      return {name:token.name,ico:token.ico||opp.ico,types:["Legendary","Creature"],destination:destination==="hand"?"hand":"command zone",uid:token.uid};
    }
    if(isManaToken(token))opp.rampInPlay=Math.max(0,opp.rampInPlay-(token.rampValue||1));
    if(destination==="hand"){
      let returned=false;
      if(!token.isToken)returned=token.fromRampCard?returnPermanentCardToHand(opp,null,"ramp"):returnPermanentCardToHand(opp,token.name,null);
      return {name:token.name,ico:token.ico||"🐾",types:["Creature"],destination:returned?"hand":"ceases to exist",uid:token.uid};
    }
    const moved=recordOpponentPermanentZone(opp,destination,battlefieldGraveyardCard(token,opp));
    return moved?{...moved,uid:token.uid}:{name:token.name,ico:token.ico||"🐾",types:["Creature"],destination,uid:token.uid};
  }
  if((kind==="gear"&&opp.attachedGear[index])||(kind==="loose"&&(opp.looseGear||[])[index])){
    const [gear]=kind==="gear"?opp.attachedGear.splice(index,1):opp.looseGear.splice(index,1);
    if(kind==="gear")refreshCommanderGear(opp);
    if(destination==="hand"){returnPermanentCardToHand(opp,gear.name,null);return {name:gear.name,ico:"⚙",types:["Artifact","Equipment"],destination:"hand"};}
    return recordOpponentPermanentZone(opp,destination,gearZoneCard(gear,opp));
  }
  if(kind==="util"&&(opp.utilityPermanents||[])[index]){
    const [entry]=opp.utilityPermanents.splice(index,1);
    if((utilityPermanentDef(entry)||{}).effect==="anthem")applyBattlefieldRuleModifiers();
    if(destination==="hand"){returnPermanentCardToHand(opp,entry.name,null);return {name:entry.name,ico:entry.ico||"✦",types:utilityPermanentTypes(entry),destination:"hand"};}
    const ref=entry.ref||findCardRefByName(entry.name,opp);
    return recordOpponentPermanentZone(opp,destination,ref?typedGraveyardCard(typedHandCard(ref,deckOf(opp))):{name:entry.name,ico:entry.ico||"✦",types:["Permanent"],virtual:false});
  }
  if(kind==="fastMana"&&opp.explosiveInPlay>0){
    opp.explosiveInPlay--;
    if(destination==="hand"){opp.hand.explosive++;return {...virtualGraveyardCard("explosive"),destination:"hand"};}
    return recordOpponentPermanentZone(opp,destination,virtualGraveyardCard("explosive"));
  }
  if(kind==="land"&&opp.landsInPlay>0){
    opp.landsInPlay--;
    if(destination==="hand"){opp.hand.lands++;return {...virtualGraveyardCard("lands"),destination:"hand"};}
    return recordOpponentPermanentZone(opp,destination,virtualGraveyardCard("lands"));
  }
  return null;
}
function canResolvePlayerEffect(effect,draft){
  if(effect.scope==="target"&&!draft.targetId)return false;
  if(effect.action!=="reanimate")return true;
  return effectTargets(gameState,effect,draft.targetId).every(owner=>{
    const cards=graveyardCreatureCards(owner);
    const selected=draft.choices[owner.id]||[];
    return cards.length===0||selected.length>=playerActionAmount(effect,owner);
  });
}
function isPermanentPlayerAction(effect){return ["destroy","sacrifice","exile","bounce"].includes(effect&&effect.action);}
/**
 * Keys of the permanents to affect on a CPU target. The player may pick
 * explicitly via draft.selections[oppId] (array of "uid:<uid>" / "token:<i>"
 * / "gear:<i>" / ... keys); otherwise (and always for sacrifice) the CPU
 * chooses its least valuable eligible permanents. Token keys are converted
 * to uid keys so removing several never shifts indices.
 */
function playerEffectPermanentKeys(target,effect,draft,amount){
  const explicit=effect.action!=="sacrifice"&&draft&&draft.selections&&draft.selections[target.id];
  const keys=(explicit&&explicit.length?explicit.slice(0,amount):chooseCpuPermanents(target,effect.cardType,amount));
  const normalized=keys.map(key=>{
    const [kind,index]=String(key).split(":");
    if(kind==="token"&&target.tokens[parseInt(index)])return `uid:${target.tokens[parseInt(index)].uid}`;
    return key;
  });
  // Index-based keys of the same kind are removed from the highest index down.
  return normalized.sort((left,right)=>{
    const [leftKind,leftIndex]=left.split(":"),[rightKind,rightIndex]=right.split(":");
    if(leftKind==="uid"||rightKind==="uid")return leftKind===rightKind?0:leftKind==="uid"?-1:1;
    return leftKind===rightKind?parseInt(rightIndex)-parseInt(leftIndex):leftKind.localeCompare(rightKind);
  });
}
/**
 * Canonical resolution of a player action (PLAYER_ACTIONS) against the
 * Commander battle state. Updates CPU state and the player's tracked
 * counts (handSize, librarySize, poison, creatures for tokens), logs each
 * result and returns the log lines.
 * options.quiet: skip the UI hooks (snapshot / save / re-render).
 */
function resolvePlayerEffect(effect,draft,options){
  const opts=options||{};
  const state=liveGameState();
  draft=draft||{};
  const targets=effectTargets(state,effect,draft.targetId);
  const lines=[];
  const log=message=>{lines.push(message);cmdLog(message);};
  if(targets.length===0)return lines;
  if(!opts.quiet&&typeof cmdSnapshot==="function")cmdSnapshot();
  withRemovalSource("player",()=>targets.forEach(target=>{
    const name=effectTargetName(target);
    const amount=playerActionAmount(effect,target);
    if(effect.action==="exileGraveyards"){
      const result=moveGraveyardToExile(target);
      if(result.total===0){
        log(`${name}'s graveyard is already empty.`);
      }else{
        const typeSummary=result.moved.length?discardedTypeSummary(result.moved):"Unknown";
        const detail=result.unmaterialized?` Includes ${result.unmaterialized} previously unmaterialized card${result.unmaterialized===1?"":"s"}.`:"";
        log(`${name} exiles ${result.total} graveyard card${result.total===1?"":"s"}. Types: ${typeSummary}.${detail}`);
      }
    }else if(effect.action==="reanimate"){
      const cardIds=((draft.choices||{})[target.id]||[]).slice(0,amount);
      const reanimated=cardIds.map(cardId=>reanimateGraveyardCard(target,cardId)).filter(Boolean);
      if(reanimated.length)log(`You resurrect ${reanimated.map(discardedCardText).join(", ")} from ${name}'s graveyard onto your battlefield.`);
      else log(`${name}'s graveyard has no selected creature cards to resurrect.`);
    }else if(effect.action==="discard"){
      if(target.id==="player"){
        const discardedAmount=Math.min(amount,target.handSize);target.handSize-=discardedAmount;
        const discarded=Array.from({length:discardedAmount},()=>addPlayerGraveyardCard(target,{name:"Unrevealed discarded card",ico:"🃏",types:["Unknown"],virtual:true})).filter(Boolean);
        recordDiscardedCards(target,discarded);
        log(`${name} discards ${discarded.length?discarded.map(discardedCardText).join(", "):"no cards"}. Types: ${discardedTypeSummary(discarded)}. Card names are not tracked for this hand.`);
      }else{
        const discarded=discardFromOpponent(target,amount);
        log(`${name} chooses to discard ${discarded.length?discarded.map(discardedCardText).join(", "):"no cards"}.${discarded.length?` Types: ${discardedTypeSummary(discarded)}.`:""}`);
      }
    }else if(effect.action==="mill"){
      if(target.id==="player"){
        const milledAmount=Math.min(amount,target.librarySize);target.librarySize-=milledAmount;
        const milled=Array.from({length:milledAmount},()=>addPlayerGraveyardCard(target,{name:"Unrevealed milled card",ico:"📚",types:["Unknown"],virtual:true})).filter(Boolean);
        log(`${name} mills ${milled.length?milled.map(discardedCardText).join(", "):"no cards"}. Types: ${discardedTypeSummary(milled)}. Card names are not tracked for this library.`);
      }else{
        const milled=millOpponent(target,amount);
        log(`${name} mills ${milled.length?milled.map(discardedCardText).join(", "):"no cards"}.${milled.length?` Types: ${discardedTypeSummary(milled)}.`:""}`);
      }
    }else if(effect.action==="draw"){
      if(target.id==="player"){
        const drawnAmount=Math.min(amount,target.librarySize);target.librarySize-=drawnAmount;target.handSize+=drawnAmount;
        log(`${name} draws ${drawnAmount} card${drawnAmount===1?"":"s"}.`);
      }else{
        let drawn=0;for(let i=0;i<amount;i++)if(drawOpponentCard(target)!=="none")drawn++;
        log(`${name} draws ${drawn} card${drawn===1?"":"s"}.`);
      }
    }else if(effect.action==="loseLife"||effect.action==="gainLife"){
      const direction=effect.action==="loseLife"?-1:1;target.life=Math.max(0,target.life+(direction*amount));
      log(`${name} ${effect.action==="loseLife"?"loses":"gains"} ${amount} life. (Life → ${target.life})`);
    }else if(effect.action==="poison"){
      target.poison=(target.poison||0)+amount;
      log(`${name} get${target.id==="player"?"":"s"} ${amount} poison counter${amount===1?"":"s"} (${target.poison}/10).`);
    }else if(effect.action==="tokens"){
      target.creatures=(target.creatures||0)+amount;
      log(`You create ${amount} creature token${amount===1?"":"s"}. (${target.creatures} creature${target.creatures===1?"":"s"} on your battlefield)`);
    }else if(target.id==="player"){
      if(effect.action==="exile")target.exileCount+=amount;
      if(effect.action==="bounce")target.handSize=(target.handSize||0)+amount;
      const subject=effect.all?`all ${effect.cardType}s you control`:`${amount} ${effect.cardType} card${amount===1?"":"s"} you control`;
      log(`${effect.action==="exile"?"Exile":effect.action==="bounce"?"Return to your hand":"Resolve"} ${subject}.`);
    }else{
      const destination=effect.action==="exile"?"exile":effect.action==="bounce"?"hand":"graveyard";
      const moved=playerEffectPermanentKeys(target,effect,draft,amount).map(key=>removeOpponentPermanent(target,key,destination)).filter(Boolean);
      const verb={destroy:"destroys",sacrifice:"sacrifices",exile:"exiles",bounce:"returns"}[effect.action];
      if(moved.length)log(`${name} ${verb} ${moved.map(movementCardText).join(", ")}. Types: ${discardedTypeSummary(moved)}.`);
      else log(`${name} has no ${effect.cardType} to ${effect.action==="bounce"?"return":effect.action}.`);
    }
  }));
  commanderEffectDraft={scope:draft.scope,action:draft.action,count:1,all:false,cardType:draft.cardType,targetId:null,choices:{},creaturesPlayed:draft.creaturesPlayed||0,actionOpen:draft.actionOpen};
  ensureCommanderEffectState(state);
  if(!opts.quiet){
    if(typeof saveState==="function")saveState();
    if(typeof showCommanderGame==="function")showCommanderGame();
  }
  return lines;
}
/** Human-readable one-line summary of a player action. */
function describePlayerEffect(effect){
  if(effect.action==="exileGraveyards")return "Exile every card from every graveyard.";
  const scope={each:"Each player",eachOpponent:"Each opponent",target:"Target player"}[effect.scope]||"Target player";
  if(effect.action==="tokens")return `You create ${effect.count} creature token${effect.count===1?"":"s"}.`;
  if(effect.action==="poison")return `${scope} gets ${effect.count} poison counter${effect.count===1?"":"s"}.`;
  if(effect.action==="reanimate")return effect.all
    ?`Resurrect every eligible creature card from ${scope.toLowerCase()}'s graveyard onto your battlefield.`
    :`Resurrect up to ${effect.count} selected creature${effect.count===1?"":"s"} from ${scope.toLowerCase()}'s graveyard onto your battlefield.`;
  const action={discard:"discards",mill:"mills",draw:"draws",loseLife:"loses",gainLife:"gains",destroy:"destroys",sacrifice:"sacrifices",exile:"exiles",bounce:"returns to hand"}[effect.action];
  if(effect.all){
    if(effect.action==="gainLife")return `${scope} gains life equal to its current life total.`;
    if(effect.action==="loseLife")return `${scope} loses all life.`;
    const subject=isPermanentPlayerAction(effect)?`all ${effect.cardType}s`:"all cards";
    return `${scope} ${action} ${subject}.`;
  }
  const subject=isPermanentPlayerAction(effect)?`${effect.count} ${effect.cardType}${effect.count===1?"":"s"}`:effect.action.includes("Life")?`${effect.count} life`:`${effect.count} card${effect.count===1?"":"s"}`;
  return `${scope} ${action} ${subject}.`;
}
/**
 * Data for a confirmation dialog (the engine never opens dialogs itself).
 * Returns {title, summary, playerInstruction, cpuInstruction, html, text, confirmLabel, affectsPlayer}.
 */
function playerEffectConfirmation(effect,draft){
  const state=liveGameState();
  const targets=effectTargets(state,effect,(draft||{}).targetId);
  const summary=describePlayerEffect(effect);
  const affectsPlayer=!["reanimate","exileGraveyards","tokens"].includes(effect.action)&&targets.some(target=>target.id==="player");
  const cpuTargets=targets.filter(target=>target.id!=="player");
  const playerInstruction=affectsPlayer
    ?`Complete your part at the table, then confirm: ${summary}`
    :`No action is required from you at the table.`;
  const cpuInstruction=effect.action==="reanimate"
    ?"The selected creature cards return to the battlefield under your control."
    :cpuTargets.length
    ?isPermanentPlayerAction(effect)
      ?effect.action==="sacrifice"||!((draft||{}).selections)
        ?"Each affected CPU chooses its least valuable eligible permanent."
        :"Your selected CPU permanents are affected."
      :effect.action==="discard"
        ?"Each affected CPU discards its least valuable card."
        :"CPU totals update automatically."
    :"";
  return {
    title:"Confirm action",summary,playerInstruction,cpuInstruction,affectsPlayer,
    confirmLabel:affectsPlayer?"Confirm":"Resolve",
    html:`<strong>${summary}</strong><br><br>${playerInstruction}${cpuInstruction?`<br><br>${cpuInstruction}`:""}`,
    text:`${summary}\n\n${playerInstruction}${cpuInstruction?`\n${cpuInstruction}`:""}`
  };
}
/**
 * Confirms (via the supplied confirmFn(title, html, confirmLabel) → Promise<bool>,
 * defaulting to the UI's askConfirm when present) and resolves a player
 * action. With no confirm function available it resolves directly — the
 * engine never falls back to window.confirm.
 */
async function confirmAndResolvePlayerEffect(effect,draft,confirmFn){
  const dialog=playerEffectConfirmation(effect,draft);
  const ask=confirmFn||(typeof askConfirm==="function"?askConfirm:null);
  const confirmed=ask?await ask(dialog.title,dialog.html,dialog.confirmLabel):true;
  if(!confirmed)return false;
  resolvePlayerEffect(effect,draft);
  cmdLog("Player action resolved.");
  if(typeof saveState==="function")saveState();
  return true;
}
