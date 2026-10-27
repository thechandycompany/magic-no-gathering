/* =====================================================================
   CONTEXTUAL TURN INPUTS
   One inline form tracks only the state changes relevant to the current
   checkpoint. Values are applied together when the checkpoint resolves.
   ===================================================================== */
var turnInput=null;

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

/* ---------- contextual form rendering ---------- */
/* `tip` (optional) adds a helpTip() after the label; `label` stays plain text for aria-labels. */
function numberFieldHtml(key,label,help,max,tip){
  const value=ensureTurnInput()[key]||0;
  const maxAttr=max==null?"":` data-max="${max}"`;
  return `<div class="context-field context-field-${key}">
    <div class="context-field-copy"><strong>${label}${tip?helpTip(tip):""}</strong>${help?`<span>${help}</span>`:""}</div>
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
      ])}${input.slayOutcome==="dies"?numberFieldHtml("slayToughness","Destroyed creature's toughness","",null,"Added to the enemy's loyalty."):""}</div>`;
    }else{
      const label=S.pendingDecl==="conclaveWipe"?"Prismatic Ruin":"Overrun the Weak";
      actionHtml=`<div class="context-section"><div class="context-section-title">${label}</div>${outcomeChoiceHtml("wipeOutcome",[
        {value:"wiped",label:"Resolve the board clear"},{value:"protected",label:"I protected my board"}
      ])}${input.wipeOutcome==="wiped"?numberFieldHtml("wipeSurvivors","Your creatures that survive","Defaults to zero.",S.player.creatures):""}</div>`;
    }
    html+=responseStepHtml(step++,"effect","Resolve enemy effect","",actionHtml,"enemy-effect");
  }

  if(input.allowEnemyDeaths){
    const selectedCount=selectedEnemyDeathIndices().length;
    const blockedCount=input.blockedCreatures?input.blockedCreatures.size:0;
    let noteText="";
    if(selectedCount||blockedCount){
      const parts=[];
      if(selectedCount)parts.push(`${selectedCount} dying`);
      if(blockedCount)parts.push(`${blockedCount} blocked`);
      noteText=`${parts.join(" · ")} · remaining attack ${remainingPower}`;
    }else{noteText="Select creatures above to block or remove them.";}
    const removalHtml=casualtyFieldHtml("Combat interactions","Select creatures above.")+`<div class="resolution-note">${noteText}</div>`;
    html+=responseStepHtml(step++,"remove","Block or remove creatures","",removalHtml,"precombat-removal");
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
      if(commanderPower>0)combatHtml+=numberFieldHtml("commanderDamage","Commander damage reaching you",`Only unblocked damage from ${enemyName()} counts.`,Math.min(commanderPower,input.incomingDamage),"21 combat damage from a single commander defeats you, whatever your life total.");
      combatHtml+=numberFieldHtml("playerDeaths","Your creatures that died","Reduces your creature total.",S.player.creatures);
    }else{
      combatHtml=`<div class="context-summary"><span class="context-summary-icon">✓</span><div><strong>No attackers remain</strong><span>Combat deals no damage.</span></div></div>`;
    }
    html+=responseStepHtml(step++,"combat","Resolve combat","",combatHtml,"enemy-combat");
  }else if(!hasActionEffect){
    html+=responseStepHtml(step++,"combat","Combat","","<div class=\"context-summary\"><span class=\"context-summary-icon\">✓</span><div><strong>No attack this turn</strong><span>Continue when ready.</span></div></div>","enemy-combat");
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
    html+=`<div class="context-summary draw-summary"><span class="context-summary-icon">🃏</span><div><strong>Resolve upkeep, then draw</strong><span>Continue once you have drawn.</span></div></div>`;
    const changes=numberFieldHtml("creaturesPlayed","Creatures added","Flash, tokens, or returned creatures.")+(input.allowEnemyDeaths?casualtyFieldHtml("Enemy creatures removed","Select creatures above."):"");
    html+=disclosureHtml("Record board changes",changes);
  }else if(timing.isMainPhase){
    html+=numberFieldHtml("creaturesPlayed","Creatures added","Cast, created, or returned.");
    if(input.allowEnemyDeaths)html+=casualtyFieldHtml("Enemy creatures removed","Select creatures above.");
  }else if(timing.isCombat){
    html+=`<div class="context-summary combat-summary"><span class="context-summary-icon">⚔️</span><div><strong>Final combat result</strong><span>Enter the outcome.</span></div></div>`;
    html+=numberFieldHtml("damageToEnemy",`Damage dealt to ${resource}`,"Damage that reached the enemy resource.",null,modeConfig().resource==="Loyalty"?"Loyalty is the enemy's life total. Reduce it to 0 to win.":"");
    if(S.mode==="voltron")html+=numberFieldHtml("commanderDamageToEnemy","Commander damage to Rukha","Unblocked damage from your commander (toward 21).",input.damageToEnemy||undefined);
    html+=numberFieldHtml("playerDeaths","Your creatures that died","Reduces your creature total.",S.player.creatures);
    if(input.allowEnemyDeaths)html+=casualtyFieldHtml("Enemy creatures that died","Select creatures above.");
    html+=disclosureHtml("More combat changes",numberFieldHtml("creaturesPlayed","Creatures added","Flash, tokens, or returned creatures."));
  }else{
    html+=`<div class="context-summary"><span class="context-summary-icon">✓</span><div><strong>No input needed</strong><span>Continue when ready.</span></div></div>`;
  }
  html+='</div>';
  document.getElementById('respTitle').textContent=timing.isCombat?"Combat result":timing.isMainPhase?"Board changes":(S.playerStep===TURN_STEPS.UPKEEP||S.playerStep===TURN_STEPS.DRAW)?"Upkeep + Draw":"Current step";
  document.getElementById('respGrid').innerHTML=html;
  document.getElementById('respHint').textContent=input.allowEnemyDeaths?"Select creatures above to remove them.":"";
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
    const max=field.max===""?null:parseInt(field.max,10);
    field.onchange=()=>{
      clampTurnInput(field.dataset.numberKey,field.value,max);
      field.value=ensureTurnInput()[field.dataset.numberKey];
      refreshTurnPreview();
    };
    // Keep the outcome pill and step chips live while typing (value is normalised on change)
    field.oninput=()=>{
      if(field.value==="")return;
      clampTurnInput(field.dataset.numberKey,field.value,max);
      refreshTurnPreview();
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
  refreshTurnPreview();
}

