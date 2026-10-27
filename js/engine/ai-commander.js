/* =====================================================================
   ai-commander.js — Commander Battle AI & Game Logic
   
   Contains all non-UI logic for the Commander Battle mode:
   - Opponent creation and turn execution
   - Targeting AI (threat scoring, strategy selection)
   - Board wipe evaluation
   - Battlefield rules system (taxes, bans, prevention)
   - Player effect resolution (discard, mill, destroy, exile, reanimate)
   - Graveyard/exile card management
   - CPU spell casting logic

   Functions that already exist in deck-base.js or combat.js are NOT
   duplicated here. This file expects those to be loaded first.
   
   References globals: gameState, logCommander, renderBoardView, 
   cmdSnapshot, saveState, showCommanderGame, askConfirm
   ===================================================================== */

function generateOtherDeck() {
  const cards = [];
  for (const [cat, count] of Object.entries(DECK_COMPOSITION)) {
    const pool = VOLTRON_CARDS[cat];
    for (let i = 0; i < count; i++) cards.push({category:cat, index:i%pool.length});
  }
  return fisherYatesShuffle(cards);
}
function resolveCard(ref) { return VOLTRON_CARDS[ref.category][ref.index]; }

function drawCard(deck, hand) {
  const total = deck.lands+deck.ramp+deck.explosive+deck.other;
  if (total <= 0) return "none";
  let roll = Math.floor(Math.random()*total);
  for (const key of ["lands","ramp","explosive","other"]) {
    if (roll < deck[key]) { deck[key]--; hand[key]++; return key; }
    roll -= deck[key];
  }
  return "none";
}

function createOpponent(index) {
  const id = CPU_NAMES[index] || CPU_NAMES[0];
  const deck = {lands:37,ramp:10,explosive:1,other:53};
  const otherDeck = generateOtherDeck();
  const hand = {lands:0,ramp:0,explosive:0,other:0};
  for (let i=0;i<7;i++) drawCard(deck,hand);
  let mulligans=0;
  while(hand.lands<2&&mulligans<2){mulligans++;Object.keys(hand).forEach(k=>{hand[k]=0;});for(let i=0;i<7;i++)drawCard(deck,hand);}
  for(let i=0;i<mulligans;i++){const cat=["other","ramp","explosive","lands"].find(k=>hand[k]>0);if(cat)hand[cat]--;}

  return {
    id:`cpu_${index}`, index, name:id.name, ico:id.ico, color:id.color, archetype:"voltron",
    life:40, commanderDamageReceived:{}, commanderDamageDealt:{},
    commanderZone:true, commanderTax:0,
    deck, otherDeck, hand, typedHand:[], landsInPlay:0, rampInPlay:0, explosiveInPlay:0, gear:0, attachedGear:[], graveyardCount:0, graveyard:[], nextGraveyardCardId:0, discardHistory:[], exileCount:0, exile:[], nextExileCardId:0,
    tokens:[], damageLog:{}, lastAttacker:null, grudge:null,
    currentStrategy:STRATEGIES.THREAT, actionSteps:[], attackTarget:null, attackPower:0,
  };
}

function manaAvailable(opp) { return opp.landsInPlay+opp.rampInPlay+(opp.explosiveInPlay*2); }
function opponentHandSize(opp){return Object.values(opp.hand||{}).reduce((total,count)=>total+(count||0),0);}
function opponentDeckSize(opp){return Object.values(opp.deck||{}).reduce((total,count)=>total+(count||0),0);}
function commanderCost(opp) { return COMMANDER_BASE.cost+(opp.commanderTax||0); }
function commanderOnField(opp) { return opp.tokens.find(t=>t.kind==="commander")||null; }
function isOpponentDead(opp) {
  if(opp.life<=0)return true;
  for(const[,dmg]of Object.entries(opp.commanderDamageReceived)){if(dmg>=21)return true;}
  return false;
}

function deployCommander(opp) {
  const cost=commanderCost(opp), mana=manaAvailable(opp);
  if(mana<cost||commanderOnField(opp))return false;
  opp.commanderZone=false;
  opp.tokens.push({name:opp.name,ico:opp.ico,kind:"commander",type:"Legendary Creature",
    p:COMMANDER_BASE.p,t:COMMANDER_BASE.t,baseP:COMMANDER_BASE.p,baseT:COMMANDER_BASE.t,
    kws:[...COMMANDER_BASE.kws],baseKws:[...COMMANDER_BASE.kws],effect:"Commander",summoningSick:true,owner:opp.id});
  return true;
}
function refreshCommanderGear(opp){
  const commander=commanderOnField(opp);
  opp.attachedGear=opp.attachedGear||[];
  opp.gear=opp.attachedGear.length;
  if(!commander)return;
  const bonus=opp.attachedGear.reduce((total,gear)=>total+(gear.bonus||0),0);
  commander.baseP=COMMANDER_BASE.p+bonus;
  commander.baseT=COMMANDER_BASE.t+bonus;
  commander.p=commander.baseP;commander.t=commander.baseT;
  commander.baseKws=[...new Set([...COMMANDER_BASE.kws,...opp.attachedGear.map(gear=>gear.kw).filter(Boolean)])];
  commander.kws=[...commander.baseKws];
  commander.effect=opp.gear?`Commander — ${opp.gear} gear.`:"Commander";
  if(typeof gameState!=="undefined"&&gameState)applyBattlefieldRuleModifiers();
}
function returnCommanderToZone(opp){opp.tokens=opp.tokens.filter(t=>t.kind!=="commander");opp.commanderZone=true;opp.commanderTax+=2;opp.gear=0;opp.attachedGear=[];}

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
  // Higher-loyalty planeswalkers are higher priority targets
  const viable=pws.filter(pw=>pw.loyalty>0).sort((a,b)=>b.loyalty-a.loyalty);
  if(viable.length===0)return null;
  // CPUs prioritize killing planeswalkers ~60% of the time when they exist
  // — they're value engines that must be answered, especially if loyalty is high
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
  const alive=allPlayers.filter(p=>p.id!==opp.id&&p.life>0&&!(p.commanderDamageReceived&&Object.values(p.commanderDamageReceived).some(d=>d>=21)));
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

