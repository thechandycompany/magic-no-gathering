/* =====================================================================
   CUSTOM MODAL INPUTS (native prompt/confirm are blocked in sandboxed iframes)
   ===================================================================== */
var inputResolver=null;
function closeInput(){ const overlay=document.getElementById('inputOverlay'); overlay.classList.remove('show'); overlay.dataset.dismissible="true"; inputResolver=null; }
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
function pickMultiTokenModal(){
  return new Promise(res=>{
    if(S.tokens.length===0){ res(null); return; }
    if(S.tokens.length===1){ res([0]); return; }
    inputResolver=res;
    document.getElementById('inputTitle').textContent="Select the creatures to destroy";
    const body=document.getElementById('inputBody');
    body.innerHTML="";
    const picked = new Set();
    S.tokens.forEach((t,i)=>{
      const b=document.createElement('button');
      b.type="button"; b.className="pick-row card-choice";
      b.innerHTML=cardReferenceHtml(t);
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
/* opts.dismissible:false — for prompts whose second button is a real answer (e.g. "I countered"),
   so clicking outside or pressing Escape can't pick it by accident. */
function askConfirm(title, msg, okLabel, cancelLabel, opts){
  return new Promise(res=>{
    inputResolver=res;
    document.getElementById('inputOverlay').dataset.dismissible=(opts&&opts.dismissible===false)?"false":"true";
    document.getElementById('inputTitle').textContent=title;
    const body=document.getElementById('inputBody');
    body.innerHTML=`<div class="confirm-msg">${msg}</div>`;
    const acts=document.getElementById('inputActions'); acts.className="input-actions";
    const ok=document.getElementById('inputOk'); ok.textContent=okLabel||"Confirm";
    const cancel=document.getElementById('inputCancel'); cancel.textContent=cancelLabel||"Cancel";
    ok.onclick=()=>{ closeInput(); res(true); };
    cancel.onclick=()=>{ closeInput(); res(false); };
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
      ${cardReferenceListHtml([token],"modal-card-list")}
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
      ${cardReferenceListHtml([token],"modal-card-list")}
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
var infoReturnFocus=null;
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
var logReturnFocus=null;
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
function showModeRules(){openInfoModal(`${modeDisplayName()} rules`,modeHelpHtml());}
function adventureActionCards(step){
  if(step.cards?.length)return step.cards;
  const label=step.label||"";
  if(/attack|held back/i.test(label))return S.tokens.filter(token=>token.attacking||/held back/i.test(label));
  const cardName=label.replace(/^(?:Summon|Cast \+ equip|Cast|Equip)\s+/i,"").replace(/\s*\([^)]*\).*$/,"").trim();
  const token=S.tokens.find(candidate=>candidate.name===cardName);
  if(token)return [token];
  if(/land drop|play a land/i.test(label))return [{name:"Land",ico:"🌲",type:"Land"}];
  if(/fast mana/i.test(label))return [{name:"Fast Mana",ico:"⚙",type:"Artifact",effect:"Mana source"}];
  if(cardName&&typeof VOLTRON_CARDS!=="undefined"){
    for(const cards of Object.values(VOLTRON_CARDS)){
      const card=(cards||[]).find(candidate=>candidate.name===cardName);
      if(card)return [card];
    }
  }
  return [];
}
function enemyActionsHtml(){
  let html='<ol class="action-steps">';
  (S.actionSteps||[]).forEach((step,i)=>{
    const cards=adventureActionCards(step);
    html+=`<li class="action-step"><span class="step-num">${i+1}</span><div class="step-content"><strong>${step.label}</strong><span class="step-detail">${step.detail}</span>${cardReferenceListHtml(cards,"action-card-list")}</div></li>`;
  });
  return html+'</ol>';
}
function showEnemyActions(){openInfoModal(`${enemyName()} · Turn ${S.turn}`,enemyActionsHtml());}
function showTokenDetails(index){
  const token=S.tokens[index];if(!token)return;
  const keywords=tokenKeywords(token);
  openInfoModal(token.name,`<div class="token-detail">
    ${cardReferenceListHtml([token],"modal-card-list token-detail-card")}
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
  html+=gy.length?cardReferenceListHtml(gy.slice().reverse(),"zone-card-list"):`<div class="graveyard-empty">The graveyard is empty.</div>`;
  html+='</div>';
  openInfoModal(`☠ ${enemyName()}'s Graveyard`,html);
}
function showEnemyExile(){
  const ex=S.enemyExile||[];
  const count=S.enemyExileCount||0;
  let html='<div class="enemy-graveyard-viewer">';
  html+=`<p class="graveyard-summary">${count} card${count===1?"":"s"} in ${enemyName()}'s exile.</p>`;
  html+=ex.length?cardReferenceListHtml(ex.slice().reverse(),"zone-card-list"):`<div class="graveyard-empty">Exile is empty.</div>`;
  html+='</div>';
  openInfoModal(`✦ ${enemyName()}'s Exile`,html);
}

/* ===== Dismissing popups =====
   Clicking the dimmed backdrop or pressing Escape closes the TOPMOST popup — but only if it
   can be dismissed. Each popup closes through its own cancel/close action so any pending
   promise still resolves. Not dismissible: the setup screen, victory/defeat, and prompts
   opened with askConfirm(..., {dismissible:false}). */
function topOverlay(){
  const open=Array.from(document.querySelectorAll('.overlay.show'));
  return open.length?open[open.length-1]:null;
}
function dismissOverlay(overlay){
  if(!overlay)return false;
  switch(overlay.id){
    case 'settingsOverlay': closeSettings(); return true;
    case 'logOverlay': closeLog(); return true;
    case 'infoOverlay': closeInfoModal(); return true;
    case 'inputOverlay':
      if(overlay.dataset.dismissible==="false")return false;
      document.getElementById('inputCancel').click(); return true;
    default: {
      // Generic modal (#overlay): only viewers that offer an explicit close button
      const close=overlay.querySelector('[data-dismiss], .graveyard-close');
      if(!close)return false;
      close.click(); return true;
    }
  }
}
