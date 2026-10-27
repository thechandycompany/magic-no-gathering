/* ---------- toast ---------- */
var toastT;
function toast(msg){
  let el=document.getElementById('toast');
  if(!el){ el=document.createElement('div'); el.id='toast'; el.setAttribute('role','status'); el.setAttribute('aria-live','polite'); el.style.cssText="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e1810;border:1px solid var(--gold-dim);color:var(--gold);padding:10px 18px;border-radius:8px;z-index:99;font-size:13px;box-shadow:0 6px 20px rgba(0,0,0,.5);transition:opacity .3s;"; document.body.appendChild(el); }
  el.textContent=msg; el.style.opacity="1"; clearTimeout(toastT); toastT=setTimeout(()=>el.style.opacity="0",1800);
}

/* =====================================================================
   SHARED CARD REFERENCES
   ===================================================================== */
function escapeCardReferenceHtml(value){
  return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[char]);
}
function cardReferenceType(card){
  if(card?.type)return card.type;
  if(Array.isArray(card?.types)&&card.types.length)return card.types.join(" · ");
  const category=card?.ref?.category||card?.category;
  if(card?.kind==="commander")return "Legendary Creature — Commander";
  if(category==="gear")return "Artifact — Equipment";
  if(category==="creatures"||card?.isCreature||card?.rampValue)return "Creature";
  if(category==="lands")return "Land";
  if(category==="explosive")return "Artifact";
  if(category==="utility")return "Enchantment";
  if(category==="protection")return "Instant";
  if(category==="draw"||category==="haymakers"||category==="boardwipes")return "Sorcery";
  if(card?.equip!=null||card?.bonus!=null)return "Artifact — Equipment";
  if(card?.p!=null&&card?.t!=null)return "Creature";
  if(card?.loyalty!=null)return "PW";
  return "Permanent";
}
function cardReferenceHtml(card,options={}){
  if(!card)return "";
  const type=cardReferenceType(card);
  const commander=card.kind==="commander"||/commander/i.test(type);
  const classes=["card","card-reference",options.className||"",commander?"commander":"",/artifact/i.test(type)?"artifact":"",/land/i.test(type)?"land":"",/\bpw\b|planeswalker/i.test(type)?"pw-card":""].filter(Boolean).join(" ");
  const name=escapeCardReferenceHtml(card.name||"Unnamed card");
  const icon=escapeCardReferenceHtml(card.ico||card.icon||(commander?"⚜":/artifact/i.test(type)?"⚙":/land/i.test(type)?"🌲":/\bpw\b|planeswalker/i.test(type)?"⬡":"🃏"));
  const keywords=(card.baseKws||card.kws||[]).filter(Boolean).join(" · ");
  const hasStats=card.p!=null&&card.t!=null;
  const statText=hasStats?`${escapeCardReferenceHtml(card.p)}/${escapeCardReferenceHtml(card.t)}`:card.loyalty!=null?`L ${escapeCardReferenceHtml(card.loyalty)}`:"";
  const details=[type,card.effect].filter(Boolean).join(" · ");
  return `<span class="${classes}" title="${escapeCardReferenceHtml(details)}" aria-label="${name}${details?`: ${escapeCardReferenceHtml(details)}`:""}">
    <span class="c-name"><span>${name}</span><span class="mana">${commander?"⚜":/artifact/i.test(type)?"⚙":/land/i.test(type)?"◇":/\bpw\b|planeswalker/i.test(type)?"⬡":"✦"}</span></span>
    <span class="c-art">${icon}</span>
    <span class="c-type">${escapeCardReferenceHtml(type)}</span>
    ${keywords?`<span class="c-kw">${escapeCardReferenceHtml(keywords)}</span>`:""}
    ${card.effect?`<span class="c-effect">${escapeCardReferenceHtml(card.effect)}</span>`:""}
    ${statText?`<span class="c-pt">${statText}</span>`:""}
  </span>`;
}
function cardReferenceListHtml(cards,className=""){
  const entries=(cards||[]).filter(Boolean);
  return entries.length?`<span class="card-reference-list ${className}">${entries.map(card=>cardReferenceHtml(card)).join("")}</span>`:"";
}