/* ---------- board wipe strategy ---------- */
/**
 * Evaluates whether the CPU should cast a board wipe this turn.
 * Strategy:
 * - Symmetric (Wrath of the Wilds): Cast when opponents collectively have 4+ more
 *   creatures than you, OR you're about to die and they have a wide board.
 *   Never cast if you have more creatures than all opponents combined.
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
  const totalEnemyCreatures=opponents.reduce((sum,p)=>{
    const count=p.creatures!=null?p.creatures:(p.tokens?p.tokens.length:0);
    return sum+count;
  },0);

  // Find the most threatening opponent by creature count
  let biggestThreat=null, biggestThreatCount=0;
  opponents.forEach(p=>{
    const count=p.creatures!=null?p.creatures:(p.tokens?p.tokens.length:0);
    if(count>biggestThreatCount){biggestThreatCount=count;biggestThreat=p;}
  });

  // --- Symmetric wipe decision ---
  const symmetricWipe=wipesInHand.find(c=>c.wipeType==="symmetric");
  if(symmetricWipe){
    const casting=cpuCanCast(symmetricWipe,symmetricWipe.cost,mana,"haymakers",turnSpellState);
    if(casting.canCast){
      const boardDeficit=totalEnemyCreatures-myCreatureCount;
      // Cast if enemies have 4+ more creatures, OR life is critical and they have 3+
      const desperate=opp.life<=15&&totalEnemyCreatures>=3;
      if(boardDeficit>=4||desperate){
        mana-=casting.cost;
        opp.typedHand=opp.typedHand.filter(c=>c!==symmetricWipe);
        opp.hand.other=Math.max(0,opp.hand.other-1);
        recordCpuSpellCast(turnSpellState);

        // Remove all of THIS CPU's non-commander creatures
        const myDead=opp.tokens.filter(t=>t.kind!=="commander");
        for(let i=opp.tokens.length-1;i>=0;i--){
          if(opp.tokens[i]&&opp.tokens[i].kind!=="commander")removeOpponentPermanent(opp,`token:${i}`,"graveyard");
        }

        // Remove all OTHER CPU's creatures
        const otherCpus=allPlayers.filter(p=>p.id!==opp.id&&p.id!=="player"&&p.tokens);
        otherCpus.forEach(cpu=>{
          const cpuOpp=(typeof gameState!=="undefined"&&gameState)?gameState.opponents.find(o=>o.id===cpu.id):null;
          if(cpuOpp){
            for(let i=cpuOpp.tokens.length-1;i>=0;i--){
              if(cpuOpp.tokens[i]&&cpuOpp.tokens[i].kind!=="commander")removeOpponentPermanent(cpuOpp,`token:${i}`,"graveyard");
            }
          }
        });

        actions.push({
          label:`⚡ Cast ${symmetricWipe.name}`,
          detail:`${symmetricWipe.effect} All non-commander creatures on every battlefield are destroyed.`,
          boardWipe:"symmetric",
          wipeName:symmetricWipe.name
        });
        return {cast:true,manaRemaining:mana};
      }
    }
  }

  // --- Targeted wipe decision ---
  const targetedWipe=wipesInHand.find(c=>c.wipeType==="targeted");
  if(targetedWipe&&biggestThreat&&biggestThreatCount>=3){
    const casting=cpuCanCast(targetedWipe,targetedWipe.cost,mana,"haymakers",turnSpellState);
    if(casting.canCast){
      // Cast if the biggest threat has 3+ creatures and more than us
      if(biggestThreatCount>myCreatureCount||(biggestThreatCount>=3&&opp.life<=25)){
        mana-=casting.cost;
        opp.typedHand=opp.typedHand.filter(c=>c!==targetedWipe);
        opp.hand.other=Math.max(0,opp.hand.other-1);
        recordCpuSpellCast(turnSpellState);

        // If targeting another CPU, destroy their creatures immediately
        if(biggestThreat.id!=="player"){
          const cpuOpp=(typeof gameState!=="undefined"&&gameState)?gameState.opponents.find(o=>o.id===biggestThreat.id):null;
          if(cpuOpp){
            for(let i=cpuOpp.tokens.length-1;i>=0;i--){
              if(cpuOpp.tokens[i]&&cpuOpp.tokens[i].kind!=="commander")removeOpponentPermanent(cpuOpp,`token:${i}`,"graveyard");
            }
          }
        }
        // If targeting the player, creatures are NOT removed here — the player gets
        // a popup/response window to protect before resolution.

        const targetName=biggestThreat.id==="player"?"You":biggestThreat.name.split(',')[0];
        actions.push({
          label:`⚡ Cast ${targetedWipe.name} targeting ${targetName}`,
          detail:`${targetedWipe.effect} ${targetName}'s creatures are destroyed.`,
          boardWipe:"targeted",
          wipeTarget:biggestThreat.id,
          wipeTargetName:targetName,
          wipeName:targetedWipe.name
        });
        return {cast:true,manaRemaining:mana};
      }
    }
  }

  return {cast:false,manaRemaining:mana};
}

/* ---------- turn execution ---------- */
function executeOpponentTurn(opp, allPlayers) {
  const actions=[];
  const turnSpellState={spellsCast:0};
  let commander=commanderOnField(opp);

  // Draw. A CPU that cannot complete its required draw loses the game.
  if(opponentDeckSize(opp)===0){
    opp.life=0;
    actions.push({label:"Decked out",detail:"Cannot draw from an empty deck. Life → 0.",deckOut:true});
    opp.actionSteps=actions;
    return {target:null,attackPower:0,commanderAttacking:false,actions};
  }
  const drawn=drawCard(opp.deck,opp.hand);
  if(drawn==="other"&&opp.otherDeck.length>0){const ref=opp.otherDeck.pop();opp.typedHand.push({...resolveCard(ref),ref});}
  if(drawn!=="none")actions.push({label:"Draw",detail:"Draws a card."});

  // Land drop
  if(opp.hand.lands>0){opp.hand.lands--;opp.landsInPlay++;actions.push({label:"Land drop",detail:`${opp.landsInPlay} lands in play.`});}

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
      actions.push({label:`Cast ${opp.name}`,detail:"Commander enters."+(commanderCasting.additional?" Creature tax paid: "+commanderCasting.additional+".":"")});
      commander=commanderOnField(opp);
    }else if(opp.hand.explosive>0&&explosiveCasting.canCast){
      opp.hand.explosive--;opp.explosiveInPlay++;mana-=explosiveCasting.cost;
      recordCpuSpellCast(turnSpellState);
      actions.push({label:"Fast mana",detail:"+2 mana next turn."+(explosiveCasting.additional?" Noncreature tax paid: "+explosiveCasting.additional+".":"")});
    }else if(opp.hand.ramp>0&&rampCasting.canCast){
      opp.hand.ramp--;opp.rampInPlay++;mana-=rampCasting.cost;
      recordCpuSpellCast(turnSpellState);
      actions.push({label:"Ramp",detail:"+1 mana next turn."+(rampCasting.additional?" Noncreature tax paid: "+rampCasting.additional+".":"")});
    }
  } else {
    const gearInHand=opp.typedHand.filter(c=>c.ref?.category==="gear");
    const best=gearInHand
      .map(card=>({card,casting:cpuCanCast(card,card.cost,mana,"gear",turnSpellState)}))
      .filter(({card,casting})=>casting.canCast&&casting.cost+(card.equip||0)<=mana)
      .sort((left,right)=>(right.card.bonus/(right.casting.cost+(right.card.equip||0)))-(left.card.bonus/(left.casting.cost+(left.card.equip||0))))[0];
    if(best){
      const gear=best.card;
      mana-=best.casting.cost+(gear.equip||0);
      opp.attachedGear=(opp.attachedGear||[]).concat({name:gear.name,bonus:gear.bonus||0,kw:gear.kw||null});
      refreshCommanderGear(opp);
      opp.typedHand=opp.typedHand.filter(c=>c!==gear);opp.hand.other=Math.max(0,opp.hand.other-1);
      recordCpuSpellCast(turnSpellState);
      actions.push({label:`Equip ${gear.name}`,detail:gear.effect+". Now "+commander.p+"/"+commander.t+"."+(best.casting.additional?" Noncreature tax paid: "+best.casting.additional+".":"")});
    }
  }

  // Board wipe evaluation — cast BEFORE deploying more creatures
  const boardWipeCast=evaluateAndCastBoardWipe(opp,mana,allPlayers,actions,turnSpellState);
  if(boardWipeCast.cast)mana=boardWipeCast.manaRemaining;

  // Secondary: cast creatures with remaining mana (multiple if possible).
  // AI aggressiveness: the more cards and mana available, the more casts allowed.
  // Prevents situations where CPUs sit on 7 cards and 12 mana doing nothing.
  const handTotal=opponentHandSize(opp);
  const maxCreatureCasts=handTotal>=6?5:handTotal>=4?4:3;
  let castCount=0;
  while(mana>=1&&castCount<maxCreatureCasts){
    const castable=opp.typedHand
      .filter(card=>card.ref?.category==="creatures"||card.rampValue)
      .map(card=>({card,casting:cpuCanCast(card,card.cost,mana,"creatures",turnSpellState)}))
      .filter(({casting})=>casting.canCast)
      .sort((left,right)=>right.card.cost-left.card.cost);
    const selected=castable[0];
    if(!selected)break;
    const toCast=selected.card;
    mana-=selected.casting.cost;
    const p=toCast.p||1,t=toCast.t||1;
    const baseKws=toCast.kws?[...toCast.kws]:[];
    opp.tokens.push({name:toCast.name,ico:toCast.ico||"🐾",kind:toCast.rampValue?"voltron-support":"voltron-creature",
      type:"Creature",p,t,baseP:p,baseT:t,kws:[...baseKws],baseKws,effect:toCast.effect||"",summoningSick:!toCast.haste,owner:opp.id});
    if(toCast.rampValue)opp.rampInPlay+=toCast.rampValue;
    opp.typedHand=opp.typedHand.filter(c=>c!==toCast);opp.hand.other=Math.max(0,opp.hand.other-1);
    recordCpuSpellCast(turnSpellState);
    actions.push({label:`Cast ${toCast.name}`,detail:`${p}/${t} enters.`+(selected.casting.additional?" Creature tax paid: "+selected.casting.additional+".":"")});
    castCount++;
  }
  // Fallback: spend remaining ramp hand slots as a modeled creature if hand has them.
  const fallbackRampCasting=cpuCanCast(null,2,mana,"creatures",turnSpellState);
  if(castCount===0&&opp.hand.ramp>0&&!commander&&fallbackRampCasting.canCast){
    opp.hand.ramp--;opp.rampInPlay++;
    opp.tokens.push({name:"Wilds Guide",ico:"🌿",kind:"voltron-support",type:"Creature — Shaman",p:2,t:2,baseP:2,baseT:2,kws:[],baseKws:[],effect:"Taps for mana.",summoningSick:true,owner:opp.id});
    mana-=fallbackRampCasting.cost;
    recordCpuSpellCast(turnSpellState);
    actions.push({label:"Cast Wilds Guide",detail:"2/2 ramp creature enters."+(fallbackRampCasting.additional?" Creature tax paid: "+fallbackRampCasting.additional+".":"")});
  }

  // Tertiary: with remaining mana, cast non-creature spells (draw, utility, haymakers)
  // to develop the board instead of passing with a full hand.
  if(mana>=2&&opp.typedHand.length>0){
    const nonCreatureSpells=opp.typedHand
      .filter(card=>!card.rampValue&&card.ref?.category!=="creatures"&&card.ref?.category!=="gear"&&card.ref?.category!=="protection"&&card.ref?.category!=="boardwipes")
      .map(card=>({card,casting:cpuCanCast(card,card.cost,mana,card.ref?.category,turnSpellState)}))
      .filter(({casting})=>casting.canCast)
      .sort((left,right)=>left.card.cost-right.card.cost);
    let spellsCast=0;
    for(const entry of nonCreatureSpells){
      if(spellsCast>=2)break;
      if(mana<entry.casting.cost)continue;
      mana-=entry.casting.cost;
      const card=entry.card;
      opp.typedHand=opp.typedHand.filter(c=>c!==card);opp.hand.other=Math.max(0,opp.hand.other-1);
      recordCpuSpellCast(turnSpellState);
      if(card.ref?.category==="draw"){
        const extraDraws=Math.min(3,opp.otherDeck?.length||0);
        for(let i=0;i<extraDraws;i++){if(opp.otherDeck.length>0){const ref=opp.otherDeck.pop();opp.typedHand.push({...resolveCard(ref),ref});opp.hand.other++;}}
        actions.push({label:`Cast ${card.name}`,detail:`${card.effect} Draws ${extraDraws} card${extraDraws===1?"":"s"}.`});
      }else{
        addOpponentGraveyardCard(opp,typedGraveyardCard(card));
        actions.push({label:`Cast ${card.name}`,detail:card.effect||"Resolves a spell."});
      }
      spellsCast++;
    }
  }
  applyBattlefieldRuleModifiers();

  // Choose target & declare attackers
  const target=chooseTarget(opp,allPlayers);
  opp.attackTarget=target;
  let attackPower=0; let commanderAttacking=false;

  // Get defender's tokens for smart attack evaluation (only for CPU targets)
  const defenderOpp=target&&target!=="player"?allPlayers.find(p=>p.id===target):null;
  const defenderTokens=defenderOpp&&defenderOpp.tokens?defenderOpp.tokens:[];

  if(cpuCreaturesCannotAttack()){
    opp.tokens.forEach(token=>{token.attacking=false;});
    const restriction=activeBattlefieldRules("cpuCreatureAttackBan")[0];
    actions.push({label:"Combat restricted",detail:`${restriction.sourceName||"A battlefield rule"} prevents CPU creatures from attacking.`});
  }else if(target==="player"||defenderTokens.length===0){
    // Attacking player or an opponent with no blockers: be aggressive
    opp.tokens.forEach(t=>{
      t.attacking=false;
      if(t.summoningSick)return;
      if(t.kind==="commander"){t.attacking=true;commanderAttacking=true;attackPower+=t.p;return;}
      if(t.kind==="voltron-support"&&t.effect&&t.effect.includes("mana"))return;
      if(t.p>=2){t.attacking=true;attackPower+=t.p;}
    });
  }else{
    // Attacking another CPU: evaluate each creature's profitability
    opp.tokens.forEach(t=>{t.attacking=false;});
    const smartAttackers=smartDeclareAttackers(opp, defenderTokens);
    smartAttackers.forEach(t=>{
      t.attacking=true;
      attackPower+=t.p;
      if(t.kind==="commander")commanderAttacking=true;
    });
  }
  opp.attackPower=attackPower;

  // When attacking the player, decide if some/all attackers should target a planeswalker
  let planeswalkerTarget=null;
  if(attackPower>0&&target==="player"&&typeof gameState!=="undefined"&&gameState){
    planeswalkerTarget=choosePlaneswalkerTarget(opp,gameState.player);
  }
  opp._planeswalkerTarget=planeswalkerTarget;

  if(attackPower>0&&target){
    const tn=allPlayers.find(p=>p.id===target);
    let attackLabel=`Attack ${tn?(tn.id==="player"?"you":tn.name.split(',')[0]):"?"} for ${attackPower}`;
    const attackerCount=opp.tokens.filter(t=>t.attacking).length;
    let attackDetail=`${attackerCount} attacker${attackerCount===1?"":"s"} · Target choice: ${STRATEGY_LABELS[opp.currentStrategy]}.`;
    if(planeswalkerTarget){
      attackLabel=`Attack ${planeswalkerTarget.name} (⬡ ${planeswalkerTarget.loyalty}) for ${attackPower}`;
      attackDetail=`Targeting your planeswalker · ${attackerCount} attacker${attackerCount===1?"":"s"} · Target choice: ${STRATEGY_LABELS[opp.currentStrategy]}.`;
    }
    actions.push({label:attackLabel,detail:attackDetail});
  }

  // End step: CPU cannot retain more than seven cards. It keeps the most useful cards.
  const excessCards=Math.max(0,opponentHandSize(opp)-MAX_CPU_HAND_SIZE);
  if(excessCards>0){
    const discarded=discardFromOpponent(opp,excessCards);
    const details=discarded.map(discardedCardText).join(", ");
    const typeSummary=discardedTypeSummary(discarded);
    actions.push({label:"Discard to hand size",detail:`Discards ${details}. Types: ${typeSummary}. Keeps ${opponentHandSize(opp)} card${opponentHandSize(opp)===1?"":"s"}.`,discarded});
  }

  opp.tokens.forEach(t=>{t.summoningSick=false;});
  opp.actionSteps=actions;
  return {target,attackPower,commanderAttacking,actions,planeswalkerTarget};
}

