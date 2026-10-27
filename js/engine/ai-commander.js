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
/** Finds the typed ref for a card name in the active deck (for bounce/regrowth). */
function findCardRefByName(name){
  const deck=defaultCommanderDeck();
  if(!deck||!name)return null;
  for(const [category,pool] of Object.entries(deck.cards)){
    const index=(pool||[]).findIndex(card=>card.name===name);
    if(index>=0)return {category,index};
  }
  return null;
}
function isManaToken(token){return token.kind==="voltron-support"&&!!token.effect&&token.effect.includes("mana");}

/* ---------- opponent creation ---------- */
function createOpponent(index) {
  const id=CPU_NAMES[index]||CPU_NAMES[0];
  const deckDef=defaultCommanderDeck();
  const opp={
    id:`cpu_${index}`, index, name:id.name, ico:id.ico, color:id.color, archetype:"voltron",
    life:40, poison:0, commanderDamageReceived:{}, commanderDamageDealt:{},
    commanderZone:true, commanderTax:0,
    deck:newDeck(deckDef), otherDeck:generateOtherDeck(deckDef), hand:{lands:0,ramp:0,explosive:0,other:0}, typedHand:[],
    landsInPlay:0, rampInPlay:0, explosiveInPlay:0, gear:0, attachedGear:[], looseGear:[],
    graveyardCount:0, graveyard:[], nextGraveyardCardId:0, discardHistory:[], exileCount:0, exile:[], nextExileCardId:0,
    tokens:[], nextTokenUid:0, damageLog:{}, lastAttacker:null, grudge:null, heldMana:0, turnsTaken:0, mulligans:0,
    currentStrategy:STRATEGIES.THREAT, actionSteps:[], attackTarget:null, attackPower:0,
  };
  // Opening hand: 7 typed cards, London mulligan (first one free, max 2).
  londonMulligan(opp,2);
  return opp;
}

function commanderOnField(opp) { return opp.tokens.find(t=>t.kind==="commander")||null; }

/** Casts the commander from the command zone. Returns the token or false. */
function deployCommander(opp) {
  const token=deployCommanderGeneric(opp,deckCommanderBase(opp));
  if(!token)return false;
  registerToken(opp,token);
  return token;
}

/* ---------- targeting ---------- */
function threatScore(p){
  const c=p.creatures!=null?p.creatures:(p.tokens?p.tokens.length:0);
  const cmd=p.tokens?p.tokens.some(t=>t.kind==="commander"):false;
  const pwCount=(p.planeswalkers||[]).length;
  // Player always has high baseline threat — in real Commander, the human is
  // the most dangerous because they're unpredictable and may be sandbagging.
  // This ensures CPUs attack the player regularly, not just each other.
  // Planeswalkers significantly increase threat since they generate value every turn.
  const humanBonus=p.id==="player"?20:0;
  return c*3+(cmd?15:0)+(40-p.life)+humanBonus+(pwCount*12);
}

/** True when a player/opponent (or a targeting projection) is out of the game. */
function isEliminatedTarget(p){
  if(!p||p.life<=0)return true;
  if((p.poison||0)>=10)return true;
  return !!(p.commanderDamageReceived&&Object.values(p.commanderDamageReceived).some(d=>d>=21));
}