/* =====================================================================
   RENDER
   ===================================================================== */
function modeHelpHtml(){
  if(S.mode==="voltron")return `<div class="tt-header">🔥 ${modeDisplayName()}</div><div class="tt-passive"><span class="tt-cost tt-free">40 life</span> Rukha is a Commander opponent. Reduce her life to 0, while avoiding a 21 commander-damage defeat.</div><div class="tt-ability"><b>Finite mana deck</b><br>Rukha uses a virtual 99-card deck with 37 lands, 10 normal ramp sources, and 1 rare fast-mana rock. Drawn sources leave the deck and only become mana after they are played.</div><div class="tt-ability"><b>Command zone</b><br>Rukha is cast once her drawn mana sources reach her current cost. When she leaves the battlefield, she returns to the command zone and her next cast costs 2 more.</div><div class="tt-ability"><b>Voltron plan</b><br>With spare mana, Rukha adds gear for permanent power, toughness, trample, and later ward.</div><div class="tt-note">Remove Rukha before combat to stop the attack. If commander damage gets through, record only the unblocked portion.</div>`;
  if(S.mode==="hard")return `<div class="tt-header">🔥 ${modeDisplayName()}</div><div class="tt-passive"><span class="tt-cost tt-free">Scaling</span> Loyalty income increases every two turns: +2, +3, +4, up to +6.</div><div class="tt-ability"><span class="tt-cost">[0]</span><b>Summon Wolf</b><br>2/2 through turn 4; every new Wolf is 4/4 from turn 5 onward.</div><div class="tt-ability"><span class="tt-cost tt-gain">[+4]</span><b>Rip and Tear</b><br>+1/+0, deathtouch, and +4 loyalty.</div><div class="tt-note">Ulvar normally goes wide, but Hard mode checks board deficits first. With enough loyalty it uses Slay while keeping 8–10 loyalty, or Overrun while keeping at least 8.</div>`;
  if(S.mode==="horde")return `<div class="tt-header">☠️ Horde Mode</div><div class="tt-passive"><span class="tt-cost tt-free">60 cards</span> Each revealed creature and each damage dealt to the Horde mills its deck.</div><div class="tt-ability"><b>Automatic waves</b><br>Wave size grows every two turns. Horde creatures have haste and attack each turn.</div><div class="tt-ability"><b>Events</b><br>Grave Frenzy boosts attacks; Dread Edict forces a sacrifice.</div><div class="tt-note">You win only when the Horde deck is empty and no Horde creatures remain.</div>`;
  if(S.mode==="conclave")return `<div class="tt-header">✦ ${modeDisplayName()}</div><div class="tt-passive"><span class="tt-cost tt-free">Random roster</span> Unique named creatures enter in a different order each game.</div><div class="tt-ability"><b>Shared network</b><br>War Song, Bulwark, ward, spell locks, and threshold bonuses disappear when their key creature dies.</div><div class="tt-ability"><b>Vaelora</b><br>Builds Ascension at 3+ allies and casts Prismatic Ruin against wide player boards.</div><div class="tt-note">Identify and remove the key creature holding each synergy together.</div>`;
  return `<div class="tt-header">🐺 ${modeDisplayName()}</div><div class="tt-passive"><span class="tt-cost tt-free">Passive</span> +2 loyalty at the start of each turn.</div><div class="tt-ability"><span class="tt-cost">[0]</span><b>Summon Wolf</b><br>Put a 2/2 Wolf onto the battlefield.</div><div class="tt-ability"><span class="tt-cost tt-gain">[+4]</span><b>Rip and Tear</b><br>+1/+0, deathtouch, and +4 loyalty.</div><div class="tt-ability"><span class="tt-cost tt-spend">[-10]</span><b>Slay</b> — destroy a creature.</div><div class="tt-ability"><span class="tt-cost tt-spend">[-25]</span><b>Reckoning of the Wild</b> — clear the player's board.</div><div class="tt-note">Baseline encounter: Wolves remain 2/2 for the entire game.</div>`;
}
function updateModePresentation(){
  const cfg=modeConfig();
  document.getElementById('brandTitle').textContent=GAME_TITLE;
  document.getElementById('brandSub').textContent=modeDisplayName(cfg);
  document.getElementById('modePill').textContent=modeDisplayName(cfg);
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
  document.getElementById('phasePill').textContent=S.phase==="enemy"?`${enemyName()}'s Turn`:"Your Turn";
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
  if(sickCount)atkText+=`${atkText?" · ":""}${sickCount} summoning sick`+helpTip("Creatures can't attack the turn they enter unless they have haste.");
  document.getElementById('atkNote').innerHTML=atkText;
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
      <button type="button" class="c-remove" title="Remove ${t.name} from the battlefield" aria-label="Remove ${t.name}">✕<span class="c-remove-label"> Remove</span></button>`;
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
    const ok=await askConfirm(`Return ${token.name} to the command zone?`,`<strong>${token.name}</strong> leaves the battlefield and goes back to the command zone. Its equipment falls off and recasting costs more.`,"Return to zone","Cancel");
    if(!ok)return;
    snapshot();
    const outcome=removeEnemyBattlefieldToken(i);if(!outcome){undoStack.pop();updateUndoBtn();return;}
    reindexSelectedCasualties(i);
    logP(outcome.commanderReturn);
    render();
    if(turnInput){
      const timing=S.phase==="player"?currentTimingInfo():null;
      turnInput.allowEnemyDeaths=S.tokens.length>0&&(S.phase==="enemy"||timing.canCastInstant);
      syncIncomingDamageToAttack();
      renderContextualInputs();
    }
    checkEnd();
    return;
  }

  // Ask where the card goes
  const dest=await askRemovalDestination(token);
  if(!dest)return; // cancelled

  snapshot();
  const outcome=removeEnemyBattlefieldToken(i);if(!outcome){undoStack.pop();updateUndoBtn();return;}
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
    turnInput.allowEnemyDeaths=S.tokens.length>0&&(S.phase==="enemy"||timing.canCastInstant);
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

function setBanner(who){
  const b=document.getElementById('turnBanner');if(!b)return;
  if(who==="player"){
    const timing=currentTimingInfo();
    b.className="turn-banner player sr-only";document.getElementById('tbIco').textContent="🗡️";
    document.getElementById('tbText').textContent=`Your Turn (Turn ${S.turn})`;
    document.getElementById('tbSub').textContent=`— ${timing.stepLabel}`;
  }else{
    b.className="turn-banner garruk sr-only";document.getElementById('tbIco').textContent=modeConfig().icon;
    document.getElementById('tbText').textContent=`${enemyName()}'s Turn (Turn ${S.turn})`;document.getElementById('tbSub').textContent="— respond, then Resolve Enemy Turn";
  }
}