/* =====================================================================
   COMMANDER BATTLE — Game state & orchestration
   ===================================================================== */
function createCommanderBattle(numOpponents) {
  const opponents=[];
  for(let i=0;i<Math.min(4,Math.max(1,numOpponents));i++) opponents.push(createOpponent(i));
  return {
    gameMode:"commanderBattle", turn:1, phase:"cpu", cpuTurnIndex:0,
    opponents, player:{id:"player",name:"You",life:40,creatures:0,handSize:7,librarySize:92,graveyardCount:0,graveyard:[],nextGraveyardCardId:0,discardHistory:[],exileCount:0,exile:[],nextExileCardId:0,commanderDamageReceived:{},commanderDamageDealt:{},tokens:[],planeswalkers:[]},
    battlefieldRules:[], nextBattlefieldRuleId:0,
    discardHistory:[], log:[], viewMode:"all", viewTarget:0, gameOver:false, winner:null,
  };
}

function playerAsTarget(state){return {id:"player",name:"You",life:state.player.life,creatures:state.player.creatures,tokens:state.player.tokens||[],planeswalkers:state.player.planeswalkers||[]};}
function allPlayersForTargeting(state){const all=[playerAsTarget(state)];state.opponents.forEach(o=>{if(!isOpponentDead(o))all.push(o);});return all;}
function aliveOpponents(state){return state.opponents.filter(o=>!isOpponentDead(o));}
function isPlayerDead(state){
  if(state.player.life<=0)return true;
  for(const[,dmg]of Object.entries(state.player.commanderDamageReceived)){if(dmg>=21)return true;}
  return false;
}