/**
 * Decides whether a CPU should redirect its attack to one of the player's
 * planeswalkers instead of the player's life total. In real MTG, attackers
 * can target planeswalkers. CPUs do this when:
 * - The player has a planeswalker with meaningful loyalty
 * - The planeswalker hasn't already been reduced to low loyalty
 * - Random chance (not every turn — sometimes face is still better)
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

function evaluateStrategy(opp, alive) {
  const nearDeath=alive.find(p=>p.life<=10);
  if(nearDeath)return STRATEGIES.GANG_UP;
  if(opp.lastAttacker&&(opp.damageLog[opp.lastAttacker]||0)>=10)return STRATEGIES.LAST_HITTER;
  if(opp.grudge&&alive.find(p=>p.id===opp.grudge))return Math.random()<0.3?STRATEGIES.GRUDGE:STRATEGIES.THREAT;
  if(opp.life<=20)return STRATEGIES.VULNERABLE;
  return STRATEGIES.THREAT;
}

function chooseTarget(opp, allPlayers) {
  const alive=allPlayers.filter(p=>p.id!==opp.id&&!isEliminatedTarget(p));
  if(alive.length===0)return null;
  if(alive.length===1)return alive[0].id;
  const strategy=evaluateStrategy(opp,alive);
  opp.currentStrategy=strategy;

  let chosen=null;
  switch(strategy){
    case STRATEGIES.LAST_HITTER:if(opp.lastAttacker&&alive.find(p=>p.id===opp.lastAttacker))chosen=opp.lastAttacker;break;
    case STRATEGIES.MOST_DAMAGE:{const s=[...alive].sort((a,b)=>(opp.damageLog[b.id]||0)-(opp.damageLog[a.id]||0));if((opp.damageLog[s[0].id]||0)>0)chosen=s[0].id;break;}
    case STRATEGIES.GRUDGE:if(opp.grudge&&alive.find(p=>p.id===opp.grudge))chosen=opp.grudge;break;
    case STRATEGIES.VULNERABLE:{chosen=[...alive].sort((a,b)=>a.life-b.life)[0].id;break;}
    case STRATEGIES.GANG_UP:{const bl=[...alive].sort((a,b)=>a.life-b.life);if(bl[0].life<=15)chosen=bl[0].id;break;}
  }
  if(chosen)return chosen;

  // Default: threat-weighted random — higher threat = more likely to be targeted,
  // but not guaranteed. This spreads damage naturally across the table.
  const scored=[...alive].map(p=>({id:p.id,score:threatScore(p)}));
  const totalScore=scored.reduce((s,p)=>s+p.score,0);
  if(totalScore<=0)return alive[Math.floor(Math.random()*alive.length)].id;
  let roll=Math.random()*totalScore;
  for(const p of scored){roll-=p.score;if(roll<=0)return p.id;}
  return scored[scored.length-1].id;
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
function undoRecord(undo){
  if(!undo)return [];
  const notes=[];
  (undo.removed||[]).slice().reverse().forEach(snapshot=>{if(restoreRemovedToken(snapshot))notes.push(`${snapshot.token.name} returns to the battlefield`);});
  (undo.life||[]).forEach(entry=>{
    const owner=findOwnerById(entry.id);
    if(owner){owner.life+=entry.amount;notes.push(`${shortName(owner)} regains ${entry.amount} life`);}
  });
  (undo.pumps||[]).forEach(entry=>{
    const owner=findOwnerById(entry.ownerId);
    const token=owner&&findTokenByUid(owner,entry.uid);
    if(token){token.pumpP=(token.pumpP||0)-entry.p;token.pumpT=(token.pumpT||0)-entry.t;if(entry.kw&&token.pumpKws)token.pumpKws=token.pumpKws.filter(kw=>kw!==entry.kw);}
  });
  if(undo.rule){
    const state=liveGameState();
    if(state&&!state.battlefieldRules.some(rule=>rule.id===undo.rule.id)){state.battlefieldRules.push(undo.rule);notes.push(`${undo.rule.sourceName||"The battlefield rule"} stays in play`);}
  }
  applyBattlefieldRuleModifiers();
  return notes;
}

/* ---------- board wipe strategy ---------- */
/**
 * Evaluates whether the CPU should cast a board wipe this turn.
 * Strategy:
 * - Symmetric (Wrath of the Wilds): Cast when opponents collectively have 4+ more
 *   creatures than you, OR you're about to die and they have a wide board.
 *   Commanders are spared by this model.
 * - Targeted (Savage Decree): Cast when a single opponent has 3+ creatures and is
 *   the biggest threat. Prefer targeting whoever has the most board presence.
 *
 * Returns { cast: boolean, manaRemaining: number }
 */