/* Small "?" help marker with a hover/focus tooltip. Use only where a term needs explaining. */
function helpTip(text){
  const safe=String(text).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
  return `<span class="help-tip" tabindex="0" role="note" aria-label="${safe}" data-tip="${safe}">?</span>`;
}
// A help marker inside a <summary> or button must not toggle/press its parent
document.addEventListener('click',event=>{if(event.target.closest&&event.target.closest('.help-tip'))event.preventDefault();},true);

/* =====================================================================
   ADVENTURE TURN VIEWS
   Called by the engine (showEnemyTurn / showPlayerTurn / endGame in
   ai-adventure.js) after it has updated S. These only draw.
   ===================================================================== */
/* Main turn button: label + outcome-preview pill + key hint (same markup as Commander's). */
function setEndTurnButton(label,className){
  const btn=document.getElementById('endTurnBtn');
  if(!btn)return;
  btn.className=className;
  btn.innerHTML=`<span class="cmd-preview" hidden></span><span class="cmd-label">${label}</span><kbd class="cmd-key" aria-hidden="true">Space</kbd>`;
}
function renderEnemyTurnView(){
  const decl=document.getElementById('declare');
  decl.className="declare garruk compact-declare";
  const actionCount=(S.actionSteps||[]).length;
  const attackerCount=S.tokens.filter(t=>t.attacking).length;
  document.getElementById('declareTitle').textContent=`${actionCount} enemy action${actionCount===1?"":"s"}`;
  document.getElementById('declareFlavor').textContent=S.attackPower>0?`${attackerCount} attacker${attackerCount===1?"":"s"} · ${S.attackPower} incoming power`:"No incoming combat damage";
  document.getElementById('declareMech').innerHTML=`<button type="button" class="detail-link" id="enemyActionsBtn">Review actions</button>`;
  document.getElementById('enemyActionsBtn').onclick=showEnemyActions;
  document.getElementById('huntTitle').textContent=`${enemyName()}'s Turn`;
  setEndTurnButton("Resolve Enemy Turn ▸","endturn garruk");
  document.getElementById('quickEndBtn').hidden=true;
  setBanner("garruk");render();renderContextualInputs();renderPhaseBar();
}
function renderPlayerTurnView(){
  const cfg=modeConfig();
  const timing=currentTimingInfo();
  const decl=document.getElementById('declare');decl.className="declare player compact-declare";
  document.getElementById('declareTitle').textContent="Objective";
  document.getElementById('declareFlavor').textContent=`Defeat ${cfg.enemy} · ${S.loyalty} ${cfg.resource.toLowerCase()} remaining`;
  let mech="";
  if(S.spellLock)mech+=`<span class="lock-note">\u{1F512} ${S.spellLock}</span>`;
  if(S.tokens.length>0&&timing.isCombat){
    const potentialBlockers=S.tokens.filter(t=>!t.attacking&&!t.summoningSick);
    const blockToughness=potentialBlockers.reduce((a,t)=>a+tokenToughness(t),0);
    const deathTouchers=potentialBlockers.filter(t=>t.kws.includes("Deathtouch")).length;
    const tappedCount=S.tokens.filter(t=>t.attacking).length;
    mech+=`<span class="combat-outlook">${potentialBlockers.length} blocker${potentialBlockers.length===1?"":"s"} · ${blockToughness} toughness${deathTouchers?` · ${deathTouchers} deathtouch`:""}${tappedCount?` · ${tappedCount} tapped out`:""}</span>`;
  }else if(S.tokens.length===0&&timing.isCombat){
    mech+=`<span class="combat-outlook clear">No blockers</span>`;
  }
  document.getElementById('declareMech').innerHTML=mech;
  document.getElementById('huntTitle').textContent=`Your Turn · ${timing.stepLabel}`;
  let label="Continue ▸";
  if(S.playerStep===TURN_STEPS.UPKEEP||S.playerStep===TURN_STEPS.DRAW)label="Continue to Main Phase ▸";
  else if(timing.isMainPhase&&S.playerStep===TURN_STEPS.PRECOMBAT_MAIN)label="Continue to Combat ▸";
  else if(timing.isCombat)label="Resolve Combat ▸";
  else if(timing.isMainPhase&&S.playerStep===TURN_STEPS.POSTCOMBAT_MAIN)label="End Turn ▸";
  setEndTurnButton(label,"endturn");
  const quickEnd=document.getElementById('quickEndBtn');
  quickEnd.textContent="Skip to End Turn";
  quickEnd.title="Apply the current entries and end your turn";
  quickEnd.hidden=S.playerStep===TURN_STEPS.POSTCOMBAT_MAIN||S.playerStep===TURN_STEPS.END_STEP;
  setBanner("player");render();renderContextualInputs();renderPhaseBar();
}
function showEndGameModal(won,reason){
  const m=document.getElementById('modal'),o=document.getElementById('overlay'),cfg=modeConfig();
  if(won){
    const victory=reason||(S.mode==="horde"?"The final corpse falls and the Horde deck is empty.":`${cfg.enemy}'s ${cfg.resource.toLowerCase()} reaches 0.`);
    m.className="modal";m.innerHTML=`<div class="big-ico">\u{1F3C6}</div><h2>Victory!</h2><p>${victory}<br>You survived <b>${S.turn}</b> turns of ${modeDisplayName(cfg)}.</p><button class="cta" onclick="restart()">Choose Another Encounter</button>`;
  }else{
    m.className="modal lose";m.innerHTML=`<div class="big-ico">\u{1F480}</div><h2>Defeated</h2><p>${reason||`${cfg.enemy} defeated you.`}<br><br>${cfg.resource} remaining: <b>${S.loyalty}</b>.</p><button class="cta" onclick="restart()">Try Another Encounter</button>`;
  }
  o.classList.add("show");
}
function hideGameOverlay(){
  const o=document.getElementById('overlay');
  if(o)o.classList.remove('show');
}
function updateUndoBtn(){
  const b=document.getElementById('undoBtn');
  if(b)b.disabled=undoStack.length===0;
}