/* =====================================================================
   CPU-vs-CPU COMBAT SYSTEM
   Strategic attack decisions and blocking logic.
   ===================================================================== */


// NOTE: Combat functions (hasKeyword, creatureCombatValue, combatDamageKills,
// creatureSurvivesCombat, trampleOverflow, resolveSingleBlock,
// evaluateAttackProfitability, smartDeclareAttackers, cpuAssignBlockers,
// resolveCpuCombat) are in combat.js

function executeCpuTurnCycle(state) {
  const results=[], allPlayers=allPlayersForTargeting(state);
  for(const opp of state.opponents){
    if(isOpponentDead(opp))continue;
    const result=executeOpponentTurn(opp,allPlayers);
    results.push({opponent:opp,...result});
    if(result.attackPower>0&&result.target){
      const cmdDmg=result.commanderAttacking?(opp.tokens.find(t=>t.kind==="commander")?.p||0):0;
      if(result.target==="player"){
        opp._pendingPlayerAttack={totalPower:result.attackPower,commanderDamage:cmdDmg,
          attackers:opp.tokens.filter(t=>t.attacking).map(t=>({name:t.name,ico:t.ico,p:t.p,t:t.t,kind:t.kind}))};
      } else {
        const tgt=state.opponents.find(p=>p.id===result.target);
        if(tgt&&!isOpponentDead(tgt)){
          // Full combat resolution with blocking
          const attackers=opp.tokens.filter(t=>t.attacking);
          const combat=resolveCpuCombat(opp, tgt, attackers);
          const prevention=applyCpuDamagePrevention(combat.damageToDefender,combat.commanderDamage);

          // Apply life damage
          if(prevention.damage>0){
            tgt.life=Math.max(0,tgt.life-prevention.damage);
            tgt.damageLog[opp.id]=(tgt.damageLog[opp.id]||0)+prevention.damage;
            tgt.lastAttacker=opp.id;
          }
          // Commander damage
          if(prevention.commanderDamage>0){
            tgt.commanderDamageReceived[opp.id]=(tgt.commanderDamageReceived[opp.id]||0)+prevention.commanderDamage;
          }
          if(prevention.reduced)logCommander(`Battlefield damage reduction lowers ${opp.name.split(',')[0]}'s combat damage by ${prevention.reduced}.`);
          if(prevention.prevented)logCommander(`Battlefield prevention stops ${prevention.prevented} damage from ${opp.name.split(',')[0]}.`);

          // Remove killed defender creatures
          for(const dead of combat.defenderCreaturesKilled){
            const idx=tgt.tokens.indexOf(dead);
            if(idx>=0){
              const moved=removeOpponentPermanent(tgt,`token:${idx}`,"graveyard");
              if(moved)logCommander(`${dead.name} (${tgt.name.split(',')[0]}) dies blocking → ${moved.destination}.`);
            }
          }
          // Remove killed attacker creatures
          for(const dead of combat.attackerCreaturesKilled){
            const idx=opp.tokens.indexOf(dead);
            if(idx>=0){
              const moved=removeOpponentPermanent(opp,`token:${idx}`,"graveyard");
              if(moved)logCommander(`${dead.name} (${opp.name.split(',')[0]}) dies in combat → ${moved.destination}.`);
            }
          }

          // Log combat summary
          if(combat.blockedDescriptions.length>0){
            const blockSummary=combat.blockedDescriptions.map(b=>{
              if(b.attackerDies&&b.blockerDies)return `${b.attacker} trades with ${b.blocker}`;
              if(b.attackerDies)return `${b.blocker} kills ${b.attacker}`;
              if(b.blockerDies)return `${b.attacker} kills ${b.blocker}`;
              return `${b.blocker} blocks ${b.attacker}`;
            }).join("; ");
            logCommander(`Combat: ${blockSummary}.`);
          }
          if(prevention.damage>0){
            logCommander(`${combat.unblocked.length} unblocked → ${prevention.damage} damage to ${tgt.name.split(',')[0]}. Life → ${tgt.life}.`);
          }else if(attackers.length>0&&(combat.blockedDescriptions.length>0||prevention.prevented||prevention.reduced)){
            logCommander(`${tgt.name.split(',')[0]} takes no combat damage from ${opp.name.split(',')[0]}.`);
          }
        }
      }
    }
  }
  return results;
}

