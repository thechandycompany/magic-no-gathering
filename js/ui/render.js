/* ---------- toast ---------- */
let toastT;
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
  if(card?.loyalty!=null)return "Planeswalker";
  return "Permanent";
}
function cardReferenceHtml(card,options={}){
  if(!card)return "";
  const type=cardReferenceType(card);
  const commander=card.kind==="commander"||/commander/i.test(type);
  const classes=["card","card-reference",options.className||"",commander?"commander":"",/artifact/i.test(type)?"artifact":"",/land/i.test(type)?"land":"",/planeswalker/i.test(type)?"pw-card":""].filter(Boolean).join(" ");
  const name=escapeCardReferenceHtml(card.name||"Unnamed card");
  const icon=escapeCardReferenceHtml(card.ico||card.icon||(commander?"⚜":/artifact/i.test(type)?"⚙":/land/i.test(type)?"🌲":/planeswalker/i.test(type)?"⬡":"🃏"));
  const keywords=(card.baseKws||card.kws||[]).filter(Boolean).join(" · ");
  const hasStats=card.p!=null&&card.t!=null;
  const statText=hasStats?`${escapeCardReferenceHtml(card.p)}/${escapeCardReferenceHtml(card.t)}`:card.loyalty!=null?`L ${escapeCardReferenceHtml(card.loyalty)}`:"";
  const details=[type,card.effect].filter(Boolean).join(" · ");
  return `<span class="${classes}" title="${escapeCardReferenceHtml(details)}" aria-label="${name}${details?`: ${escapeCardReferenceHtml(details)}`:""}">
    <span class="c-name"><span>${name}</span><span class="mana">${commander?"⚜":/artifact/i.test(type)?"⚙":/land/i.test(type)?"◇":/planeswalker/i.test(type)?"⬡":"✦"}</span></span>
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

/* Small "?" help marker with a hover/focus tooltip. Use only where a term needs explaining. */
function helpTip(text){
  const safe=String(text).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
  return `<span class="help-tip" tabindex="0" role="note" aria-label="${safe}" data-tip="${safe}">?</span>`;
}
// A help marker inside a <summary> or button must not toggle/press its parent
document.addEventListener('click',event=>{if(event.target.closest&&event.target.closest('.help-tip'))event.preventDefault();},true);