/* =====================================================================
   SHARED RESPONSE STEPS (both modes)
   ===================================================================== */
/* One numbered response step. `key` links it to its live status chip. */
function responseStepHtml(number,key,title,hint,body,modifier){
  return `<section class="resolution-step response-step ${modifier||""}" data-step="${key}">
    <div class="resolution-step-h"><span>${number}</span><strong>${title}</strong><em class="step-status" data-step-status="${key}"></em></div>
    ${hint?`<p class="step-hint">${hint}</p>`:""}
    <div class="resolution-step-b">${body}</div>
  </section>`;
}
/* Status text on the right of a step header; `isSet` highlights the step as used. */
function setStepStatus(panel,key,text,isSet){
  if(!panel)return;
  const step=panel.querySelector(`.response-step[data-step="${key}"]`);
  if(!step)return;
  step.classList.toggle('is-set',!!isSet);
  const status=step.querySelector('.step-status');
  if(status)status.textContent=text||"Optional";
}

/* =====================================================================
   SPACE / ENTER ADVANCES THE TURN (both modes)
   Presses Commander's #cmdConfirmBtn when it is on screen, otherwise the
   Adventure #endTurnBtn. Ignored while typing, while a control has focus
   (so it keeps its native behaviour), or while a dialog is open.
   ===================================================================== */