function getPendingPlayerAttacks(state){
  const pending=[];
  for(const opp of state.opponents){if(opp._pendingPlayerAttack)pending.push({opponent:opp,attack:opp._pendingPlayerAttack});}
  return pending;
}

function checkCommanderBattleEnd(state){
  if(isPlayerDead(state))return {over:true,won:false,reason:"You were eliminated."};
  if(aliveOpponents(state).length===0)return {over:true,won:true,reason:"All opponents eliminated!"};
  return {over:false};
}

/* =====================================================================
   PLAYER ACTIONS — direct instantiation against Commander Battle state
   ===================================================================== */
const PLAYER_ACTION_SCOPES=[
  {value:"target",label:"Target player"},
  {value:"each",label:"Each player"},
  {value:"eachOpponent",label:"Each opponent"}
];
const PLAYER_ACTIONS=[
  {value:"discard",label:"Discard cards"},
  {value:"mill",label:"Mill cards"},
  {value:"destroy",label:"Destroy permanents"},
  {value:"sacrifice",label:"Sacrifice permanents"},
  {value:"exile",label:"Exile permanents"},
  {value:"exileGraveyards",label:"Exile all graveyards"},
  {value:"reanimate",label:"Resurrect selected creatures to your battlefield"},
  {value:"draw",label:"Draw cards"},
  {value:"loseLife",label:"Lose life"},
  {value:"gainLife",label:"Gain life"}
];
const PLAYER_ACTION_CARD_TYPES=["creature","artifact","land","permanent"];
let commanderEffectDraft=null;

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
  });
}

