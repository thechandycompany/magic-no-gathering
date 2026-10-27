/* =====================================================================
   ai-adventure.js — Adventure mode AI and turn-flow logic
   Extracted from game.js. Loaded via <script> tag after phases.js.
   All referenced globals (S, gameOver, turnInput, TURN_PHASES, etc.)
   are available at runtime from earlier script loads.
   ===================================================================== */

function hardGarrukEmergencyDecision(st,p,tokens,readyPower){
  var boardDeficit=p.creatures-tokens;
  var afterSlay=st.loyalty-10;
  var afterWipe=st.loyalty-25;
  var severelyOverwhelmed=p.creatures>=5||boardDeficit>=3;
  var clearlyBehind=p.creatures>=3&&boardDeficit>=2;
  var slightlyBehind=p.creatures>=2&&boardDeficit>=1;
  var recentHit=st.lastPlayerDamage||0;

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
  var st=S,p=st.player,tokens=st.tokens.length;
  var readyPower=readyPowerTotal();
  st.enraged=st.loyalty<=8;
  S.aiReason="";

  // Hard Garruk can abandon its normal go-wide plan to equalize a losing board.
  if(S.mode==="hard"){
    var emergency=hardGarrukEmergencyDecision(st,p,tokens,readyPower);
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

  var loyaltyAfterSlay=st.loyalty-10;
  var primarySlayFloor=S.mode==="hard"?10:8;
  var secondarySlayFloor=S.mode==="hard"?8:6;
  if(loyaltyAfterSlay>=primarySlayFloor&&p.creatures>=2&&tokens>=3){
    S.aiReason="The pack is established, so Garruk can safely spend loyalty on the best opposing creature.";
    return "slay";
  }
  if(loyaltyAfterSlay>=secondarySlayFloor&&p.creatures>=1&&tokens>=4){
    S.aiReason="A wide pack lets Garruk remove a key blocker while preserving a loyalty buffer.";
    return "slay";
  }

  var unbuffed=st.tokens.filter(t=>!t.kws.includes("Deathtouch"));
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
    var size=S.mode==="hard"&&S.turn>=5?4:2;
    logG(`summons a ${size}/${size} Wolf. [0]`);
  }
  else if(id==="buff"){buffRandomWolf();gainLoyalty(4);logG("empowers a creature: +1/+0 & deathtouch. Loyalty +4. [+4]");}
  else if(id==="slay"){S.loyalty=Math.max(0,S.loyalty-10);logG(`uses Slay, targeting ${S.slayTarget}. [-10]`);}
  else if(id==="wipe"){S.loyalty=Math.max(0,S.loyalty-25);logG("unleashes Overrun the Weak! [-25]");}
  render();
}

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
  var loyaltyGain=S.mode==="hard"?2+Math.min(4,Math.floor((S.turn-1)/2)):2;
  gainLoyalty(loyaltyGain);
  logG(`gains ${loyaltyGain} loyalty at the start of turn. Loyalty → ${S.loyalty}.`);
  var id=garrukDecide();
  S.pendingDecl=id; S.slayTarget=id==="slay"?garrukSlayTarget():null;
  resolveGarrukAction(id);
  declareAttackers();
  S.attackPower=totalPower();
  var d=ABILITIES[id];
  S.declFlavor=d.flavor[Math.floor(Math.random()*d.flavor.length)];
  var size=S.mode==="hard"&&S.turn>=5?"4/4":"2/2";
  var abilityDetail=id==="wolf"?`${S.declFlavor} Put a ${size} Wolf token onto the battlefield.`:S.declFlavor+" "+d.mech+(id==="slay"?` Target: ${S.slayTarget}.`:"");
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
  var wave=Math.min(4,1+Math.floor((S.turn-1)/2));
  var spawned=[];
  for(var i=0;i<wave&&S.loyalty>0;i++){
    var unit=addHordeUnit(); spawned.push(`${unit.name} ${unit.p}/${unit.t}`); S.loyalty=Math.max(0,S.loyalty-1);
  }
  S.actionSteps=[{label:`Reveal wave ${S.turn}`,detail:spawned.length?`The Horde reveals ${plural(spawned.length,"creature")}: ${spawned.join(", ")}. Each reveal mills one card from the Horde deck.`:"The Horde deck is empty; destroy the remaining creatures to win."}];
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
  var unit=nextConclaveUnit();
  S.actionSteps=[];
  if(unit){
    S.actionSteps.push({label:`Summon ${unit.name}`,detail:`${unit.p}/${unit.t} — ${unit.effect}${unit.haste?" It attacks immediately.":""}`});
    logG(`summons ${unit.name} (${unit.p}/${unit.t}).`);
  }else{
    S.actionSteps.push({label:"Roster complete",detail:"Every unique Conclave creature is already on the battlefield."});
  }
  var allies=S.tokens.filter(t=>t.kind==="synergy");
  if(S.player.creatures>=4&&S.turn%4===0){
    S.pendingDecl="conclaveWipe";
    S.actionSteps.push({label:"Vaelora casts Prismatic Ruin",detail:"Destroy all player creatures. Record how many survive through protection; if you do nothing, none survive."});
  }else if(allies.length>=3&&S.turn%2===0){
    S.conclaveAscension=Math.min(2,(S.conclaveAscension||0)+1);
    S.actionSteps.push({label:"Conclave Ascension",detail:`Vaelora resonates with the network. Conclave creatures permanently get +${S.conclaveAscension}/+${S.conclaveAscension}.`});
  }else{
    var auraBearers=allies.filter(t=>["kael","nyra","thalen","mirael"].includes(t.unitId)).length;
    if(allies.some(t=>t.unitId==="elyra")&&auraBearers>0){
      gainLoyalty(auraBearers);
      S.actionSteps.push({label:"Elyra's Resonance",detail:`Vaelora gains ${auraBearers} resolve from active aura bearers.`});
    }else{
      S.actionSteps.push({label:"Weave the network",detail:"Active named creatures share their printed auras and threshold abilities."});
    }
  }
  var lockUnit=allies.find(t=>CONCLAVE_UNITS.find(u=>u.id===t.unitId)?.lock);
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
  var actions=[];

  // --- DRAW PHASE ---
  if(S.turn>1){
    var drawn=drawVoltronCard();
    var drawDetail;
    if(drawn==="none")drawDetail="The virtual deck is empty.";
    else if(drawn==="other"){
      var typedCard=drawTypedVoltronCard();
      drawDetail=typedCard?`Rukha draws ${typedCard.name} (${typedCard.ref?.category}).`:"Rukha draws a spell.";
    }else{
      drawDetail=`Rukha draws a ${drawn==="lands"?"land":drawn==="ramp"?"ramp source":"fast-mana rock"}.`;
    }
    actions.push({label:"Draw",detail:drawDetail});
  }else{
    // Opening hand: draw typed cards for the "other" slots in the opening hand
    for(var i=0;i<S.voltronHand.other;i++)drawTypedVoltronCard();
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
  var commander=voltronCommander();
  if(!commander){
    var cost=voltronCommanderCost();
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
    var gearInHand=S.voltronTypedHand.filter(c=>c.ref?.category==="gear");
    var bestGear=gearInHand.filter(c=>(c.cost+(c.equip||0))<=S.voltronMana).sort((a,b)=>(b.bonus/(b.cost+(b.equip||0)))-(a.bonus/(a.cost+(a.equip||0))))[0];
    if(bestGear){
      var totalGearCost=bestGear.cost+(bestGear.equip||0);
      S.voltronMana-=totalGearCost;
      var bonus=bestGear.bonus||2;
      commander.baseP+=bonus;commander.baseT+=bonus;commander.p=commander.baseP;commander.t=commander.baseT;
      S.voltronGear=(S.voltronGear||0)+1;
      if(bestGear.kw&&!commander.kws.includes(bestGear.kw))commander.kws.push(bestGear.kw);
      commander.effect=`Commander — ${S.voltronGear} gear; ${commander.kws.join(", ").toLowerCase()}.`;
      var gearIdx=S.voltronTypedHand.indexOf(bestGear);
      if(gearIdx>=0)S.voltronTypedHand.splice(gearIdx,1);
      actions.push({label:`Cast + equip ${bestGear.name} (${bestGear.cost}+${bestGear.equip||0} mana)`,detail:`${bestGear.effect}. Now ${tokenPower(commander)}/${tokenToughness(commander)}.`});
      logG(`equips ${bestGear.name}; now ${tokenPower(commander)}/${tokenToughness(commander)}.`);
    }
  }

  // --- SECONDARY ACTIONS: spend remaining mana on support cards (max 1 per turn) ---
  if(S.voltronMana>0&&S.voltronTypedHand.length>0){
    var supportActions=voltronCastSupportCards(S.voltronMana,!!voltronCommander(),1);
    actions.push(...supportActions);
  }

  // --- HOLD STATUS ---
  if(actions.length<=2){
    var reason=S.voltronMana<1?"no mana remaining":"no castable cards in hand";
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
  var attackers=S.tokens.filter(t=>t.attacking);
  var holdingBack=S.tokens.filter(t=>!t.summoningSick&&!t.attacking);
  if(S.attackPower>0){
    var names=attackers.map(t=>`${t.name} (${tokenPower(t)}/${tokenToughness(t)})`).join(", ");
    var detail=`Attacking: ${names}.`;
    if(holdingBack.length>0){
      var heldNames=holdingBack.map(t=>t.name).join(", ");
      detail+=` Holding back: ${heldNames}.`;
    }
    S.actionSteps.push({label:`Attack with ${plural(attackers.length,"creature")} for ${S.attackPower}`,detail});
  }else if(S.tokens.some(t=>t.summoningSick)){
    S.actionSteps.push({label:"Creatures held back",detail:"Newly summoned creatures without haste have summoning sickness."});
  }else if(holdingBack.length>0){
    S.actionSteps.push({label:"No attack declared",detail:`${plural(holdingBack.length,"creature")} held back to defend.`});
  }
}

/* --- Engine-to-UI bridge: accesses DOM directly --- */
function showGarrukTurn(){
  S.phase="garruk";
  var decl=document.getElementById('declare');
  decl.className="declare garruk compact-declare";
  var actionCount=(S.actionSteps||[]).length;
  var attackerCount=S.tokens.filter(t=>t.attacking).length;
  document.getElementById('declareTitle').textContent=`${actionCount} enemy action${actionCount===1?"":"s"}`;
  document.getElementById('declareFlavor').textContent=S.attackPower>0?`${attackerCount} attacker${attackerCount===1?"":"s"} · ${S.attackPower} incoming power`:"No incoming combat damage";
  document.getElementById('declareMech').innerHTML=`<button type="button" class="detail-link" id="enemyActionsBtn">Review actions</button>`;
  document.getElementById('enemyActionsBtn').onclick=showEnemyActions;
  document.getElementById('huntTitle').textContent=`${enemyName()}'s Turn`;
  var btn=document.getElementById('endTurnBtn');btn.className="endturn garruk";btn.textContent="Resolve Enemy Turn ▸";
  document.getElementById('quickEndBtn').hidden=true;
  setBanner("garruk");render();renderContextualInputs();renderPhaseBar();checkEnd();
}

/* --- Engine-to-UI bridge: accesses DOM directly --- */
function showPlayerTurn(){
  S.phase="player";
  var cfg=modeConfig();
  var timing=currentTimingInfo();
  var decl=document.getElementById('declare');decl.className="declare player compact-declare";
  document.getElementById('declareTitle').textContent="Objective";
  document.getElementById('declareFlavor').textContent=`Defeat ${cfg.enemy} · ${S.loyalty} ${cfg.resource.toLowerCase()} remaining`;
  var mech="";
  if(S.spellLock)mech+=`<span class="lock-note">\u{1F512} ${S.spellLock}</span>`;
  if(S.tokens.length>0 && timing.isCombat){
    var potentialBlockers=S.tokens.filter(t=>!t.attacking&&!t.summoningSick);
    var blockToughness=potentialBlockers.reduce((a,t)=>a+tokenToughness(t),0);
    var deathTouchers=potentialBlockers.filter(t=>t.kws.includes("Deathtouch")).length;
    var tappedCount=S.tokens.filter(t=>t.attacking).length;
    mech+=`<span class="combat-outlook">${potentialBlockers.length} blocker${potentialBlockers.length===1?"":"s"} · ${blockToughness} toughness${deathTouchers?` · ${deathTouchers} deathtouch`:""}${tappedCount?` · ${tappedCount} tapped out`:""}</span>`;
  }else if(S.tokens.length===0 && timing.isCombat){
    mech+=`<span class="combat-outlook clear">No blockers</span>`;
  }
  document.getElementById('declareMech').innerHTML=mech;
  document.getElementById('huntTitle').textContent=`Your Turn · ${timing.stepLabel}`;
  var btn=document.getElementById('endTurnBtn');
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
  var quickEnd=document.getElementById('quickEndBtn');
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

function advanceToNextActionableStep(){
  while(S.playerStepIndex < PLAYER_TURN_SEQUENCE.length){
    var entry=PLAYER_TURN_SEQUENCE[S.playerStepIndex];
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

function jumpToStep(targetStep){
  var idx=PLAYER_TURN_SEQUENCE.findIndex(e=>e.step===targetStep);
  if(idx===-1) return false;
  S.playerStepIndex=idx;
  S.playerStep=PLAYER_TURN_SEQUENCE[idx].step;
  S.playerPhase=PLAYER_TURN_SEQUENCE[idx].phase;
  // Check if the CPU reacts at the step we jumped to
  checkCpuReactionAtStep();
  return true;
}

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

/* =====================================================================
   CPU OPPONENT REACTIONS
   ===================================================================== */

function cpuReaction(){
  // CPU can only react when the player has priority and it's the player's turn
  if(S.phase!=="player") return null;
  var timing=currentTimingInfo();
  if(!timing.opponentCanRespond) return null;

  // The opponent is the non-active player — they can only use instant-speed effects
  var canAct=canCastAtTiming("instant", S.playerStep, false);
  if(!canAct) return null;

  var reaction=evaluateCpuResponse();
  if(!reaction) return null;

  // Tag the reaction with timing metadata
  reaction.phase=S.playerPhase;
  reaction.step=S.playerStep;
  reaction.stepLabel=timing.stepLabel;
  reaction.legal=true; // validated above
  reaction.timing="instant"; // CPU can only use instant-speed on opponent's turn
  return reaction;
}

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

function evaluateGarrukReaction(){
  // Garruk reacts during combat if the incoming damage would be lethal
  // and he has enough loyalty for tricks
  if(S.playerStep===TURN_STEPS.COMBAT){
    if(S.loyalty<=8 && S.tokens.length>0 && S.player.creatures>=3){
      // Garruk could buff a blocker as a combat trick
      var unbuffed=S.tokens.filter(t=>!t.kws.includes("Deathtouch"));
      if(unbuffed.length>0){
        return {
          type:"ability",
          description:`${enemyName()} activates a combat trick — a creature gains deathtouch until end of turn.`,
          apply:()=>{
            var target=unbuffed[0];
            if(!target.kws.includes("Deathtouch")) target.kws.push("Deathtouch");
            logG(`reacts with a combat trick: a ${target.name} gains deathtouch. [${STEP_LABELS[S.playerStep]}]`);
            render();
          }
        };
      }
    }
  }
  return null;
}

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

function checkCpuReactionAtStep(){
  var reaction=cpuReaction();
  if(!reaction) return false;

  // Apply the reaction
  reaction.apply();
  // Log with phase context is handled inside apply()
  return true;
}

/* =====================================================================
   RESOLVE TURN / END GAME
   ===================================================================== */

function resolveTurn(){
  if(!S)return;
  snapshot();
  var isEnemyTurn=S.phase==="garruk";
  var input=ensureTurnInput();

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
  var timing=currentTimingInfo();

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

  var turnEnded=advancePlayerStep();
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
  var input=ensureTurnInput();
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

function checkPhase(){
  if(S.mode!=="vanilla"&&S.mode!=="hard"){S.enraged=false;return;}
  var was=S.enraged;S.enraged=S.loyalty<=8&&S.loyalty>0;
  if(S.enraged&&!was)logBig(`${enemyName()} enters an ENRAGED phase!`);
}

function checkEnd(){
  var won=S.mode==="horde"?S.loyalty<=0&&S.tokens.length===0:S.loyalty<=0;
  if(won){endGame(true);return true;}
  if(S.mode==="voltron"&&S.commanderDamageToEnemy>=21){endGame(true,"Your commander dealt 21 commander damage to "+enemyName()+".");return true;}
  if(S.mode==="voltron"&&S.commanderDamage>=21){endGame(false,`${enemyName()} dealt 21 commander damage.`);return true;}
  if(S.player.life<=0){endGame(false,"Your life total hit 0.");return true;}
  return false;
}

/* --- Engine-to-UI bridge: accesses DOM directly --- */
function endGame(won,reason){
  if(gameOver)return;gameOver=true;save();
  var m=document.getElementById('modal'),o=document.getElementById('overlay'),cfg=modeConfig();
  if(won){
    var victory=reason||( S.mode==="horde"?"The final corpse falls and the Horde deck is empty.":`${cfg.enemy}'s ${cfg.resource.toLowerCase()} reaches 0.`);
    m.className="modal";m.innerHTML=`<div class="big-ico">\u{1F3C6}</div><h2>Victory!</h2><p>${victory}<br>You survived <b>${S.turn}</b> turns of ${cfg.name}.</p><button class="cta" onclick="restart()">Choose Another Encounter</button>`;
  }else{
    m.className="modal lose";m.innerHTML=`<div class="big-ico">\u{1F480}</div><h2>Defeated</h2><p>${reason||`${cfg.enemy} defeated you.`}<br><br>${cfg.resource} remaining: <b>${S.loyalty}</b>.</p><button class="cta" onclick="restart()">Try Another Encounter</button>`;
  }
  o.classList.add("show");
}