/* This is the only Space/Enter handler for both modes (commander-ui.js has none).
   Set to true only if Commander mode ever gets its own handler again. */
var ADVANCE_KEY_DEFERS_TO_COMMANDER=false;
function commanderGameActive(){return typeof gameState!=="undefined"&&!!gameState;}
function advanceKeyTarget(){
  // Only trust Commander's button while a Commander game is live (a stale bar must not be pressed in Adventure)
  if(commanderGameActive()){
    const cmd=document.getElementById('cmdConfirmBtn');
    return cmd&&cmd.offsetParent!==null&&!cmd.disabled?cmd:null;
  }
  if(!S||gameOver)return null;
  const btn=document.getElementById('endTurnBtn');
  if(!btn||btn.disabled||btn.offsetParent===null)return null;
  return btn;
}
document.addEventListener('keydown',event=>{
  if(commanderGameActive()&&(ADVANCE_KEY_DEFERS_TO_COMMANDER||gameState.gameOver))return;
  if(event.repeat||(event.key!=="Enter"&&event.key!==" "))return;
  if(event.metaKey||event.ctrlKey||event.altKey)return;
  if(document.querySelector('.overlay.show'))return;
  const active=document.activeElement;
  if(active&&active!==document.body){
    if(active.tagName==="INPUT"){
      // Enter commits a typed number (and refreshes the preview); press again to continue
      if(event.key==="Enter"&&active.type==="number"){event.preventDefault();active.blur();}
      return;
    }
    if(active.matches('select,textarea,button,summary,a,[role="button"],[contenteditable]'))return;
  }
  const target=advanceKeyTarget();
  if(!target)return;
  event.preventDefault();
  target.click();
});
/* A mouse click shouldn't leave focus on a stepper or card — otherwise the next
   Space/Enter is swallowed by that control. (event.detail is 0 for keyboard
   activation, so keyboard users keep their focus.) Shared by both modes. */
document.addEventListener('click',event=>{
  if((!S&&!commanderGameActive())||event.detail===0)return;
  const btn=event.target.closest&&event.target.closest('button');
  if(btn&&btn.id!=="menuBtn"&&!btn.closest('.overlay'))btn.blur();
});