const BATTLEFIELD_RULE_TYPES=[
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
let battlefieldRuleDraft={kind:"artifactCastBan",sourceName:"",sourceType:"Enchantment",amount:2,power:1,toughness:1};

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
      token.p=Math.max(0,Math.min(powerCap,token.baseP+modifier.power));
      token.t=token.baseT+modifier.toughness;
      token.kws=removeKeywords?[]:[...token.baseKws];
      if(token.t<=0)defeated.push({opp,token});
    });
  });
  defeated.forEach(({opp,token})=>{
    const index=opp.tokens.indexOf(token);
    if(index<0)return;
    const moved=removeOpponentPermanent(opp,`token:${index}`,"graveyard");
    if(moved)logCommander(`${token.name} has 0 or less toughness and leaves the battlefield → ${moved.destination}.`);
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
  actions.push({label:`Cast ${card.name}`,detail:`Removes ${battlefieldRuleLabel(answer.rule)}.`});
  logCommander(`${opp.name.split(",")[0]} casts ${card.name} to remove ${answer.rule.sourceName||"a battlefield rule"}.`);
  return mana;
}
function applyCpuDamagePrevention(damage,commanderDamage){
  let remainingDamage=Math.max(0,damage||0);
  let remainingCommanderDamage=Math.max(0,commanderDamage||0);
  const damageReduction=activeBattlefieldRules("cpuDamageReduction").reduce((sum,rule)=>sum+(parseInt(rule.amount)||0),0);
  const reduced=Math.min(remainingDamage,damageReduction);
  remainingDamage-=reduced;
  remainingCommanderDamage=Math.max(0,remainingCommanderDamage-reduced);
  let prevented=0;
  activeBattlefieldRules("preventCpuDamage").forEach(rule=>{
    if(remainingDamage<=0||!rule.remaining)return;
    const absorbed=Math.min(remainingDamage,rule.remaining);
    rule.remaining-=absorbed;
    remainingDamage-=absorbed;
    const commanderAbsorbed=Math.min(remainingCommanderDamage,absorbed);
    remainingCommanderDamage-=commanderAbsorbed;
    prevented+=absorbed;
  });
  if(prevented)gameState.battlefieldRules=gameState.battlefieldRules.filter(rule=>rule.kind!=="preventCpuDamage"||rule.remaining>0);
  return {damage:remainingDamage,commanderDamage:remainingCommanderDamage,prevented,reduced};
}
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
  renderBoardView(gameState);
  logCommander(`Battlefield rule added: ${battlefieldRuleLabel(rule)}.`);
  return rule;
}
function removeBattlefieldRule(ruleId,reason="removed"){
  const rule=battlefieldRules().find(candidate=>candidate.id===ruleId);
  if(!rule)return;
  gameState.battlefieldRules=gameState.battlefieldRules.filter(candidate=>candidate.id!==ruleId);
  applyBattlefieldRuleModifiers();
  renderBoardView(gameState);
  logCommander(`${rule.sourceName||"Battlefield rule"} ${reason}.`);
}