/* ---------- outcome preview + step status ---------- */
function previewParts(parts){return parts.filter(Boolean).join(" · ");}
/* Damage the enemy turn will actually deal with the current entries (mirrors resolveEnemyTurnInputs). */
function projectedEnemyTurnDamage(input){
  const remaining=projectedEnemyAttackPower(input);
  const damage=Math.min(input.incomingDamage||0,remaining);
  const commander=S.mode==="voltron"?Math.min(input.commanderDamage||0,damage,projectedCommanderDamagePower(input)):0;
  return {remaining,damage,commander};
}
/* Short outcome text for the main button: "Take 7 (6 cmdr)", "Deal 5 · Remove 1", "+1 creature". */
function turnPreviewText(){
  if(!S||!turnInput)return "";
  const input=turnInput;
  const removed=selectedEnemyDeathIndices().length;
  const added=input.creaturesPlayed>0?`+${plural(input.creaturesPlayed,"creature")}`:"";
  if(S.phase==="garruk"){
    const {damage,commander}=projectedEnemyTurnDamage(input);
    return previewParts([removed&&`Remove ${removed}`,`Take ${damage}${commander>0?` (${commander} cmdr)`:""}`,added]);
  }
  const timing=currentTimingInfo();
  const remove=input.allowEnemyDeaths&&removed?`Remove ${removed}`:"";
  if(timing.isCombat)return previewParts([input.damageToEnemy>0&&`Deal ${input.damageToEnemy}`,remove,input.playerDeaths>0&&`Lose ${plural(input.playerDeaths,"creature")}`,added]);
  return previewParts([added,remove]);
}
function refreshEnemyStepStatus(){
  const panel=document.getElementById('respGrid');
  if(!panel||!turnInput)return;
  const input=turnInput;
  if(S.pendingDecl==="slay"){
    const protectedIt=input.slayOutcome==="protected";
    setStepStatus(panel,"effect",protectedIt?"Protected":`Dies · +${input.slayToughness} loyalty`,protectedIt||input.slayToughness!==1);
  }else if(S.pendingDecl==="wipe"||S.pendingDecl==="conclaveWipe"){
    const protectedIt=input.wipeOutcome==="protected";
    setStepStatus(panel,"effect",protectedIt?"Protected":`${input.wipeSurvivors} survive`,protectedIt||input.wipeSurvivors>0);
  }
  const dying=selectedEnemyDeathIndices().length,blocked=input.blockedCreatures?input.blockedCreatures.size:0;
  setStepStatus(panel,"remove",previewParts([dying&&`${dying} dying`,blocked&&`${blocked} blocked`]),dying+blocked>0);
  if(S.tokens.some(token=>token.attacking)){
    const {damage}=projectedEnemyTurnDamage(input);
    setStepStatus(panel,"combat",`Take ${damage}`,!input.incomingDamageAuto||!input.commanderDamageAuto&&S.mode==="voltron"||input.playerDeaths>0);
  }else{
    setStepStatus(panel,"combat","No attack",false);
  }
}
function refreshTurnPreview(){
  if(!S)return;
  if(S.phase==="garruk")refreshEnemyStepStatus();
  const el=document.querySelector('#endTurnBtn .cmd-preview');
  if(!el)return;
  const text=turnPreviewText();
  el.textContent=text;
  el.hidden=!text;
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
      logP(`${label} resolves — ${input.wipeSurvivors} of your creatures survive.`);
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
      logP(`${input.playerDeaths} of your creatures died in combat.`);
    }
  }else if(S.attackPower>0){
    logP("No enemy attackers remain, so combat deals no damage.");
  }
  if(input.creaturesPlayed>0){
    adjust("creatures",input.creaturesPlayed);
    logP(`You add ${plural(input.creaturesPlayed,"creature")} to your board during the enemy turn.`);
  }
}
function resolvePlayerTurnInputs(input){
  const timing=currentTimingInfo();
  if(input.creaturesPlayed>0){
    adjust("creatures",input.creaturesPlayed);
    logP(`You add ${plural(input.creaturesPlayed,"creature")} to your board.`);
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
      logP(`${input.playerDeaths} of your creatures die in combat.`);
    }
    applyEnemyCasualties("in combat");
  }else if(timing.isMainPhase){
    applyEnemyCasualties(`during ${timing.stepLabel}`);
  }else if(timing.canCastInstant){
    applyEnemyCasualties(`during ${timing.stepLabel}`);
  }
}