function evaluateAndCastBoardWipe(opp, mana, allPlayers, actions, turnSpellState){
  const wipesInHand=opp.typedHand.filter(c=>c.ref?.category==="boardwipes");
  if(wipesInHand.length===0)return {cast:false,manaRemaining:mana};

  const myCreatureCount=opp.tokens.length;
  const opponents=allPlayers.filter(p=>p.id!==opp.id&&p.life>0);
  const totalEnemyCreatures=opponents.reduce((sum,p)=>sum+(p.creatures!=null?p.creatures:(p.tokens?p.tokens.length:0)),0);

  let biggestThreat=null, biggestThreatCount=0;
  opponents.forEach(p=>{
    const count=p.creatures!=null?p.creatures:(p.tokens?p.tokens.length:0);
    if(count>biggestThreatCount){biggestThreatCount=count;biggestThreat=p;}
  });

  const symmetricWipe=wipesInHand.find(c=>c.wipeType==="symmetric");
  if(symmetricWipe){
    const casting=cpuCanCast(symmetricWipe,symmetricWipe.cost,mana,"boardwipes",turnSpellState);
    if(casting.canCast){
      const boardDeficit=totalEnemyCreatures-myCreatureCount;
      const desperate=opp.life<=15&&totalEnemyCreatures>=3;
      if(boardDeficit>=4||desperate){
        mana-=casting.cost;
        removeTypedCardFromHand(opp,symmetricWipe);
        addOpponentGraveyardCard(opp,typedGraveyardCard(symmetricWipe));
        recordCpuSpellCast(turnSpellState);
        const undo=newUndoRecord();
        cpuOpponentsFrom(allPlayers).forEach(cpu=>{
          if(cpu!==opp&&isOpponentDead(cpu))return;
          cpu.tokens.filter(token=>token.kind!=="commander").forEach(token=>removeTokenWithUndo(cpu,token,"graveyard",undo));
        });
        actions.push({
          label:`⚡ Cast ${symmetricWipe.name}`,
          detail:`${symmetricWipe.effect} All non-commander creatures on every battlefield are destroyed.`,
          boardWipe:"symmetric",wipeName:symmetricWipe.name,cardName:symmetricWipe.name,
          type:"wipe",counterable:true,undo,
          playerRemoval:{cardName:symmetricWipe.name,instruction:"Destroy all non-commander creatures you control."}
        });
        return {cast:true,manaRemaining:mana};
      }
    }
  }

  const targetedWipe=wipesInHand.find(c=>c.wipeType==="targeted");
  if(targetedWipe&&biggestThreat&&biggestThreatCount>=3){
    const casting=cpuCanCast(targetedWipe,targetedWipe.cost,mana,"boardwipes",turnSpellState);
    if(casting.canCast&&(biggestThreatCount>myCreatureCount||(biggestThreatCount>=3&&opp.life<=25))){
      mana-=casting.cost;
      removeTypedCardFromHand(opp,targetedWipe);
      addOpponentGraveyardCard(opp,typedGraveyardCard(targetedWipe));
      recordCpuSpellCast(turnSpellState);
      const undo=newUndoRecord();
      // Another CPU's creatures are destroyed immediately. For the player the
      // UI gives a response window before the player clears their board.
      if(biggestThreat.id!=="player"){
        const cpuOpp=cpuOpponentsFrom(allPlayers).find(o=>o.id===biggestThreat.id);
        if(cpuOpp)cpuOpp.tokens.filter(token=>token.kind!=="commander").forEach(token=>removeTokenWithUndo(cpuOpp,token,"graveyard",undo));
      }
      const targetName=biggestThreat.id==="player"?"You":biggestThreat.name.split(',')[0];
      const action={
        label:`⚡ Cast ${targetedWipe.name} targeting ${targetName}`,
        detail:`${targetedWipe.effect} ${targetName}'s creatures are destroyed.`,
        boardWipe:"targeted",wipeTarget:biggestThreat.id,wipeTargetName:targetName,wipeName:targetedWipe.name,cardName:targetedWipe.name,
        type:"wipe",counterable:true,undo
      };
      if(biggestThreat.id==="player")action.playerRemoval={cardName:targetedWipe.name,instruction:"Destroy all non-commander creatures you control."};
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
/** Resolves a haymaker that scoreHaymaker approved. Returns the action. */
function castHaymaker(opp,card,evaluation,allPlayers){
  const undo=newUndoRecord();
  const others=cpuOpponentsFrom(allPlayers).filter(cpu=>cpu!==opp&&!isOpponentDead(cpu));
  const action={label:`Cast ${card.name}`,detail:card.effect,cardName:card.name,type:"haymaker",counterable:true,undo};
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
  [opp,...others].forEach(cpu=>{
    cpu.tokens.filter(token=>token!==source&&damageWouldDestroy(token,damage)).forEach(token=>{
      if(removeTokenWithUndo(cpu,token,"graveyard",undo))killed.push(`${token.name}${cpu===opp?"":` (${shortName(cpu)})`}`);
    });
  });
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
  opp.typedHand.push(typedHandCard(ref));
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
  return action;
}
function castFallbackRampCreature(opp,casting){
  const def=(typeof FALLBACK_RAMP_CREATURE!=="undefined"&&FALLBACK_RAMP_CREATURE)||{name:"Wilds Guide",ico:"🌿",type:"Creature — Shaman",p:2,t:2,effect:"Taps for mana.",rampValue:1};
  opp.hand.ramp--;opp.rampInPlay+=def.rampValue||1;
  const token=addOpponentToken(opp,{name:def.name,ico:def.ico,kind:"voltron-support",type:def.type,p:def.p,t:def.t,baseP:def.p,baseT:def.t,
    kws:[],baseKws:[],effect:def.effect,summoningSick:true,owner:opp.id,rampValue:def.rampValue||1,fromRampCard:true});
  return {label:`Cast ${def.name}`,detail:`${def.p}/${def.t} ramp creature enters.`+(casting.additional?" Creature tax paid: "+casting.additional+".":""),
    tokenUid:token.uid,cardName:def.name,type:"creature",counterable:true};
}
function drawSpellCount(opp,card){
  const spec=card.draw||{mode:"fixed",count:3};
  if(spec.mode==="fixed")return spec.count||1;
  if(spec.mode==="power")return Math.max(1,Math.min(spec.max||5,greatestPower(opp.tokens)));
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
  addOpponentGraveyardCard(opp,typedGraveyardCard(card));
  const tax=casting.additional?` Noncreature tax paid: ${casting.additional}.`:"";
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
var CPU_PLAYER_REMOVAL_SPELLS=["Beast Within","Chaos Warp"];
var CPU_PROTECTION_SPELLS=["Blossoming Defense","Vines of Vastwood","Heroic Intervention","Tamiyo's Safekeeping"];
var CPU_WIPE_PROTECTION_SPELLS=["Heroic Intervention"];
/** Removal at the player's board — only when the CPU still keeps protection back. */
function tryCpuPlayerRemoval(opp,mana,allPlayers,turnSpellState){
  const player=(allPlayers||[]).find(p=>p.id==="player");
  if(!player||isEliminatedTarget(player))return null;
  const hasTargets=(player.creatures||0)>=2||(player.planeswalkers||[]).length>0;
  if(!hasTargets)return null;
  const protectionHeld=opp.typedHand.filter(card=>CPU_PROTECTION_SPELLS.includes(card.name)).length;
  if(protectionHeld<1)return null;
  const card=opp.typedHand.find(candidate=>CPU_PLAYER_REMOVAL_SPELLS.includes(candidate.name));
  if(!card)return null;
  const casting=cpuCanCast(card,card.cost,mana,"protection",turnSpellState);
  if(!casting.canCast)return null;
  removeTypedCardFromHand(opp,card);
  addOpponentGraveyardCard(opp,typedGraveyardCard(card));
  const what=(player.planeswalkers||[]).length?"your highest-loyalty planeswalker":"your most threatening creature";
  const instruction=card.name==="Beast Within"
    ?`Destroy ${what}. You create a 3/3 green Beast creature token.`
    :`Shuffle ${what} into your library, then reveal the top card; if it's a permanent card, put it onto the battlefield.`;
  return {action:{label:`Cast ${card.name} targeting you`,detail:card.effect,cardName:card.name,type:"removal",counterable:true,
    playerRemoval:{cardName:card.name,instruction}},cost:casting.cost};
}

/** Re-equips loose equipment (activated ability: not a spell, not counterable). */
function equipLooseGear(opp,mana,actions){
  const commander=commanderOnField(opp);
  if(!commander)return mana;
  opp.looseGear=opp.looseGear||[];
  const ordered=opp.looseGear.map(gear=>({gear,equip:gear.equip!=null?gear.equip:2})).sort((a,b)=>(b.gear.bonus||0)/(b.equip||1)-(a.gear.bonus||0)/(a.equip||1));
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

/**
 * CPU main phase: untap, draw, land, rule removal, ONE primary action
 * (commander / fast mana / ramp, or gear when the commander is out), loose
 * equipment re-equips, then AT MOST ONE secondary cast (board wipe,
 * haymaker, creature, draw/utility spell, or removal at the player).
 * Returns {actions}. Sets opp.heldMana to the mana left open.
 */
function executeOpponentMainPhase(opp, allPlayers){
  const actions=[];
  const turnSpellState={spellsCast:0};
  opp.actionSteps=actions;
  opp.attackTarget=null;opp.attackPower=0;opp._planeswalkerTarget=null;
  untapOpponent(opp);
  let commander=commanderOnField(opp);

  // Draw. A CPU that cannot complete its required draw loses the game.
  if(skipsFirstDraw(opp)){
    actions.push({label:"No draw",detail:"First player in a two-player game skips the first draw.",type:"drawStep"});
  }else if(opponentDeckSize(opp)===0){
    opp.life=0;
    actions.push({label:"Decked out",detail:"Cannot draw from an empty deck. Life → 0.",deckOut:true,type:"deckOut"});
    opp.turnsTaken=(opp.turnsTaken||0)+1;
    return {actions};
  }else{
    const drawn=drawOpponentCard(opp);
    if(drawn!=="none")actions.push({label:"Draw",detail:"Draws a card.",type:"drawStep"});
  }
  opp.turnsTaken=(opp.turnsTaken||0)+1;

  // Land drop
  if(opp.hand.lands>0){opp.hand.lands--;opp.landsInPlay++;actions.push({label:"Land drop",detail:`${opp.landsInPlay} lands in play.`,type:"land"});}

  let mana=manaAvailable(opp);
  applyBattlefieldRuleModifiers();
  mana=tryCpuRemoveBattlefieldRule(opp,mana,actions,turnSpellState);

  // Primary action
  if(!commander){
    const cost=commanderCost(opp);
    const commanderCasting=cpuCanCast(null,cost,mana,"commander",turnSpellState);
    const explosiveCasting=cpuCanCast(null,1,mana,"explosive",turnSpellState);
    const rampCasting=cpuCanCast(null,2,mana,"ramp",turnSpellState);
    if(commanderCasting.canCast&&deployCommander(opp)){
      mana-=commanderCasting.cost;
      recordCpuSpellCast(turnSpellState);
      commander=commanderOnField(opp);
      actions.push({label:`Cast ${opp.name}`,detail:"Commander enters."+(commanderCasting.additional?" Creature tax paid: "+commanderCasting.additional+".":""),
        tokenUid:commander.uid,cardName:opp.name,type:"commander",counterable:true});
    }else if(opp.hand.explosive>0&&explosiveCasting.canCast){
      opp.hand.explosive--;opp.explosiveInPlay++;mana-=explosiveCasting.cost;
      recordCpuSpellCast(turnSpellState);
      actions.push({label:"Fast mana",detail:"+2 mana next turn."+(explosiveCasting.additional?" Noncreature tax paid: "+explosiveCasting.additional+".":""),cardName:"Fast mana",type:"explosive",counterable:true});
    }else if(opp.hand.ramp>0&&rampCasting.canCast){
      opp.hand.ramp--;opp.rampInPlay++;mana-=rampCasting.cost;
      recordCpuSpellCast(turnSpellState);
      actions.push({label:"Ramp",detail:"+1 mana next turn."+(rampCasting.additional?" Noncreature tax paid: "+rampCasting.additional+".":""),cardName:"Ramp spell",type:"ramp",counterable:true});
    }
  }
  if(commander){
    // Equipment left on the battlefield from an earlier commander is re-equipped (activated ability).
    mana=equipLooseGear(opp,mana,actions);
    const castThisTurn=actions.some(action=>action.type==="commander");
    if(!castThisTurn){
      const best=opp.typedHand.filter(c=>c.ref?.category==="gear")
        .map(card=>({card,casting:cpuCanCast(card,card.cost,mana,"gear",turnSpellState)}))
        .filter(({card,casting})=>casting.canCast&&casting.cost+(card.equip||0)<=mana)
        .sort((left,right)=>(right.card.bonus/(right.casting.cost+(right.card.equip||0)))-(left.card.bonus/(left.casting.cost+(left.card.equip||0))))[0];
      if(best){
        const gear=best.card;
        mana-=best.casting.cost+(gear.equip||0);
        opp.attachedGear=(opp.attachedGear||[]).concat({name:gear.name,bonus:gear.bonus||0,kw:gear.kw||null,equip:gear.equip||0,ref:gear.ref?{...gear.ref}:null});
        removeTypedCardFromHand(opp,gear);
        refreshCommanderGear(opp);
        recordCpuSpellCast(turnSpellState);
        actions.push({label:`Cast + Equip ${gear.name}`,detail:gear.effect+". Now "+commander.p+"/"+commander.t+"."+(best.casting.additional?" Noncreature tax paid: "+best.casting.additional+".":""),
          gearName:gear.name,cardName:gear.name,type:"gear",counterable:true});
      }
    }
  }

  // Secondary: at most ONE more cast this turn (restores the e93f455 cap),
  // so CPUs don't dump their whole hand on curve.
  mana=castOneSecondarySpell(opp,mana,allPlayers,actions,turnSpellState);

  applyBattlefieldRuleModifiers();
  opp.heldMana=Math.max(0,mana);
  return {actions};
}

/** Picks and casts the single best secondary spell. Returns remaining mana. */
function castOneSecondarySpell(opp,mana,allPlayers,actions,turnSpellState){
  if(mana<=0&&!opp.typedHand.some(card=>card.scaleCost))return mana;
  const commander=commanderOnField(opp);

  // 1. Board wipe when the table is out of hand.
  const wipe=evaluateAndCastBoardWipe(opp,mana,allPlayers,actions,turnSpellState);
  if(wipe.cast)return wipe.manaRemaining;

  // 2. Haymaker with real impact.
  const haymakers=opp.typedHand.filter(card=>card.ref?.category==="haymakers"&&card.haymaker)
    .map(card=>{
      const casting=cpuCanCast(card,haymakerCost(card,opp,allPlayers),mana,"haymakers",turnSpellState);
      return {card,casting,evaluation:casting.canCast?scoreHaymaker(card,opp,allPlayers):{score:-1}};
    })
    .filter(entry=>entry.casting.canCast&&entry.evaluation.score>0)
    .sort((a,b)=>b.evaluation.score-a.evaluation.score);
  if(haymakers.length){
    const {card,casting,evaluation}=haymakers[0];
    mana-=casting.cost;
    removeTypedCardFromHand(opp,card);
    addOpponentGraveyardCard(opp,typedGraveyardCard(card));
    recordCpuSpellCast(turnSpellState);
    actions.push(castHaymaker(opp,card,evaluation,allPlayers));
    return mana;
  }

  // 3. A creature (most expensive castable first; mana dorks count).
  const creature=opp.typedHand.filter(isCreatureCard)
    .map(card=>({card,casting:cpuCanCast(card,card.cost,mana,"creatures",turnSpellState)}))
    .filter(({casting})=>casting.canCast)
    .sort((left,right)=>right.card.cost-left.card.cost)[0];
  if(creature){
    mana-=creature.casting.cost;
    recordCpuSpellCast(turnSpellState);
    actions.push(castCreatureCard(opp,creature.card,creature.casting));
    return mana;
  }

  // 4. Modeled ramp creature from a generic ramp card while the commander is still in the zone.
  const fallbackRampCasting=cpuCanCast(null,2,mana,"creatures",turnSpellState);
  if(opp.hand.ramp>0&&!commander&&fallbackRampCasting.canCast){
    mana-=fallbackRampCasting.cost;
    recordCpuSpellCast(turnSpellState);
    actions.push(castFallbackRampCreature(opp,fallbackRampCasting));
    return mana;
  }

  // 5. Draw / utility spells (cheapest useful first). Protection stays in hand.
  const spell=opp.typedHand
    .filter(card=>!isCreatureCard(card)&&!["gear","protection","boardwipes","haymakers"].includes(card.ref?.category)&&spellIsUseful(opp,card))
    .map(card=>({card,casting:cpuCanCast(card,card.cost,mana,card.ref?.category,turnSpellState)}))
    .filter(({casting})=>casting.canCast)
    .sort((left,right)=>{
      const rank=entry=>entry.card.draw||entry.card.regrowth?0:1;
      return rank(left)-rank(right)||left.card.cost-right.card.cost;
    })[0];
  if(spell){
    mana-=spell.casting.cost;
    recordCpuSpellCast(turnSpellState);
    actions.push(castNoncreatureSpell(opp,spell.card,spell.casting,actions));
    return mana;
  }

  // 6. Removal aimed at the player's board.
  const removal=tryCpuPlayerRemoval(opp,mana,allPlayers,turnSpellState);
  if(removal){
    mana-=removal.cost;
    recordCpuSpellCast(turnSpellState);
    actions.push(removal.action);
  }
  return mana;
}

/**
 * CPU combat: choose a target and declare attackers (sets token.attacking).
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

  const target=chooseTarget(opp,allPlayers);
  opp.attackTarget=target;
  let attackPower=0; let commanderAttacking=false;

  const defenderOpp=target&&target!=="player"?allPlayers.find(p=>p.id===target):null;
  const defenderTokens=defenderOpp&&defenderOpp.tokens?defenderOpp.tokens:[];

  if(cpuCreaturesCannotAttack()){
    const restriction=activeBattlefieldRules("cpuCreatureAttackBan")[0];
    actions.push({label:"Combat restricted",detail:`${restriction.sourceName||"A battlefield rule"} prevents CPU creatures from attacking.`,type:"combat"});
  }else if(target==="player"||defenderTokens.filter(canBlockCreature).length===0){
    // Attacking the player or an opponent with no untapped blockers: be aggressive.
    opp.tokens.forEach(t=>{
      if(t.summoningSick)return;
      if(t.kind==="commander"){t.attacking=true;commanderAttacking=true;attackPower+=t.p*combatStrikeCount(t);return;}
      if(isManaToken(t))return;
      if(t.p>=2){t.attacking=true;attackPower+=t.p*combatStrikeCount(t);}
    });
  }else{
    // Attacking another CPU: evaluate each creature's profitability.
    smartDeclareAttackers(opp, defenderTokens).forEach(t=>{
      t.attacking=true;
      attackPower+=t.p*combatStrikeCount(t);
      if(t.kind==="commander")commanderAttacking=true;
    });
  }
  opp.attackPower=attackPower;

  let planeswalkerTarget=null;
  const state=liveGameState();
  if(attackPower>0&&target==="player"&&state)planeswalkerTarget=choosePlaneswalkerTarget(opp,state.player);
  opp._planeswalkerTarget=planeswalkerTarget;

  if(attackPower>0&&target){
    const tn=allPlayers.find(p=>p.id===target);
    let attackLabel=`Attack ${tn?(tn.id==="player"?"you":tn.name.split(',')[0]):"?"} for ${attackPower}`;
    const attackers=opp.tokens.filter(t=>t.attacking);
    const attackerCount=attackers.length;
    let attackDetail=`${attackerCount} attacker${attackerCount===1?"":"s"} · Target choice: ${STRATEGY_LABELS[opp.currentStrategy]}.`;
    if(planeswalkerTarget){
      attackLabel=`Attack ${planeswalkerTarget.name} (⬡ ${planeswalkerTarget.loyalty}) for ${attackPower}`;
      attackDetail=`Targeting your planeswalker · ${attackerCount} attacker${attackerCount===1?"":"s"} · Target choice: ${STRATEGY_LABELS[opp.currentStrategy]}.`;
    }
    actions.push({label:attackLabel,detail:attackDetail,type:"attack",attackerUids:attackers.map(t=>t.uid),target});
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
  const excessCards=Math.max(0,opponentHandSize(opp)-MAX_CPU_HAND_SIZE);
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
function createCommanderBattle(numOpponents) {
  const opponents=[];
  for(let i=0;i<Math.min(4,Math.max(1,numOpponents));i++) opponents.push(createOpponent(i));
  // Random starting seat. The UI decides the flow; the engine only stores it
  // (and makes a CPU that goes first in a 1-CPU game skip its first draw).
  const seats=["player",...opponents.map(o=>o.id)];
  const firstSeat=seats[Math.floor(Math.random()*seats.length)];
  return {
    gameMode:"commanderBattle", turn:1, phase:"cpu", cpuTurnIndex:0, firstSeat,
    opponents, player:{id:"player",name:"You",life:40,poison:0,creatures:0,handSize:7,librarySize:92,graveyardCount:0,graveyard:[],nextGraveyardCardId:0,discardHistory:[],exileCount:0,exile:[],nextExileCardId:0,commanderDamageReceived:{},commanderDamageDealt:{},tokens:[],nextTokenUid:0,planeswalkers:[]},
    battlefieldRules:[], nextBattlefieldRuleId:0,
    discardHistory:[], log:[], viewMode:"all", viewTarget:0, gameOver:false, winner:null,
  };
}

function playerAsTarget(state){return {id:"player",name:"You",life:state.player.life,poison:state.player.poison||0,creatures:state.player.creatures,tokens:state.player.tokens||[],planeswalkers:state.player.planeswalkers||[],commanderDamageReceived:state.player.commanderDamageReceived||{}};}
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
  for(const dead of combat.defenderCreaturesKilled){
    const moved=removeOpponentPermanentByUid(tgt,dead.uid,"graveyard");
    if(moved)cmdLog(`${dead.name} (${shortName(tgt)}) dies blocking → ${moved.destination}.`);
  }
  for(const dead of combat.attackerCreaturesKilled){
    const moved=removeOpponentPermanentByUid(opp,dead.uid,"graveyard");
    if(moved)cmdLog(`${dead.name} (${shortName(opp)}) dies in combat → ${moved.destination}.`);
  }
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
      returnCommanderToZone(opp);
      applyBattlefieldRuleModifiers();
      return `You counter ${opp.name}. It returns to the command zone (tax now +${opp.commanderTax}).`;
    }
    case "creature":{
      const regrown=undoRegrowth(opp,action.undo);
      const token=findTokenByUid(opp,action.tokenUid);
      if(!token)return `You counter ${name}, but it is no longer on the battlefield.`;
      const moved=removeOpponentPermanentByUid(opp,token.uid,"graveyard");
      return `You counter ${name}: ${moved?movementCardText(moved):"removed"}.${regrown?` ${regrown} goes back to ${who}'s graveyard.`:""}`;
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
      return `You counter ${name}. ${who} already drew the cards — they stay in hand.`;
    case "wipe":case "haymaker":case "ruleRemoval":case "spell":case "removal":{
      const notes=undoRecord(action.undo);
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
   CPU INTERACTION — held mana, responses, previews (simple, documented)
   A later pass may make these smarter; keep the shapes stable.
   ===================================================================== */
/** Casts a protection card from hand using held mana. Returns {cardName,label} or null. */
function cpuCastHeldProtection(opp,names,reason){
  if(!opp||isOpponentDead(opp))return null;
  const options=opp.typedHand.filter(card=>names.includes(card.name))
    .map(card=>({card,casting:cpuCanCast(card,card.cost,opp.heldMana||0,"protection",null)}))
    .filter(({casting})=>casting.canCast)
    .sort((a,b)=>a.casting.cost-b.casting.cost);
  if(!options.length)return null;
  const {card,casting}=options[0];
  removeTypedCardFromHand(opp,card);
  addOpponentGraveyardCard(opp,typedGraveyardCard(card));
  opp.heldMana=Math.max(0,(opp.heldMana||0)-casting.cost);
  return {cardName:card.name,label:`${shortName(opp)} casts ${card.name}${reason?` — ${reason}`:""}`};
}
/**
 * The CPU may answer removal aimed at one of its creatures with a protection
 * instant, paid from opp.heldMana. Simple rule: it protects its commander or
 * any creature with 4+ power. Consumes the card and mana.
 * Returns {cardName, label} or null.
 */
function cpuRespondToRemoval(opp, token){
  if(!opp||!token)return null;
  const valuable=token.kind==="commander"||(token.p||0)>=4;
  if(!valuable)return null;
  return cpuCastHeldProtection(opp,CPU_PROTECTION_SPELLS,`${token.name.split(",")[0]} is protected`);
}
/**
 * The CPU may answer a board wipe with Heroic Intervention when it has its
 * commander or 2+ creatures on the battlefield. Returns {cardName,label} or null.
 */
function cpuRespondToWipe(opp){
  if(!opp)return null;
  if(!commanderOnField(opp)&&opp.tokens.length<2)return null;
  return cpuCastHeldProtection(opp,CPU_WIPE_PROTECTION_SPELLS,"its permanents gain indestructible");
}
/**
 * Deterministic guess of who this CPU attacks next (no randomness, no state
 * change): weakest player if someone is at 10 or less, the last big hitter
 * (10+ damage), otherwise the highest threat score.
 * Returns {targetId, targetName, reason} or null.
 */
function cpuIntentPreview(opp, state){
  const s=state||liveGameState();
  if(!opp||!s||isOpponentDead(opp))return null;
  const alive=allPlayersForTargeting(s).filter(p=>p.id!==opp.id&&!isEliminatedTarget(p));
  if(!alive.length)return null;
  let pick=null,reason="";
  const weakest=[...alive].sort((a,b)=>a.life-b.life)[0];
  if(alive.length===1){pick=alive[0];reason="Only opponent left";}
  else if(weakest.life<=10){pick=weakest;reason=STRATEGY_LABELS[STRATEGIES.GANG_UP];}
  else if(opp.lastAttacker&&(opp.damageLog[opp.lastAttacker]||0)>=10&&alive.find(p=>p.id===opp.lastAttacker)){pick=alive.find(p=>p.id===opp.lastAttacker);reason=STRATEGY_LABELS[STRATEGIES.LAST_HITTER];}
  else{pick=[...alive].sort((a,b)=>threatScore(b)-threatScore(a))[0];reason=STRATEGY_LABELS[STRATEGIES.THREAT];}
  return {targetId:pick.id,targetName:pick.id==="player"?"You":shortName(pick),reason};
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
 * Table warnings for the player: commander damage at 15+ (or lethal next
 * swing) and boards whose ready power meets the player's life.
 * Returns [{oppId, text}].
 */
function cpuLethalWarnings(state){
  const s=state||liveGameState();
  if(!s)return [];
  const warnings=[];
  const player=s.player;
  aliveOpponents(s).forEach(opp=>{
    const name=shortName(opp);
    const cmd=(player.commanderDamageReceived||{})[opp.id]||0;
    const commander=commanderOnField(opp);
    const commanderHit=commander?commander.p*combatStrikeCount(commander):0;
    if(commander&&cmd+commanderHit>=21)warnings.push({oppId:opp.id,text:`${name}: ${cmd}/21 commander damage to you — lethal next hit (${commanderHit} power)`});
    else if(cmd>=15)warnings.push({oppId:opp.id,text:`${name}: ${cmd}/21 commander damage to you`});
    const power=opp.tokens.filter(t=>!isManaToken(t)).reduce((sum,t)=>sum+(t.p||0)*combatStrikeCount(t),0);
    if(power>0&&power>=player.life)warnings.push({oppId:opp.id,text:`${name}: ${power} power on board vs your ${player.life} life`});
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
    opp.tokens.forEach(token=>registerToken(opp,token));
    normalizeOpponentLibrary(opp);
  });
}
/**
 * Repairs saves made before typed opening hands: every hand.other card needs
 * a typedHand entry and otherDeck must mirror deck.other.
 */
function normalizeOpponentLibrary(opp){
  if(!opp.otherDeck||!opp.deck||!opp.hand)return;
  while(opp.typedHand.length<opp.hand.other&&opp.otherDeck.length>opp.deck.other){
    opp.typedHand.push(typedHandCard(opp.otherDeck.pop()));
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
    case "artifactCastBan":return `${source} — CPU artifacts can't be cast`;
    case "noncreatureCastBan":return `${source} — CPU noncreature spells can't be cast`;
    case "cpuSpellLimit":return `${source} — CPU can cast only one spell each turn`;
    case "cpuCreatureAttackBan":return `${source} — CPU creatures can't attack`;
    case "cpuCreatureBlockBan":return `${source} — CPU creatures can't block`;
    case "noncreatureTax":return `${source} — CPU noncreature spells cost ${rule.amount} more`;
    case "creatureTax":return `${source} — CPU creature spells cost ${rule.amount} more`;
    case "preventCpuDamage":return `${source} — prevent next ${rule.remaining||0} CPU damage`;
    case "cpuGraveyardExile":return `${source} — CPU cards going to graveyards are exiled instead`;
    case "cpuDamageReduction":return `${source} — CPU combat damage is reduced by ${rule.amount}`;
    case "cpuCreaturePT":return `${source} — CPU creatures get ${formatSigned(rule.power)}/${formatSigned(rule.toughness)}`;
    case "cpuCreatureMinusPT":return `${source} — CPU creatures get -${Math.max(0,parseInt(rule.power)||0)}/-${Math.max(0,parseInt(rule.toughness)||0)}`;
    case "cpuCreaturePowerCap":return `${source} — CPU creature power can't exceed ${rule.amount}`;
    case "cpuCreatureKeywordLoss":return `${source} — CPU creatures lose modeled keywords`;
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
    opp.tokens.forEach(token=>{
      if(token.baseP==null)token.baseP=token.p||0;
      if(token.baseT==null)token.baseT=token.t||0;
      if(token.baseKws==null)token.baseKws=[...(token.kws||[])];
      // Temporary "until end of turn" pumps (haymakers) stack on top of rule modifiers.
      token.p=Math.max(0,Math.min(powerCap,token.baseP+modifier.power+(token.pumpP||0)));
      token.t=token.baseT+modifier.toughness+(token.pumpT||0);
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
  if(resolvedCategory==="gear"||resolvedCategory==="explosive"||card?.name==="Skullclamp")return {types:["Artifact"],nonCreature:true};
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
  if(card.name==="Beast Within"||card.name==="Chaos Warp")return true;
  return card.name==="Return to Nature"&&["Artifact","Enchantment"].includes(rule.sourceType);
}
function findCpuRuleRemoval(opp,mana,turnSpellState){
  const rules=activeBattlefieldRules().filter(isPersistentBattlefieldRule).sort((left,right)=>battlefieldRuleRemovalPriority(right)-battlefieldRuleRemovalPriority(left));
  if(!rules.length)return null;
  const answers=opp.typedHand
    .map((card,index)=>({card,index}))
    .filter(({card})=>["Beast Within","Chaos Warp","Return to Nature"].includes(card.name));
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
function battlefieldGraveyardCard(token){
  const ref=token.ref||(token.fromRampCard?null:findCardRefByName(token.name));
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
    if(category==="other"&&opp.otherDeck.length>0){card=typedGraveyardCard(typedHandCard(opp.otherDeck.pop()));}
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
function gearZoneCard(gear){
  return {name:gear.name,ico:"⚙",types:["Artifact","Equipment"],effect:gear.kw||"",bonus:gear.bonus||0,ref:gear.ref||findCardRefByName(gear.name)};
}
/** Bounce: a card goes back to its owner's hand (typed when its definition is known). */
function returnPermanentCardToHand(opp,name,fallbackCategory){
  const ref=name?findCardRefByName(name):null;
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
      return {name:token.name,ico:token.ico||opp.ico,types:["Legendary","Creature"],destination:"command zone",uid:token.uid};
    }
    if(isManaToken(token))opp.rampInPlay=Math.max(0,opp.rampInPlay-(token.rampValue||1));
    if(destination==="hand"){
      let returned=false;
      if(!token.isToken)returned=token.fromRampCard?returnPermanentCardToHand(opp,null,"ramp"):returnPermanentCardToHand(opp,token.name,null);
      return {name:token.name,ico:token.ico||"🐾",types:["Creature"],destination:returned?"hand":"ceases to exist",uid:token.uid};
    }
    const moved=recordOpponentPermanentZone(opp,destination,battlefieldGraveyardCard(token));
    return moved?{...moved,uid:token.uid}:{name:token.name,ico:token.ico||"🐾",types:["Creature"],destination,uid:token.uid};
  }
  if((kind==="gear"&&opp.attachedGear[index])||(kind==="loose"&&(opp.looseGear||[])[index])){
    const [gear]=kind==="gear"?opp.attachedGear.splice(index,1):opp.looseGear.splice(index,1);
    if(kind==="gear")refreshCommanderGear(opp);
    if(destination==="hand"){returnPermanentCardToHand(opp,gear.name,null);return {name:gear.name,ico:"⚙",types:["Artifact","Equipment"],destination:"hand"};}
    return recordOpponentPermanentZone(opp,destination,gearZoneCard(gear));
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
  targets.forEach(target=>{
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
  });
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