function createPlayerEffect(draft){
  if(draft.action==="exileGraveyards")return {scope:"each",action:"exileGraveyards",count:0,all:true,cardType:null};
  return {
    scope:draft.scope,
    action:draft.action,
    count:Math.max(1,parseInt(draft.count)||1),
    all:!!draft.all,
    cardType:(draft.action==="destroy"||draft.action==="sacrifice"||draft.action==="exile")?draft.cardType:draft.action==="reanimate"?"creature":null
  };
}
function playerActionAmount(effect,target){
  if(!effect.all)return effect.count;
  if(effect.action==="discard")return target.id==="player"?Math.max(0,target.handSize||0):opponentHandSize(target);
  if(effect.action==="mill"||effect.action==="draw")return target.id==="player"?Math.max(0,target.librarySize||0):opponentDeckSize(target);
  if(effect.action==="reanimate")return graveyardCreatureCards(target).length;
  if(effect.action==="destroy"||effect.action==="sacrifice"||effect.action==="exile"){
    return target.id==="player"
      ?["creature","permanent"].includes(effect.cardType)?Math.max(0,target.creatures||0):0
      :opponentPermanentOptions(target,effect.cardType).length;
  }
  if(effect.action==="loseLife"||effect.action==="gainLife")return Math.max(0,target.life||0);
  return effect.count;
}
function effectTargets(state,effect,targetId){
  const all=[state.player,...aliveOpponents(state)];
  if(effect.scope==="each")return all;
  if(effect.scope==="eachOpponent")return aliveOpponents(state);
  return all.filter(player=>player.id===targetId);
}
function effectTargetName(target){return target.id==="player"?"You":target.name.split(",")[0];}
function drawForOpponent(opp){
  const drawn=drawCard(opp.deck,opp.hand);
  if(drawn==="other"&&opp.otherDeck.length>0){const ref=opp.otherDeck.pop();opp.typedHand.push({...resolveCard(ref),ref});}
  return drawn;
}
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
  return {name:token.name,ico:token.ico||"🐾",types:(token.type||"Creature").includes("Creature")?["Creature"]:[token.type||"Permanent"],p:token.p,t:token.t,kws:token.baseKws?[...token.baseKws]:token.kws?[...token.kws]:[],effect:token.effect||"",virtual:false,isToken:!!token.isToken};
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
  player.tokens.push({name:card.name,ico:card.ico||"🐾",kind:"reanimated-creature",type:"Creature",p:card.p||1,t:card.t||1,baseP:card.p||1,baseT:card.t||1,kws:card.kws?[...card.kws]:[],effect:card.effect||`Resurrected from ${effectTargetName(owner)}'s graveyard.`,summoningSick:true,owner:card.ownerId||owner.id,controller:"player",isToken:false});
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
    if(category==="other"&&opp.otherDeck.length>0){const ref=opp.otherDeck.pop();card=typedGraveyardCard({...resolveCard(ref),ref});}
    const entry=addOpponentGraveyardCard(opp,card);if(entry)milled.push(entry);
  }
  return milled;
}
function opponentPermanentOptions(opp,type){
  const options=[];
  const includes=kind=>type==="permanent"||type===kind;
  if(includes("creature"))opp.tokens.forEach((token,index)=>options.push({key:`token:${index}`,label:`${token.ico} ${token.name}`,type:"creature"}));
  if(includes("artifact")){
    (opp.attachedGear||[]).forEach((gear,index)=>options.push({key:`gear:${index}`,label:`⚙ ${gear.name}`,type:"artifact"}));
    for(let index=0;index<opp.explosiveInPlay;index++)options.push({key:`fastMana:${index}`,label:"⚙ Fast mana",type:"artifact"});
  }
  if(includes("land"))for(let index=0;index<opp.landsInPlay;index++)options.push({key:`land:${index}`,label:"🌲 Land",type:"land"});
  return options;
}
function cpuPermanentPriority(opp,option){
  const [kind,indexText]=option.key.split(":"),index=parseInt(indexText);
  if(kind==="token"){
    const token=opp.tokens[index];
    if(!token)return Infinity;
    if(token.kind==="commander")return 10000;
    return (token.p||0)+(token.t||0)+(token.kind==="voltron-support"&&token.effect?.includes("mana")?30:0);
  }
  if(kind==="gear"){
    const gear=opp.attachedGear[index];
    return (gear?.bonus||0)+(gear?.kw?8:0)+20;
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
function removeOpponentPermanent(opp,key,destination="graveyard"){
  const [kind,indexText]=key.split(":"),index=parseInt(indexText);
  if(kind==="token"&&opp.tokens[index]){
    const [token]=opp.tokens.splice(index,1);
    if(token.kind==="commander"){
      returnCommanderToZone(opp);
      return {name:token.name,ico:token.ico||opp.ico,types:["Legendary","Creature"],destination:"command zone"};
    }
    if(token.kind==="voltron-support"&&token.effect?.includes("mana"))opp.rampInPlay=Math.max(0,opp.rampInPlay-1);
    return recordOpponentPermanentZone(opp,destination,battlefieldGraveyardCard(token));
  }
  if(kind==="gear"&&opp.attachedGear[index]){
    const [gear]=opp.attachedGear.splice(index,1);refreshCommanderGear(opp);
    return recordOpponentPermanentZone(opp,destination,{name:gear.name,ico:"⚙",types:["Artifact","Equipment"],effect:gear.kw||""});
  }
  if(kind==="fastMana"&&opp.explosiveInPlay>0){opp.explosiveInPlay--;return recordOpponentPermanentZone(opp,destination,virtualGraveyardCard("explosive"));}
  if(kind==="land"&&opp.landsInPlay>0){opp.landsInPlay--;return recordOpponentPermanentZone(opp,destination,virtualGraveyardCard("lands"));}
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
function resolvePlayerEffect(effect,draft){
  const targets=effectTargets(gameState,effect,draft.targetId);
  if(targets.length===0)return;
  cmdSnapshot();
  targets.forEach(target=>{
    const name=effectTargetName(target);
    const amount=playerActionAmount(effect,target);
    if(effect.action==="exileGraveyards"){
      const result=moveGraveyardToExile(target);
      if(result.total===0){
        logCommander(`${name}'s graveyard is already empty.`);
      }else{
        const typeSummary=result.moved.length?discardedTypeSummary(result.moved):"Unknown";
        const detail=result.unmaterialized?` Includes ${result.unmaterialized} previously unmaterialized card${result.unmaterialized===1?"":"s"}.`:"";
        logCommander(`${name} exiles ${result.total} graveyard card${result.total===1?"":"s"}. Types: ${typeSummary}.${detail}`);
      }
    }else if(effect.action==="reanimate"){
      const cardIds=(draft.choices[target.id]||[]).slice(0,amount);
      const reanimated=cardIds.map(cardId=>reanimateGraveyardCard(target,cardId)).filter(Boolean);
      if(reanimated.length)logCommander(`You resurrect ${reanimated.map(discardedCardText).join(", ")} from ${name}'s graveyard onto your battlefield.`);
      else logCommander(`${name}'s graveyard has no selected creature cards to resurrect.`);
    }else if(effect.action==="discard"){
      if(target.id==="player"){
        const discardedAmount=Math.min(amount,target.handSize);target.handSize-=discardedAmount;
        const discarded=Array.from({length:discardedAmount},()=>addPlayerGraveyardCard(target,{name:"Unrevealed discarded card",ico:"🃏",types:["Unknown"],virtual:true})).filter(Boolean);
        recordDiscardedCards(target,discarded);
        logCommander(`${name} discards ${discarded.length?discarded.map(discardedCardText).join(", "):"no cards"}. Types: ${discardedTypeSummary(discarded)}. The physical-hand model does not reveal their actual identities.`);
      }else{
        const discarded=discardFromOpponent(target,amount);
        logCommander(`${name} chooses to discard ${discarded.length?discarded.map(discardedCardText).join(", "):"no cards"}.${discarded.length?` Types: ${discardedTypeSummary(discarded)}.`:""}`);
      }
    }else if(effect.action==="mill"){
      if(target.id==="player"){
        const milledAmount=Math.min(amount,target.librarySize);target.librarySize-=milledAmount;
        const milled=Array.from({length:milledAmount},()=>addPlayerGraveyardCard(target,{name:"Unrevealed milled card",ico:"📚",types:["Unknown"],virtual:true})).filter(Boolean);
        logCommander(`${name} mills ${milled.length?milled.map(discardedCardText).join(", "):"no cards"}. Types: ${discardedTypeSummary(milled)}. The physical-library model does not reveal their actual identities.`);
      }else{
        const milled=millOpponent(target,amount);
        logCommander(`${name} mills ${milled.length?milled.map(discardedCardText).join(", "):"no cards"}.${milled.length?` Types: ${discardedTypeSummary(milled)}.`:""}`);
      }
    }else if(effect.action==="draw"){
      if(target.id==="player"){
        const drawnAmount=Math.min(amount,target.librarySize);target.librarySize-=drawnAmount;target.handSize+=drawnAmount;
        logCommander(`${name} draws ${drawnAmount} card${drawnAmount===1?"":"s"}.`);
      }else{
        let drawn=0;for(let i=0;i<amount;i++)if(drawForOpponent(target)!=="none")drawn++;
        logCommander(`${name} draws ${drawn} card${drawn===1?"":"s"}.`);
      }
    }else if(effect.action==="loseLife"||effect.action==="gainLife"){
      const direction=effect.action==="loseLife"?-1:1;target.life=Math.max(0,target.life+(direction*amount));
      logCommander(`${name} ${effect.action==="loseLife"?"loses":"gains"} ${amount} life. (Life → ${target.life})`);
    }else if(target.id==="player"){
      if(effect.action==="exile")target.exileCount+=amount;
      const subject=effect.all?`all ${effect.cardType}s you control`:`${amount} ${effect.cardType} card${amount===1?"":"s"} you control`;
      logCommander(`${effect.action==="exile"?"Exile":"Resolve"} ${subject}.`);
    }else{
      const selections=chooseCpuPermanents(target,effect.cardType,amount).sort((left,right)=>{
        const [leftKind,leftIndex]=left.split(":"),[rightKind,rightIndex]=right.split(":");
        return leftKind===rightKind?parseInt(rightIndex)-parseInt(leftIndex):leftKind.localeCompare(rightKind);
      });
      const destination=effect.action==="exile"?"exile":"graveyard";
      const moved=selections.map(key=>removeOpponentPermanent(target,key,destination)).filter(Boolean);
      const verb={destroy:"destroys",sacrifice:"sacrifices",exile:"exiles"}[effect.action];
      if(moved.length)logCommander(`${name} ${verb} ${moved.map(movementCardText).join(", ")}. Types: ${discardedTypeSummary(moved)}.`);
      else logCommander(`${name} has no ${effect.cardType} to ${effect.action}.`);
    }
  });
  commanderEffectDraft={scope:draft.scope,action:draft.action,count:1,all:false,cardType:draft.cardType,targetId:null,choices:{},creaturesPlayed:draft.creaturesPlayed||0,actionOpen:draft.actionOpen};
  ensureCommanderEffectState(gameState);saveState();showCommanderGame();
}
function isPermanentPlayerAction(effect){return effect.action==="destroy"||effect.action==="sacrifice"||effect.action==="exile";}
async function confirmAndResolvePlayerEffect(effect,draft){
  const targets=effectTargets(gameState,effect,draft.targetId);
  const affectsPlayer=effect.action!=="reanimate"&&effect.action!=="exileGraveyards"&&targets.some(target=>target.id==="player");
  const cpuTargets=targets.filter(target=>target.id!=="player");
  const playerInstruction=affectsPlayer
    ?`Complete your physical action now, then confirm it: ${playerEffectSummary(effect)}`
    :`No physical action is required from you.`;
  const cpuInstruction=effect.action==="reanimate"
    ?"Selected creature cards will be resurrected onto your battlefield under your control."
    :cpuTargets.length
    ?isPermanentPlayerAction(effect)
      ?"Each affected CPU will automatically choose its least valuable eligible permanent."
      :effect.action==="discard"
        ?"Each affected CPU will automatically discard its least valuable card."
        :"CPU state will resolve automatically."
    :"";
  const message=`<strong>${playerEffectSummary(effect)}</strong><br><br>${playerInstruction}${cpuInstruction?`<br><br>${cpuInstruction}`:""}`;
  const confirmed=typeof askConfirm==="function"
    ?await askConfirm("Confirm action resolution",message,affectsPlayer?"I completed my action":"Resolve action")
    :window.confirm(`${playerEffectSummary(effect)}\n\n${playerInstruction}\n${cpuInstruction}`);
  if(!confirmed)return false;
  resolvePlayerEffect(effect,draft);
  logCommander("Action confirmed and resolved.");
  saveState();
  return true;
}

