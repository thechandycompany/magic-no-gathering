/* =====================================================================
   COMMANDER UI — Rendering, event wiring, game loop, and boot.
   Turn-flow rules and response resolution live in js/engine/commander-turn.js;
   this file renders state and builds the `response` objects it resolves.
   ===================================================================== */

// Globals shared with ai-commander.js (must be accessible outside the IIFE)
var gameState = null;

(function() {
"use strict";

/* =====================================================================
   UI — Setup screen, life HUD, board views, player inputs
   ===================================================================== */
const SAVE_KEY="magic_no_gathering_save_v2";
const nm=owner=>owner?(owner.id==="player"?"You":String(owner.name||"?").split(",")[0]):"?";

/* ---------- Commander setup choices (opponent count, decks, difficulty) ---------- */
const SETUP_KEY="mng_commander_setup";
const DIFFICULTY_LEVELS=[
  {level:1,name:"Casual",desc:"Develops slowly and makes loose choices. Good for learning the table."},
  {level:2,name:"Relaxed",desc:"Plays steadily but rarely punishes a weak board."},
  {level:3,name:"Standard",desc:"Balanced, fair play. The recommended experience."},
  {level:4,name:"Focused",desc:"Sequences carefully and pressures the most vulnerable seat."},
  {level:5,name:"Optimized",desc:"Plays to win quickly and takes every opening it sees."}
];
function availableDecks(){return (typeof DECK_REGISTRY!=="undefined"&&Array.isArray(DECK_REGISTRY))?DECK_REGISTRY.filter(d=>d&&d.id):[];}
function deckById(id){return availableDecks().find(d=>d.id===id)||null;}
function difficultyInfo(level){return DIFFICULTY_LEVELS.find(d=>d.level===level)||DIFFICULTY_LEVELS[2];}
function clampSetupUnit(v,fallback){const n=Number(v);return v==null||v===""||!isFinite(n)?fallback:Math.max(0,Math.min(1,n));}
function loadCommanderSetup(){
  let raw={};
  try{raw=JSON.parse(safeGet(SETUP_KEY)||"{}")||{};}catch(e){raw={};}
  const decks=availableDecks();
  const count=Math.max(1,Math.min(4,parseInt(raw.count,10)||3));
  const deck=raw.deck==="mixed"&&decks.length>1?"mixed":(deckById(raw.deck)?raw.deck:(decks[0]?decks[0].id:null));
  const powerLevel=Math.max(1,Math.min(5,parseInt(raw.powerLevel,10)||3));
  return {count,deck,powerLevel,aggression:clampSetupUnit(raw.aggression,0.5),interaction:clampSetupUnit(raw.interaction,0.5),advancedOpen:!!raw.advancedOpen};
}
function saveCommanderSetup(setup){safeSet(SETUP_KEY,JSON.stringify(setup));}
/* What createCommanderBattle receives. decks: one deck id per seat, or "mixed". */
function commanderSettingsFromSetup(setup){
  const settings={cpu:{powerLevel:setup.powerLevel,aggression:setup.aggression,interaction:setup.interaction}};
  if(setup.deck==="mixed")settings.decks="mixed";
  else if(setup.deck)settings.decks=Array.from({length:setup.count},()=>setup.deck);
  return settings;
}
function deckPickerHtml(setup){
  const decks=availableDecks();
  if(!decks.length)return "";
  if(decks.length===1){
    const d=decks[0];
    return `<div class="setup-field-block"><span class="setup-field-label">Opponent deck</span>
      <div class="deck-static"><strong>${escapeHtml(d.name)}</strong><span>${escapeHtml(d.summary||"")}</span></div></div>`;
  }
  const options=decks.map(d=>`<option value="${escapeHtml(d.id)}"${setup.deck===d.id?" selected":""}>All opponents: ${escapeHtml(d.name)}</option>`).join("")
    +`<option value="mixed"${setup.deck==="mixed"?" selected":""}>Mixed: a different deck at each seat</option>`;
  return `<div class="setup-field-block"><label class="setup-field-label" for="setupDeckSelect">Opponent decks</label>
    <select class="setup-select" id="setupDeckSelect">${options}</select>
    <p class="setup-field-note" id="setupDeckNote"></p></div>`;
}
function deckNoteText(setup){
  if(setup.deck==="mixed")return `Seats are dealt from: ${availableDecks().map(d=>d.name).join(", ")}.`;
  const d=deckById(setup.deck);return d?(d.summary||""):"";
}
function sliderHtml(id,label,tip,lowLabel,highLabel,value){
  const pct=Math.round(value*100);
  return `<div class="ai-slider">
    <div class="ai-slider-h"><label for="${id}">${label}</label>${helpTip(tip)}<output id="${id}Out" for="${id}">${pct}%</output></div>
    <input type="range" id="${id}" min="0" max="100" step="5" value="${pct}" aria-valuetext="${pct}%">
    <div class="ai-slider-ends" aria-hidden="true"><span>${lowLabel}</span><span>${highLabel}</span></div>
  </div>`;
}

function renderSetupScreen(onStartAdventure, onStartCommander) {
  const modal=document.getElementById('modal'), overlay=document.getElementById('overlay');
  modal.className="modal setup-modal";
  const adventureModes=Object.values(MODES).filter(m=>m.category==="adventure");
  const setup=loadCommanderSetup();

  modal.innerHTML=`
    <div class="big-ico">🎴</div>
    <h2>Magic No Gathering</h2>
    <p class="setup-sub">Solo Commander Encounter Engine</p>
    <div class="setup-columns">
      <div class="setup-col setup-col-commander">
        <h3 class="setup-col-h">⚔️ Commander Battle</h3>
        <p class="setup-col-desc">Play your deck against one to four CPU commanders. Opponents also attack each other.</p>
        <div class="opponent-count">
          <label id="setupCountLabel">Opponents</label>
          <div class="count-row" role="group" aria-labelledby="setupCountLabel">
            ${[1,2,3,4].map(n=>`<button type="button" class="count-btn${n===setup.count?" active":""}" data-count="${n}" aria-pressed="${n===setup.count}">${n}</button>`).join("")}
          </div>
        </div>
        ${deckPickerHtml(setup)}
        <div class="setup-field-block">
          <span class="setup-field-label" id="setupDifficultyLabel">Difficulty</span>
          <div class="difficulty-seg" role="radiogroup" aria-labelledby="setupDifficultyLabel">
            ${DIFFICULTY_LEVELS.map(d=>`<button type="button" class="difficulty-btn" role="radio" data-level="${d.level}" aria-checked="${d.level===setup.powerLevel}" tabindex="${d.level===setup.powerLevel?0:-1}"><span class="difficulty-num">${d.level}</span><span class="difficulty-name">${d.name}</span></button>`).join("")}
          </div>
          <p class="setup-field-note" id="setupDifficultyNote" aria-live="polite"></p>
        </div>
        <details class="setup-advanced" id="setupAdvanced"${setup.advancedOpen?" open":""}>
          <summary>Advanced</summary>
          <div class="setup-advanced-body">
            ${sliderHtml("setupAggression","Aggression","How readily CPUs attack instead of keeping creatures back to block.","Holds back blockers","Attacks often",setup.aggression)}
            ${sliderHtml("setupInteraction","Interaction","How often CPUs use instants to respond to your spells, removal, and attacks.","Rarely responds","Often responds",setup.interaction)}
            <button type="button" class="setup-link-btn" id="setupAdvancedReset">Reset to defaults</button>
          </div>
        </details>
        <button class="setup-col-cta commander-cta" id="startCommanderBtn">Begin Commander Battle</button>
      </div>
      <div class="setup-col setup-col-adventure">
        <h3 class="setup-col-h">🌲 Solo Adventures</h3>
        <p class="setup-col-desc">Scripted one-on-one encounters against a single CPU opponent.</p>
        <button class="setup-col-cta adventure-cta" id="showAdventuresBtn">Choose Adventure</button>
      </div>
    </div>
    <div class="theme-picker">
      <label>Theme</label>
      <div class="theme-btns" id="themeBtns">
        ${themePickerButtonsHtml()}
      </div>
    </div>`;
  overlay.classList.add("show");

  const persist=()=>saveCommanderSetup(setup);
  modal.querySelectorAll('.count-btn').forEach(btn=>{
    btn.onclick=()=>{
      modal.querySelectorAll('.count-btn').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed',"false");});
      btn.classList.add('active');btn.setAttribute('aria-pressed',"true");
      setup.count=parseInt(btn.dataset.count,10);persist();
    };
  });
  const deckSelect=document.getElementById('setupDeckSelect'),deckNote=document.getElementById('setupDeckNote');
  const syncDeckNote=()=>{if(deckNote)deckNote.textContent=deckNoteText(setup);};
  if(deckSelect)deckSelect.onchange=()=>{setup.deck=deckSelect.value;persist();syncDeckNote();};
  syncDeckNote();
  const diffButtons=[...modal.querySelectorAll('.difficulty-btn')];
  const syncDifficulty=()=>{
    diffButtons.forEach(b=>{const on=parseInt(b.dataset.level,10)===setup.powerLevel;b.setAttribute('aria-checked',String(on));b.tabIndex=on?0:-1;});
    const info=difficultyInfo(setup.powerLevel);
    document.getElementById('setupDifficultyNote').textContent=info.desc;
  };
  const pickDifficulty=(level,focus)=>{
    setup.powerLevel=Math.max(1,Math.min(5,level));persist();syncDifficulty();
    if(focus){const b=diffButtons.find(x=>parseInt(x.dataset.level,10)===setup.powerLevel);if(b)b.focus();}
  };
  diffButtons.forEach(btn=>{
    btn.onclick=()=>pickDifficulty(parseInt(btn.dataset.level,10));
    btn.onkeydown=e=>{
      const step={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[e.key];
      if(step){e.preventDefault();pickDifficulty(setup.powerLevel+step,true);}
      else if(e.key==="Home"||e.key==="End"){e.preventDefault();pickDifficulty(e.key==="Home"?1:5,true);}
    };
  });
  syncDifficulty();
  const wireSlider=(id,key)=>{
    const input=document.getElementById(id),out=document.getElementById(id+'Out');
    const sync=()=>{const pct=Math.round(setup[key]*100);input.value=pct;out.textContent=`${pct}%`;input.setAttribute('aria-valuetext',`${pct}%`);};
    input.oninput=()=>{setup[key]=parseInt(input.value,10)/100;sync();persist();};
    return sync;
  };
  const syncAggression=wireSlider('setupAggression','aggression'),syncInteraction=wireSlider('setupInteraction','interaction');
  document.getElementById('setupAdvancedReset').onclick=()=>{setup.aggression=0.5;setup.interaction=0.5;syncAggression();syncInteraction();persist();};
  const adv=document.getElementById('setupAdvanced');
  adv.ontoggle=()=>{setup.advancedOpen=adv.open;persist();};
  document.getElementById('startCommanderBtn').onclick=()=>{persist();try{onStartCommander(setup.count,commanderSettingsFromSetup(setup));}catch(e){console.error("[MNG] startCommanderBattle failed:",e);}};
  document.getElementById('showAdventuresBtn').onclick=()=>renderAdventureSelectScreen(adventureModes,onStartAdventure);
  wireThemePicker();
}

function renderAdventureSelectScreen(adventureModes, onStartAdventure){
  const modal=document.getElementById('modal');
  modal.innerHTML=`
    <button type="button" class="setup-back-btn" id="adventureBackBtn">← Back</button>
    <h2 class="adventure-select-h">🌲 Solo Adventures</h2>
    <p class="setup-sub">Choose an encounter.</p>
    <div class="mode-grid" role="radiogroup" aria-label="Adventure mode">
      ${adventureModes.map((m,i)=>`<label class="mode-option"><input type="radio" name="encounterMode" value="${m.id}" ${i===0?'checked':''}><div class="mode-card"><div class="mode-title">${m.icon} ${m.name}</div><div class="mode-desc">${m.summary.split('.')[0]}.</div></div></label>`).join('')}
    </div>
    <button class="setup-col-cta adventure-cta" id="startAdventureBtn">Begin Adventure</button>`;
  document.getElementById('adventureBackBtn').onclick=()=>renderSetupScreen(onStartAdventure, startCommanderBattle);
  document.getElementById('startAdventureBtn').onclick=()=>{
    const chosen=modal.querySelector('input[name="encounterMode"]:checked');
    document.getElementById('overlay').classList.remove("show");
    onStartAdventure(chosen?chosen.value:"vanilla");
  };
}

function getTargetName(state,targetId){
  if(targetId==="player")return "You";
  const o=state.opponents.find(x=>x.id===targetId);
  return o?nm(o):"?";
}
function oppById(id){return gameState?gameState.opponents.find(o=>o.id===id)||null:null;}

function findGraveyardOwner(state,ownerId){
  return ownerId==="player"?state.player:state.opponents.find(opp=>opp.id===ownerId)||null;
}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));}
function showGraveyardViewer(state,ownerId){
  const owner=findGraveyardOwner(state,ownerId);
  const overlay=document.getElementById('overlay'),modal=document.getElementById('modal');
  if(!owner||!overlay||!modal)return;
  const ownerName=owner.id==="player"?"Your":`${nm(owner)}'s`;
  let selectedCardId=null;
  const close=()=>{overlay.classList.remove("show");modal.innerHTML="";};
  const render=()=>{
    const cards=owner.graveyard||[];
    const selectableCards=owner.id==="player"?[]:cards.filter(card=>!card.isToken&&card.types?.includes("Creature"));
    if(!selectableCards.some(card=>card.id===selectedCardId))selectedCardId=null;
    const selectedCard=selectableCards.find(card=>card.id===selectedCardId)||null;
    const unmaterialized=unmaterializedGraveyardCount(owner);
    const cardsHtml=cards.length?`<span class="card-reference-list zone-card-list">${cards.map(card=>{
      const selectable=selectableCards.some(candidate=>candidate.id===card.id);
      const selected=card.id===selectedCardId;
      return selectable?`<button type="button" class="zone-card-select card-choice ${selected?"selected":""}" data-graveyard-card-id="${escapeHtml(card.id)}" aria-pressed="${selected}" aria-label="${selected?"Deselect":"Select"} ${escapeHtml(card.name)}">${cardReferenceHtml(card)}</button>`:cardReferenceHtml(card);
    }).join("")}</span>`:"<div class=\"graveyard-empty\">No individual cards recorded yet.</div>";
    const historicalNote=unmaterialized?`<p class="graveyard-untracked">${plural(unmaterialized,"earlier card")} ${unmaterialized===1?"is":"are"} included in the count but ${unmaterialized===1?"was":"were"} not recorded individually.</p>`:"";
    const actionControls=selectableCards.length?`<section class="graveyard-card-actions"><p>${selectedCard?`Selected: <strong>${escapeHtml(selectedCard.name)}</strong>.`:"Select a creature card to exile or return it."}</p><div><button type="button" class="target-btn graveyard-exile-action" id="exileSelectedGraveyardCreature" ${selectedCard?"":"disabled"}>Exile selected creature</button><button type="button" class="target-btn graveyard-resurrect-action" id="resurrectSelectedGraveyardCreature" ${selectedCard?"":"disabled"}>Return to your battlefield</button></div></section>`:"";
    modal.className="modal graveyard-modal";
    modal.innerHTML=`<div class="graveyard-modal-head"><div><span class="big-ico">⚰</span><h2>${escapeHtml(ownerName)} Graveyard</h2></div><button type="button" class="graveyard-close" data-dismiss aria-label="Close graveyard">×</button></div><p class="graveyard-summary">${plural(owner.graveyardCount||0,"card")} · ${cards.length} shown</p>${cardsHtml}${historicalNote}${actionControls}<button type="button" class="cta ghost" id="closeGraveyardViewer">Close</button>`;
    overlay.classList.add("show");
    document.getElementById("closeGraveyardViewer").onclick=close;
    modal.querySelector(".graveyard-close").onclick=close;
    modal.querySelectorAll("[data-graveyard-card-id]").forEach(button=>button.onclick=()=>{
      selectedCardId=button.dataset.graveyardCardId;
      render();
    });
    const resolveSelectedCreature=action=>{
      if(!selectedCard)return;
      cmdSnapshot();
      const moved=action==="exile"
        ?exileOpponentGraveyardCreature(owner,selectedCard.id)
        :reanimateGraveyardCard(owner,selectedCard.id);
      if(!moved)return;
      if(action==="exile")logCommander(`You exile ${discardedCardText(moved)} from ${nm(owner)}'s graveyard.`);
      else logCommander(`You resurrect ${discardedCardText(moved)} from ${nm(owner)}'s graveyard onto your battlefield.`);
      ensureCommanderEffectState(gameState);
      saveState();
      close();
      showCommanderGame();
    };
    modal.querySelector("#exileSelectedGraveyardCreature")?.addEventListener("click",()=>resolveSelectedCreature("exile"));
    modal.querySelector("#resurrectSelectedGraveyardCreature")?.addEventListener("click",()=>resolveSelectedCreature("resurrect"));
  };
  render();
}
function wireGraveyardViewerControls(root,state){
  root.querySelectorAll("[data-graveyard-owner]").forEach(control=>{
    const open=event=>{event.preventDefault();event.stopPropagation();showGraveyardViewer(state,control.dataset.graveyardOwner);};
    control.onclick=open;
    control.onkeydown=event=>{if(event.key==="Enter"||event.key===" ")open(event);};
  });
  root.querySelectorAll("[data-exile-owner]").forEach(control=>{
    const open=event=>{event.preventDefault();event.stopPropagation();showExileViewer(state,control.dataset.exileOwner);};
    control.onclick=open;
    control.onkeydown=event=>{if(event.key==="Enter"||event.key===" ")open(event);};
  });
}
function showExileViewer(state,ownerId){
  const owner=findGraveyardOwner(state,ownerId);
  const overlay=document.getElementById('overlay'),modal=document.getElementById('modal');
  if(!owner||!overlay||!modal)return;
  const cards=owner.exile||[];
  const ownerName=owner.id==="player"?"Your":`${nm(owner)}'s`;
  const cardsHtml=cards.length?cardReferenceListHtml(cards,"zone-card-list"):`<div class="graveyard-empty">No cards in exile.</div>`;
  modal.className="modal graveyard-modal";
  modal.innerHTML=`<div class="graveyard-modal-head"><div><span class="big-ico">✦</span><h2>${escapeHtml(ownerName)} Exile</h2></div><button type="button" class="graveyard-close" data-dismiss aria-label="Close exile">×</button></div><p class="graveyard-summary">${plural(owner.exileCount||0,"card")} exiled</p>${cardsHtml}<button type="button" class="cta ghost" id="closeGraveyardViewer">Close</button>`;
  overlay.classList.add("show");
  const close=()=>{overlay.classList.remove("show");modal.innerHTML="";};
  document.getElementById("closeGraveyardViewer").onclick=close;
  modal.querySelector(".graveyard-close").onclick=close;
}

/* Opponent identity color. Dark Purple swaps the deck colors (red/orange/…) for
   distinct purple shades so the palette stays purple-only. */
const PURPLE_OPP_COLORS=["#c9a2ff","#8f5fe0","#e6d2ff","#6a3fb0"];
function oppColor(opp){
  if(document.documentElement.getAttribute('data-theme')==="purple")return PURPLE_OPP_COLORS[(opp.index||0)%PURPLE_OPP_COLORS.length];
  return opp.color;
}
// Re-draw the parts that carry opponent colors when the theme changes mid-game
window.onThemeChange=()=>{if(gameState){renderLifeHud(gameState);renderBoardView(gameState);refreshActivePanel();}};

/* ---------- CPU info helpers (engine data, formatted) ---------- */
function handBreakdownText(opp){
  const b=cpuHandBreakdown(opp);
  const parts=[["lands","land","lands"],["creatures","creature","creatures"],["gear","gear","gear"],["protection","protection","protection"],["other","other","other"],["unknown","unknown","unknown"]]
    .filter(([key])=>b[key]>0).map(([key,one,many])=>`${b[key]} ${b[key]===1?one:many}`);
  return parts.length?parts.join(" · "):"Empty hand";
}
function intentText(state,opp){
  const intent=cpuIntentPreview(opp,state);
  return intent?`${intent.targetName} · ${intent.reason}${intent.lethal?" · lethal":""}`:"";
}

/* ---------- Life HUD (seat order) + lethal warnings ---------- */
function renderLifeHud(state){
  let el=document.getElementById('commanderLifeHud');
  if(!el){el=document.createElement('div');el.id='commanderLifeHud';el.className='commander-life-hud';
    const header=document.querySelector('.app-bar');
    if(header&&header.nextSibling)header.parentNode.insertBefore(el,header.nextSibling);
    else document.querySelector('.wrap').prepend(el);
  }
  const seats=commanderSeatOrder(state);
  const pips=seats.map((seat,order)=>{
    const firstMark=order===0?`<span class="life-first" title="Goes first each round">1st</span>`:"";
    if(seat==="player"){
      const active=state.phase==="player";
      return `<button type="button" class="life-pip player-pip life-pip-btn ${active?'active-opp':''}" data-view="-1">${firstMark}
        <span class="life-ico">🗡️</span><span class="life-name">You</span>
        <span class="life-val ${state.player.life<=10?'warn':''}">${state.player.life}</span>${(state.player.poison||0)>0?`<span class="life-poison" title="Poison counters">☣${state.player.poison}</span>`:""}
      </button>`;
    }
    const opp=state.opponents.find(o=>o.id===seat);if(!opp)return "";
    const dead=isOpponentDead(opp);const cd=state.player.commanderDamageReceived[opp.id]||0;
    const active=state.activeOppId===opp.id&&state.phase==="cpu";
    return `<button type="button" class="life-pip life-pip-btn ${dead?'dead':''} ${active?'active-opp':''}" data-view="${opp.index}" style="border-color:${oppColor(opp)}">${firstMark}<span class="life-ico">${opp.ico}</span><span class="life-name">${nm(opp)}</span><span class="life-val ${opp.life<=10?'warn':''}">${dead?'☠':opp.life}</span><span class="life-creatures"><span title="Cards in hand">🃏 ${opponentHandSize(opp)}</span> · <span title="Cards in deck">📚 ${opponentDeckSize(opp)}</span> · <span class="life-graveyard" role="button" tabindex="0" title="View graveyard" data-graveyard-owner="${opp.id}">⚰ ${opp.graveyardCount}</span>${opp.exileCount?` · <span class="life-graveyard" role="button" tabindex="0" title="View exile" data-exile-owner="${opp.id}">✦ ${opp.exileCount}</span>`:''}</span>${(opp.poison||0)>0?`<span class="life-poison" title="Poison counters">☣${opp.poison}</span>`:""}${cd>0?`<span class="life-cmdr-dmg" title="Commander damage dealt to you">⚜${cd}</span>`:''}</button>`;
  });
  el.innerHTML=pips.join('<span class="life-divider">|</span>');
  el.querySelectorAll('.life-pip-btn').forEach(btn=>{
    btn.onclick=()=>{state.viewMode="single";state.viewTarget=parseInt(btn.dataset.view);renderBoardView(state);};
  });
  wireGraveyardViewerControls(el,state);
  renderLethalStrip(state,el);
}
function renderLethalStrip(state,hud){
  let strip=document.getElementById('commanderLethalStrip');
  if(!strip){strip=document.createElement('div');strip.id='commanderLethalStrip';strip.className='cmd-lethal-strip';strip.setAttribute('role','status');hud.parentNode.insertBefore(strip,hud.nextSibling);}
  const warnings=state.gameOver?[]:cpuLethalWarnings(state);
  strip.hidden=warnings.length===0;
  strip.innerHTML=warnings.map(w=>`<span class="cmd-lethal-item">⚠ ${escapeHtml(w.text)}</span>`).join("");
}

function renderBoardView(state){
  const originalBoard=document.getElementById('board');
  if(originalBoard)originalBoard.style.display='none';
  let board=document.getElementById('commanderBoardOverlay');
  if(!board){
    board=document.createElement('section');board.id='commanderBoardOverlay';board.className='board';
    const hud=document.querySelector('.player-hud');
    if(hud&&hud.nextSibling)hud.parentNode.insertBefore(board,hud.nextSibling);
    else if(originalBoard)originalBoard.parentNode.insertBefore(board,originalBoard);
  }
  if(state.viewMode==="all")renderAllView(state,board);
  else renderSingleView(state,board);
}

function renderSingleView(state,board){
  // viewTarget: -1 = player, 0..N-1 = opponents
  const totalViews=state.opponents.length+1;
  const viewIdx=state.viewTarget;
  if(viewIdx===-1){renderPlayerBoardView(state,board,totalViews);return;}

  const opp=state.opponents[viewIdx];if(!opp){state.viewTarget=-1;renderPlayerBoardView(state,board,totalViews);return;}
  const dead=isOpponentDead(opp);
  board.className=`board ${dead?'defeated':''}`;board.style.borderColor=dead?'var(--blood)':oppColor(opp);
  const tokensHtml=opp.tokens.length===0?'<div class="empty-field">No creatures</div>':
    opp.tokens.map(t=>{
      const kws=t.kws&&t.kws.length?t.kws.join(' · '):'';
      const tooltip=`${t.name} — ${t.p}/${t.t}${t.kws&&t.kws.length?' · '+t.kws.join(', '):''}${t.effect?' — '+t.effect:''}`;
      return `<div class="card ${t.kind==='commander'?'commander':''} ${t.summoningSick?'sick':''} ${t.attacking||t.tapped?'tapped':''}" title="${escapeHtml(tooltip)}">
      ${dead?"":`<button type="button" class="c-remove" data-opp="${opp.id}" data-rm-uid="${escapeHtml(t.uid)}" title="${t.kind==='commander'?`Return ${escapeHtml(t.name)} to the command zone`:`Remove ${escapeHtml(t.name)} from the battlefield`}" aria-label="Remove ${escapeHtml(t.name)}">✕<span class="c-remove-label"> Remove</span></button>`}
      <span class="c-name"><span>${t.name}</span><span class="mana">${t.kind==='commander'?'⚜':'🌲'}</span></span>
      <span class="c-art">${t.ico}</span>
      ${kws?`<span class="c-kw">${kws}</span>`:''}
      ${t.effect?`<span class="c-effect">${t.effect}</span>`:''}
      <span class="c-pt">${t.p}/${t.t}</span>
      ${t.attacking?'<div class="c-atk">⚔️</div><div class="c-tapped-label">TAPPED</div>':''}${t.summoningSick?'<div class="c-sick">💤</div>':''}</div>`;
    }).join('');

  const viewLabel=`${viewIdx+2}/${totalViews}`;
  const cdFromOpp=state.player.commanderDamageReceived[opp.id]||0;
  const gearNames=[...(opp.attachedGear||[]).map(g=>g.name),...(opp.looseGear||[]).map(g=>`${g.name} (unattached)`)];
  const intent=dead?"":intentText(state,opp);
  board.innerHTML=`<div class="board-h"><span class="ico">${opp.ico}</span><span>${opp.name}</span>
    <span class="atk-note">${opp.currentStrategy?STRATEGY_LABELS[opp.currentStrategy]||'':''}</span>
    <div class="view-controls"><button class="btn-ghost view-btn" id="prevOppBtn" title="Previous player" aria-label="Previous player">◂</button><span class="view-counter">${viewLabel}</span><button class="btn-ghost view-btn" id="nextOppBtn" title="Next player" aria-label="Next player">▸</button><button class="btn-ghost view-btn" id="allViewBtn" title="Show all players" aria-label="Show all players">⊞</button></div>
  </div><div class="board-inner commander-board-inner"><div class="garruk-col">
    <div class="commander-board-stats">
      <div class="cbs-item"><span class="cbs-label">Life</span><div class="cbs-adj"><button type="button" class="cbs-btn" data-opp-stat="life" data-opp-id="${opp.id}" data-d="-1">−</button><span class="cbs-val ${opp.life<=10?'warn':''}">${opp.life}</span><button type="button" class="cbs-btn" data-opp-stat="life" data-opp-id="${opp.id}" data-d="1">+</button></div></div>
      <div class="cbs-item cbs-cmdr-dmg"><span class="cbs-label">⚜ Commander damage to you ${helpTip("Combat damage this opponent’s commander has dealt to you. 21 from a single commander eliminates you.")}</span><div class="cbs-adj"><button type="button" class="cbs-btn" data-cmdr-from="${opp.id}" data-d="-1">−</button><span class="cbs-val ${cdFromOpp>=14?'warn':''}">${cdFromOpp}/21</span><button type="button" class="cbs-btn" data-cmdr-from="${opp.id}" data-d="1">+</button></div></div>
      <div class="cbs-item"><span class="cbs-label">Mana</span><span class="cbs-val">${manaAvailable(opp)}${opp.heldMana?` · ${opp.heldMana} open`:""}</span></div>
      <div class="cbs-item"><span class="cbs-label">Hand</span><span class="cbs-val">🃏 ${opponentHandSize(opp)}/${MAX_CPU_HAND_SIZE}</span></div>
      <div class="cbs-item cbs-wide"><span class="cbs-label">Hand contents</span><span class="cbs-val cbs-small">${handBreakdownText(opp)}</span></div>
      <div class="cbs-item"><span class="cbs-label">Deck</span><span class="cbs-val">📚 ${opponentDeckSize(opp)}</span></div>
      ${(opp.poison||0)>0?`<div class="cbs-item"><span class="cbs-label">Poison</span><span class="cbs-val ${opp.poison>=7?'warn':''}">☣ ${opp.poison}/10</span></div>`:""}
      <div class="cbs-item"><span class="cbs-label">Commander ${helpTip("Commander tax: each recast from the command zone costs 2 more mana.")}</span><span class="cbs-val">${commanderOnField(opp)?'Battlefield':opp.commanderInHand?'In hand (no tax)':'Command zone (+'+opp.commanderTax+')'}</span></div>
      <div class="cbs-item cbs-wide"><span class="cbs-label">Equipment</span><span class="cbs-val cbs-small">${gearNames.length?escapeHtml(gearNames.join(", ")):"None"}</span></div>
      ${(opp.utilityPermanents||[]).length?`<div class="cbs-item cbs-wide"><span class="cbs-label">Other permanents</span><span class="cbs-val cbs-small">${opp.utilityPermanents.map((u,i)=>`<span class="cbs-util">${escapeHtml(u.ico||"✦")} ${escapeHtml(u.name)}${dead?"":`<button type="button" class="cbs-util-remove" data-util-opp="${opp.id}" data-util-index="${i}" aria-label="Remove ${escapeHtml(u.name)}">✕</button>`}</span>`).join("")}</span></div>`:""}
      ${intent?`<div class="cbs-item cbs-wide"><span class="cbs-label">Likely next attack ${helpTip("A prediction from this CPU's current targeting priorities. It can change before its turn.")}</span><span class="cbs-val cbs-small">${escapeHtml(intent)}</span></div>`:""}
      <div class="cbs-item"><span class="cbs-label">Graveyard</span><button type="button" class="cbs-zone-btn" data-graveyard-owner="${opp.id}">⚰ ${opp.graveyardCount}</button></div>
      <div class="cbs-item"><span class="cbs-label">Exile</span><button type="button" class="cbs-zone-btn" data-exile-owner="${opp.id}">✦ ${opp.exileCount}</button></div>
    </div></div>
    <div class="field-col"><div class="field-h"><span class="lbl">${nm(opp)}'s creatures</span></div><div class="tokens">${tokensHtml}</div></div></div>`;

  document.getElementById('prevOppBtn').onclick=()=>{state.viewTarget=viewIdx===0?-1:(viewIdx-1);renderBoardView(state);};
  document.getElementById('nextOppBtn').onclick=()=>{state.viewTarget=viewIdx>=state.opponents.length-1?-1:(viewIdx+1);renderBoardView(state);};
  document.getElementById('allViewBtn').onclick=()=>{state.viewMode="all";renderBoardView(state);};
  wireGraveyardViewerControls(board,state);

  board.querySelectorAll('[data-opp-stat]').forEach(btn=>{
    btn.onclick=()=>{
      const targetOpp=oppById(btn.dataset.oppId);
      if(!targetOpp)return;
      const d=parseInt(btn.dataset.d);
      if(btn.dataset.oppStat==="life")targetOpp.life=Math.max(0,targetOpp.life+d);
      renderBoardView(state);renderLifeHud(state);saveState();
    };
  });
  wireCommanderDamageControls(board,state);
  board.querySelectorAll('[data-util-opp]').forEach(btn=>{
    btn.onclick=async event=>{
      event.stopPropagation();
      const owner=oppById(btn.dataset.utilOpp);const entry=owner&&(owner.utilityPermanents||[])[parseInt(btn.dataset.utilIndex)];
      if(!entry)return;
      const destination=await askCommanderRemovalDestination({name:entry.name,ico:entry.ico,type:"Permanent"});
      if(!destination)return;
      cmdSnapshot();
      const moved=removeOpponentPermanent(owner,`util:${btn.dataset.utilIndex}`,destination);
      if(moved)logCommander(`You ${destination==="exile"?"exile":"destroy"} ${movementCardText({...moved,destination:moved.destination||destination})} (${nm(owner)}).`);
      saveState();renderBoardView(gameState);renderLifeHud(gameState);refreshActivePanel();
    };
  });
  board.querySelectorAll('.c-remove[data-rm-uid]').forEach(btn=>{
    btn.onclick=event=>{event.stopPropagation();removeCpuTokenFromBoard(oppById(btn.dataset.opp),btn.dataset.rmUid);};
  });
}
function wireCommanderDamageControls(board,state){
  board.querySelectorAll('[data-cmdr-from]').forEach(btn=>{
    btn.onclick=()=>{
      const oppId=btn.dataset.cmdrFrom;
      const d=parseInt(btn.dataset.d);
      state.player.commanderDamageReceived[oppId]=Math.max(0,(state.player.commanderDamageReceived[oppId]||0)+d);
      renderBoardView(state);renderLifeHud(state);saveState();
    };
  });
}

/* Board "✕ Remove": snapshot, let the CPU respond, remove by uid, then refresh the active form. */
async function removeCpuTokenFromBoard(opp,uid){
  if(!opp)return;
  const token=findTokenByUid(opp,uid);
  if(!token)return;
  let destination="graveyard";
  if(token.kind==="commander"){
    const gearCount=(opp.attachedGear||[]).length;
    const ok=await askConfirm(
      `Return ${nm(token)} to the command zone?`,
      `<strong>${escapeHtml(token.name)}</strong> leaves the battlefield and goes to the command zone.<br><br>`+
      `${gearCount?`Its ${gearCount===1?"equipment stays":`${gearCount} pieces of equipment stay`} on the battlefield unattached; ${nm(opp)} can pay to re-equip. `:""}Recasting it will cost <strong>+${(opp.commanderTax||0)+2}</strong> commander tax.`,
      "Return to zone","Cancel");
    if(!ok)return;
  }else{
    destination=await askCommanderRemovalDestination(token);
    if(!destination)return;
  }
  cmdSnapshot();
  const response=cpuProtectAgainstRemoval(opp,uid);
  if(response){
    saveState();renderBoardView(gameState);renderLifeHud(gameState);refreshActivePanel();
    await showNotice("Removal answered",`<strong>${escapeHtml(response.label)}</strong>.<br><br>Your removal has no effect. Resolve the spell you cast at the table.`);
    return;
  }
  const moved=removeOpponentPermanentByUid(opp,uid,destination);
  if(moved){
    if(token.kind==="commander")logCommander(`${moved.name} returns to the command zone.`);
    else logCommander(`You ${destination==="exile"?"exile":"destroy"} ${movementCardText({...moved,destination:moved.destination||destination})} (${nm(opp)}). Types: ${discardedTypeSummary([moved])}.`);
  }
  markCommanderEliminations(gameState);
  saveState();renderBoardView(gameState);renderLifeHud(gameState);refreshActivePanel();
}

function wirePlaneswalkerControls(board,state){
  board.querySelectorAll('[data-pw-add]').forEach(button=>{
    button.onclick=async event=>{
      event.stopPropagation();
      const name=await askPlaneswalkerName();
      if(!name)return;
      const loyalty=await askPlaneswalkerLoyalty();
      if(loyalty==null)return;
      cmdSnapshot();
      state.player.planeswalkers=state.player.planeswalkers||[];
      const id="pw_"+Date.now()+"_"+Math.floor(Math.random()*1000);
      state.player.planeswalkers.push({id,name,loyalty});
      logCommander(`⬡ ${name} enters the battlefield with ${loyalty} loyalty.`);
      saveState();renderBoardView(state);renderLifeHud(state);
    };
  });
  board.querySelectorAll('[data-pw-loyalty]').forEach(button=>{
    button.onclick=event=>{
      event.stopPropagation();
      const pwId=button.dataset.pwLoyalty;
      const delta=parseInt(button.dataset.d,10);
      const planeswalkers=state.player.planeswalkers||[];
      const pw=planeswalkers.find(candidate=>candidate.id===pwId);
      if(!pw||Number.isNaN(delta))return;
      pw.loyalty=Math.max(0,pw.loyalty+delta);
      if(pw.loyalty===0){
        state.player.planeswalkers=planeswalkers.filter(candidate=>candidate.id!==pwId);
        logCommander(`⬡ ${pw.name} is destroyed (loyalty reached 0).`);
      }
      saveState();renderBoardView(state);renderLifeHud(state);
    };
  });
  board.querySelectorAll('[data-pw-remove]').forEach(button=>{
    button.onclick=async event=>{
      event.stopPropagation();
      const pwId=button.dataset.pwRemove;
      const planeswalkers=state.player.planeswalkers||[];
      const pw=planeswalkers.find(candidate=>candidate.id===pwId);
      if(!pw)return;
      if(!await askConfirm(`Remove ${pw.name}?`,`<strong>${escapeHtml(pw.name)}</strong> (loyalty ${pw.loyalty}) leaves your battlefield.`,"Remove","Cancel"))return;
      cmdSnapshot();
      state.player.planeswalkers=planeswalkers.filter(candidate=>candidate.id!==pwId);
      logCommander(`⬡ ${pw.name} leaves the battlefield.`);
      saveState();renderBoardView(state);renderLifeHud(state);
    };
  });
}

function renderPlayerBoardView(state,board,totalViews){
  board.className='board';board.style.borderColor='var(--gold-dim)';
  const p=state.player;
  const cmdrDmgEntries=Object.entries(p.commanderDamageReceived||{}).filter(([,v])=>v>0);
  const cmdrDmgHtml=cmdrDmgEntries.map(([oppId,dmg])=>{
    const src=oppById(oppId);
    return `<div class="cbs-item cbs-cmdr-dmg"><span class="cbs-label">${src?src.ico:'⚜'} Commander damage from ${src?nm(src):'?'}</span><div class="cbs-adj"><button type="button" class="cbs-btn" data-cmdr-from="${oppId}" data-d="-1">−</button><span class="cbs-val ${dmg>=14?'warn':''}">${dmg}/21</span><button type="button" class="cbs-btn" data-cmdr-from="${oppId}" data-d="1">+</button></div></div>`;
  }).join('');

  const playerCreatureCards=(p.tokens||[]).filter(token=>token.kind==="reanimated-creature");
  const playerTokensHtml=playerCreatureCards.length?playerCreatureCards.map(token=>`<div class="card voltron-creature reanimated" title="Reanimated from ${escapeHtml(token.owner)}"><span class="c-name"><span>${token.name}</span><span class="mana">↩</span></span><span class="c-art">${token.ico}</span>${token.kws?.length?`<span class="c-kw">${token.kws.join(" · ")}</span>`:""}${token.effect?`<span class="c-effect">${token.effect}</span>`:""}<span class="c-pt">${token.p}/${token.t}</span>${token.summoningSick?'<div class="c-sick">💤</div>':''}</div>`).join(""):`<div class="empty-field">${plural(p.creatures,"creature")} on your battlefield</div>`;

  const pws=p.planeswalkers||[];
  const pwHtml=pws.map(pw=>`<div class="card commander pw-card" title="${escapeHtml(pw.name)} · Loyalty ${pw.loyalty}"><span class="c-name"><span>${escapeHtml(pw.name)}</span><span class="mana">⬡</span></span><span class="c-art">⬡</span><span class="c-pt">${pw.loyalty}</span><button type="button" class="c-remove" data-pw-remove="${pw.id}" title="Remove ${escapeHtml(pw.name)} from the battlefield" aria-label="Remove ${escapeHtml(pw.name)}">✕<span class="c-remove-label"> Remove</span></button><div class="pw-adj"><button type="button" class="cbs-btn" data-pw-loyalty="${pw.id}" data-d="-1">−</button><button type="button" class="cbs-btn" data-pw-loyalty="${pw.id}" data-d="1">+</button></div></div>`).join("");
  const stat=(key,label,value,warn)=>`<div class="cbs-item"><span class="cbs-label">${label}</span><div class="cbs-adj"><button type="button" class="cbs-btn" data-player-stat="${key}" data-d="-1" aria-label="Decrease ${label}">−</button><span class="cbs-val ${warn?'warn':''}">${value}</span><button type="button" class="cbs-btn" data-player-stat="${key}" data-d="1" aria-label="Increase ${label}">+</button></div></div>`;

  board.innerHTML=`<div class="board-h"><span class="ico">🗡️</span><span>You</span>
    <span class="atk-note"></span>
    <div class="view-controls"><button class="btn-ghost view-btn" id="prevOppBtn" title="Previous player" aria-label="Previous player">◂</button><span class="view-counter">1/${totalViews}</span><button class="btn-ghost view-btn" id="nextOppBtn" title="Next player" aria-label="Next player">▸</button><button class="btn-ghost view-btn" id="allViewBtn" title="Show all players" aria-label="Show all players">⊞</button></div>
  </div><div class="board-inner commander-board-inner"><div class="garruk-col">
    <div class="commander-board-stats">
      ${stat("life","Life",p.life,p.life<=10)}
      ${cmdrDmgHtml}
      ${stat("creatures","Creatures",p.creatures,false)}
      ${stat("handSize","Hand",p.handSize||0,(p.handSize||0)>7)}
      ${stat("librarySize","Library",p.librarySize||0,(p.librarySize||0)<=5)}
      ${stat("poison","Poison",p.poison||0,(p.poison||0)>=7)}
      <div class="cbs-item"><span class="cbs-label">Planeswalkers</span><span class="cbs-val">⬡ ${pws.length}</span></div>
      <div class="cbs-item"><span class="cbs-label">Graveyard</span><button type="button" class="cbs-zone-btn" data-graveyard-owner="player">⚰ ${p.graveyardCount}</button></div>
      <div class="cbs-item"><span class="cbs-label">Exile</span><button type="button" class="cbs-zone-btn" data-exile-owner="player">✦ ${p.exileCount}</button></div>
    </div></div>
    <div class="field-col"><div class="field-h"><span class="lbl">Your battlefield</span><button class="btn-ghost" data-pw-add type="button">+ Planeswalker</button></div><div class="tokens">${pwHtml}${playerTokensHtml}</div></div></div></div>`;

  document.getElementById('prevOppBtn').onclick=()=>{state.viewTarget=state.opponents.length-1;renderBoardView(state);};
  document.getElementById('nextOppBtn').onclick=()=>{state.viewTarget=0;renderBoardView(state);};
  document.getElementById('allViewBtn').onclick=()=>{state.viewMode="all";renderBoardView(state);};
  wireGraveyardViewerControls(board,state);
  wirePlaneswalkerControls(board,state);
  board.querySelectorAll('[data-player-stat]').forEach(btn=>{
    btn.onclick=()=>{
      const key=btn.dataset.playerStat;
      const d=parseInt(btn.dataset.d);
      state.player[key]=Math.max(0,(state.player[key]||0)+d);
      renderBoardView(state);renderLifeHud(state);saveState();
    };
  });
  wireCommanderDamageControls(board,state);
}

function renderAllView(state,board){
  board.className='board all-view';board.style.borderColor='';
  const player=state.player;
  const planeswalkers=player.planeswalkers||[];
  const playerPlaneswalkersHtml=planeswalkers.length
    ?`<div class="all-pw-list">${planeswalkers.map(pw=>`<div class="all-pw-card"><span class="all-pw-name" title="${escapeHtml(pw.name)}">⬡ ${escapeHtml(pw.name)}</span><div class="all-pw-controls"><button type="button" class="cbs-btn" data-pw-loyalty="${pw.id}" data-d="-1" aria-label="Decrease ${escapeHtml(pw.name)} loyalty">−</button><span class="all-pw-loyalty">${pw.loyalty}</span><button type="button" class="cbs-btn" data-pw-loyalty="${pw.id}" data-d="1" aria-label="Increase ${escapeHtml(pw.name)} loyalty">+</button><button type="button" class="all-pw-remove" data-pw-remove="${pw.id}" title="Remove ${escapeHtml(pw.name)} from the battlefield" aria-label="Remove ${escapeHtml(pw.name)}">✕</button></div></div>`).join('')}</div>`
    :'<span class="all-pw-empty">No planeswalkers on your battlefield.</span>';
  let html=`<div class="board-h"><span class="ico">⊞</span><span>All Players</span><div class="view-controls"><button class="btn-ghost view-btn" id="singleViewBtn" title="Open the active player view" aria-label="Open the active player view">◻</button></div></div><div class="all-opponents-grid">`;
  html+=`<div class="all-opp-card player-card" data-idx="-1" style="border-color:var(--gold-dim)">
    <div class="all-opp-header"><span>🗡️</span><span class="all-opp-name">You</span><span class="all-opp-life">${player.life}</span></div>
    <div class="all-opp-body"><span>♟ ${plural(player.creatures,"creature")}</span><span>⬡ ${plural(planeswalkers.length,"planeswalker")}</span><span title="Cards in hand">🃏 ${player.handSize||0} in hand</span><span title="Cards in library">📚 ${player.librarySize||0} in library</span><span>⚰ ${player.graveyardCount}</span>${(player.poison||0)>0?`<span>☣ ${player.poison}/10 poison</span>`:`<span>✦ ${player.exileCount}</span>`}</div>
    <div class="all-opp-pws"><div class="all-pw-heading"><span>Planeswalkers</span><button type="button" class="all-pw-add" data-pw-add>+ Add</button></div>${playerPlaneswalkersHtml}</div>
  </div>`;
  state.opponents.forEach((opp,i)=>{
    const dead=isOpponentDead(opp);const commander=commanderOnField(opp);
    const commanderSummary=commander?cardReferenceHtml(commander,{className:"all-opp-card-reference"}):(opp.commanderInHand?'<span title="Returned to its owner\'s hand. Its next cast has no tax.">⚜ In hand</span>':'<span title="Commander is in the command zone">⚜ In zone</span>');
    const active=state.phase==="cpu"&&state.activeOppId===opp.id;
    const attacking=active&&state.responseStage==="combat"&&state.activeResult&&state.activeResult.target;
    const intent=dead?"":intentText(state,opp);
    html+=`<div class="all-opp-card ${dead?'dead':''} ${active?'is-active':''}" data-idx="${i}" style="border-color:${oppColor(opp)}">
      <div class="all-opp-header"><span>${opp.ico}</span><span class="all-opp-name">${nm(opp)}</span><span class="all-opp-life">${dead?'☠':opp.life}</span></div>
      <div class="all-opp-body"><span>♟ ${plural(opp.tokens.length,"creature")}</span>${commanderSummary}<span title="Mana available · mana held open">◇ ${manaAvailable(opp)}${opp.heldMana?` · ${opp.heldMana} open`:" mana"}</span><span>📚 ${opponentDeckSize(opp)}</span></div>
      ${dead?"":`<div class="all-opp-hand" title="Cards in hand by type">🃏 ${handBreakdownText(opp)}</div>`}
      ${attacking?`<div class="all-opp-target">⚔ Attacking ${state.activeResult.target==="player"?"you":getTargetName(state,state.activeResult.target)}</div>`:intent?`<div class="all-opp-intent">Likely next attack: ${escapeHtml(intent)}</div>`:""}
    </div>`;
  });
  html+='</div>';board.innerHTML=html;
  document.getElementById('singleViewBtn').onclick=()=>{state.viewMode="single";const active=oppById(state.activeOppId);state.viewTarget=active&&state.phase==="cpu"?active.index:-1;renderBoardView(state);};
  wirePlaneswalkerControls(board,state);
  board.querySelectorAll('.all-opp-card').forEach(card=>{card.onclick=()=>{state.viewTarget=parseInt(card.dataset.idx,10);state.viewMode="single";renderBoardView(state);};});
}

/* =====================================================================
   DIALOGS (built on #inputOverlay)
   ===================================================================== */
/* One place that sets every part of the input dialog, so labels never leak between dialogs. */
function openInputDialog({title,bodyHtml,okLabel="OK",cancelLabel="Cancel",hideOk=false,hideCancel=false,dismissible=true}){
  const overlay=document.getElementById('inputOverlay');
  document.getElementById('inputTitle').textContent=title;
  document.getElementById('inputBody').innerHTML=bodyHtml;
  document.getElementById('inputActions').className=`input-actions${hideOk?" hide-ok":""}${hideCancel?" hide-cancel":""}`;
  document.getElementById('inputOk').textContent=okLabel;
  document.getElementById('inputCancel').textContent=cancelLabel;
  overlay.dataset.dismissible=dismissible?"true":"false";
  overlay.classList.add('show');
  return document.getElementById('inputBody');
}
/* Acknowledge-only notice (OK). Escape/backdrop also acknowledge. */
function showNotice(title,html){
  return new Promise(res=>{
    inputResolver=res;
    openInputDialog({title,bodyHtml:`<div class="confirm-msg">${html}</div>`,okLabel:"OK",hideCancel:true});
    const done=()=>{closeInput();res(true);};
    document.getElementById('inputOk').onclick=done;
    document.getElementById('inputCancel').onclick=done;
    setTimeout(()=>document.getElementById('inputOk')?.focus(),40);
  });
}
/* Number entry with context. Returns the value, or null when cancelled. */
function askCount(title,html,def,min=0,max=999,okLabel="Confirm"){
  return new Promise(res=>{
    inputResolver=res;
    openInputDialog({title,okLabel,bodyHtml:`${html?`<div class="confirm-msg">${html}</div>`:""}<div class="num-row"><button type="button" id="numDown" aria-label="Decrease">−</button><input type="number" id="numInput" value="${def}" min="${min}" max="${max}" inputmode="numeric"><button type="button" id="numUp" aria-label="Increase">+</button></div>`});
    const inp=document.getElementById('numInput');
    const clamp=v=>Math.max(min,Math.min(max,isNaN(v)?min:v));
    document.getElementById('numDown').onclick=()=>{inp.value=clamp((parseInt(inp.value,10)||0)-1);};
    document.getElementById('numUp').onclick=()=>{inp.value=clamp((parseInt(inp.value,10)||0)+1);};
    const done=()=>{const v=clamp(parseInt(inp.value,10));closeInput();res(v);};
    inp.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();done();}};
    document.getElementById('inputOk').onclick=done;
    document.getElementById('inputCancel').onclick=()=>{closeInput();res(null);};
    setTimeout(()=>{inp.focus();inp.select();},60);
  });
}

/**
 * Combat choice for an attacker aimed at you: blocked (survives), dies in
 * combat, or removed by a spell. Returns "blocked" | "dies" | "removed" | null.
 */
function askCommanderCombatChoice(token){
  const p=token.p||0;
  return new Promise(res=>{
    inputResolver=res;
    openInputDialog({title:`${token.name} (${p}/${token.t||0})`,hideOk:true,bodyHtml:`<div class="combat-choice-body">
      ${cardReferenceListHtml([token],"modal-card-list")}
      <div class="combat-choice-btns">
        <button type="button" class="combat-choice-btn choice-blocked" id="choiceBlocked"><span class="choice-ico">🛡️</span><span class="choice-label">Blocked</span><span class="choice-desc">${hasKeyword(token,"Trample")?"Trample damage may still get through":`Stops ${p} damage · creature survives`}</span></button>
        <button type="button" class="combat-choice-btn choice-dies" id="choiceDies"><span class="choice-ico">💀</span><span class="choice-label">Dies in combat</span><span class="choice-desc">Your blocker destroys it</span></button>
        <button type="button" class="combat-choice-btn choice-removed" id="choiceRemoved"><span class="choice-ico">✦</span><span class="choice-label">Removed by a spell</span><span class="choice-desc">Destroyed or exiled before damage</span></button>
      </div></div>`});
    document.getElementById('inputCancel').onclick=()=>{closeInput();res(null);};
    document.getElementById('choiceBlocked').onclick=()=>{closeInput();res("blocked");};
    document.getElementById('choiceDies').onclick=()=>{closeInput();res("dies");};
    document.getElementById('choiceRemoved').onclick=()=>{closeInput();res("removed");};
  });
}
/** Removal destination popup. Returns "graveyard" | "exile" | null. */
function askCommanderRemovalDestination(token){
  return new Promise(res=>{
    inputResolver=res;
    openInputDialog({title:`Remove ${token.name}`,hideOk:true,bodyHtml:`<div class="combat-choice-body">
      ${cardReferenceListHtml([token],"modal-card-list")}
      <div class="combat-choice-btns">
        <button type="button" class="combat-choice-btn choice-graveyard" id="choiceGraveyard"><span class="choice-ico">☠</span><span class="choice-label">Graveyard</span><span class="choice-desc">Destroyed, sacrificed, or died</span></button>
        <button type="button" class="combat-choice-btn choice-exile" id="choiceExile"><span class="choice-ico">✦</span><span class="choice-label">Exile</span><span class="choice-desc">Removed from the game</span></button>
      </div></div>`});
    document.getElementById('inputCancel').onclick=()=>{closeInput();res(null);};
    document.getElementById('choiceGraveyard').onclick=()=>{closeInput();res("graveyard");};
    document.getElementById('choiceExile').onclick=()=>{closeInput();res("exile");};
  });
}
function askPlaneswalkerName(){
  return new Promise(res=>{
    inputResolver=res;
    openInputDialog({title:"Add Planeswalker",okLabel:"Next",bodyHtml:`<div class="confirm-msg"><label class="cmd-text-field">Planeswalker name<input type="text" id="pwNameInput" placeholder="e.g. Jace, the Mind Sculptor" maxlength="60"></label></div>`});
    const done=()=>{const v=document.getElementById('pwNameInput').value.trim();closeInput();res(v||null);};
    document.getElementById('inputOk').onclick=done;
    document.getElementById('pwNameInput').onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();done();}};
    document.getElementById('inputCancel').onclick=()=>{closeInput();res(null);};
    setTimeout(()=>document.getElementById('pwNameInput')?.focus(),60);
  });
}
function askPlaneswalkerLoyalty(){return askCount("Starting Loyalty","",4,1,99,"Add");}

/**
 * A CPU spell aimed at your board (board wipe, haymaker, removal). Not
 * dismissible: both buttons are real answers. Returns
 * {countered, creaturesLost, creaturesGained, planeswalkerIds}.
 */
function askPlayerRemovalChoice(opp,action){
  const player=gameState.player;
  const isWipe=!!action.boardWipe;
  const name=action.wipeName||action.cardName||action.playerRemoval?.cardName||"Spell";
  const instruction=action.playerRemoval?.instruction||(isWipe?"Destroy all non-commander creatures you control.":"Resolve the spell at the table.");
  const defaultLost=isWipe?player.creatures:(action.type==="removal"&&!(player.planeswalkers||[]).length?Math.min(1,player.creatures):0);
  const defaultGained=/Beast Within/i.test(name)?1:0;
  const pws=player.planeswalkers||[];
  return new Promise(res=>{
    inputResolver=res;
    const body=openInputDialog({title:`${nm(opp)} casts ${name}`,okLabel:"Resolve",cancelLabel:"I countered it",dismissible:false,bodyHtml:`<div class="confirm-msg">
        <p><strong>${escapeHtml(instruction)}</strong></p>
        ${isWipe&&action.boardWipe==="symmetric"?`<p>CPU creatures other than commanders are already destroyed. Countering returns them to the battlefield.</p>`:""}
        <p class="step-hint">Select how many of your creatures were destroyed, or select I countered it.</p>
      </div>
      <div class="cmd-dialog-steppers">
        <div class="inline-stepper"><label>Creatures you lose</label><button type="button" data-dlg="lost" data-delta="-1">−</button><input type="number" id="dlgLost" min="0" max="${player.creatures}" value="${defaultLost}"><button type="button" data-dlg="lost" data-delta="1">+</button></div>
        ${action.type==="removal"?`<div class="inline-stepper"><label>Creature tokens you create</label><button type="button" data-dlg="gained" data-delta="-1">−</button><input type="number" id="dlgGained" min="0" max="20" value="${defaultGained}"><button type="button" data-dlg="gained" data-delta="1">+</button></div>`:""}
        ${action.type==="removal"&&pws.length?`<div class="cmd-dialog-pws"><span>Planeswalker removed</span>${pws.map(pw=>`<label><input type="checkbox" data-dlg-pw="${pw.id}"> ⬡ ${escapeHtml(pw.name)} (${pw.loyalty})</label>`).join("")}</div>`:""}
      </div>`});
    body.querySelectorAll('[data-dlg]').forEach(btn=>{btn.onclick=()=>{
      const inp=btn.parentElement.querySelector('input');const mx=parseInt(inp.max)||0;
      inp.value=Math.max(0,Math.min(mx,(parseInt(inp.value)||0)+parseInt(btn.dataset.delta)));
    };});
    const read=id=>Math.max(0,parseInt(document.getElementById(id)?.value)||0);
    document.getElementById('inputOk').onclick=()=>{
      const choice={countered:false,creaturesLost:Math.min(read('dlgLost'),player.creatures),creaturesGained:read('dlgGained'),
        planeswalkerIds:Array.from(body.querySelectorAll('[data-dlg-pw]:checked')).map(el=>el.dataset.dlgPw)};
      closeInput();res(choice);
    };
    document.getElementById('inputCancel').onclick=()=>{closeInput();res({countered:true});};
  });
}

/* =====================================================================
   GAME LOOP
   ===================================================================== */
let cmdUndoStack=[];
function cmdSnapshot(){if(!gameState)return;cmdUndoStack.push(JSON.stringify(gameState));if(cmdUndoStack.length>20)cmdUndoStack.shift();updateCmdUndoBtn();}
function updateCmdUndoBtn(){const b=document.getElementById('undoBtn');if(b)b.disabled=cmdUndoStack.length===0;}
/* Undo restores the stored turn state and re-shows it. It never re-runs a CPU phase. */
function cmdUndo(){
  if(cmdUndoStack.length===0||transitioning)return;
  gameState=JSON.parse(cmdUndoStack.pop());
  updateCmdUndoBtn();
  logCommander("↶ Reverted to the previous step.");
  saveState();
  resumeTurnFlow();
}

function cleanupCommanderUI(){
  ['commanderLifeHud','commanderLethalStrip','commanderBoardOverlay','cmdConfirmBar','cmdLastTurn'].forEach(id=>{const el=document.getElementById(id);if(el)el.remove();});
  const board=document.getElementById('board');if(board)board.style.display='';
  const playerHud=document.querySelector('.player-hud');if(playerHud)playerHud.style.display='';
  const oldActions=document.querySelector('.turn-actions');if(oldActions)oldActions.style.display='';
  const gameplaySettings=document.getElementById('settingsGameplay');if(gameplaySettings)gameplaySettings.hidden=true;
}

function saveState(){if(gameState)safeSet(SAVE_KEY,JSON.stringify({...gameState,_type:"commander"}));}

function showCommanderGame(){
  if(!gameState)return;
  ensureCommanderEffectState(gameState);
  applyBattlefieldRuleModifiers();
  document.getElementById('modePill').textContent=`Commander Battle`;
  document.getElementById('turnNum').textContent=gameState.turn;
  const active=oppById(gameState.activeOppId);
  document.getElementById('phasePill').textContent=gameState.phase==="cpu"&&active?`${nm(active)}'s Turn`:gameState.phase==="cpu"?"Opponents' Turn":"Your Turn";
  renderLifeHud(gameState);
  const playerHud=document.querySelector('.player-hud');
  if(playerHud)playerHud.style.display='none';
  const cls=document.getElementById('cmdrLifeStat');if(cls)cls.hidden=true;
  renderBoardView(gameState);
  const addBtn=document.getElementById('addWolfBtn');if(addBtn)addBtn.style.display='none';
  const gameplaySettings=document.getElementById('settingsGameplay');if(gameplaySettings)gameplaySettings.hidden=false;
  const undoBtn=document.getElementById('undoBtn');
  if(undoBtn){undoBtn.onclick=cmdUndo;updateCmdUndoBtn();}
  ensureConfirmBar();
}

function ensureConfirmBar(){
  let bar=document.getElementById('cmdConfirmBar');
  if(!bar){
    bar=document.createElement('div');bar.id='cmdConfirmBar';bar.className='cmd-confirm-bar';
    const main=document.querySelector('main.grid');
    if(main)main.parentNode.insertBefore(bar,main.nextSibling);
  }
  const oldActions=document.querySelector('.turn-actions');
  if(oldActions)oldActions.style.display='none';
  return bar;
}
/* Removes the confirm button at once, so a stale handler can't fire while the next window loads. */
function clearConfirmBar(){
  const bar=document.getElementById('cmdConfirmBar');
  if(bar)bar.innerHTML="";
  confirmPreviewFn=null;stepStatusFn=null;
}

/* previewFn(): short outcome text ("Take 7", "Deal 5 · Remove 1") on the confirm button. */
let confirmPreviewFn=null;
let stepStatusFn=null;
function setConfirmButton(text,className,onclick,showEndTurn,previewFn){
  const bar=ensureConfirmBar();
  let html=`<button class="cmd-confirm-btn ${className}" id="cmdConfirmBtn"><span class="cmd-preview" hidden></span><span class="cmd-label">${text}</span><kbd class="cmd-key" aria-hidden="true">Space</kbd></button>`;
  if(showEndTurn)html+=`<button class="cmd-confirm-btn cmd-end-turn-btn ${className}" id="cmdEndTurnBtn">End Turn</button>`;
  bar.innerHTML=html;
  document.getElementById('cmdConfirmBtn').onclick=onclick;
  if(showEndTurn)document.getElementById('cmdEndTurnBtn').onclick=()=>endTurnFromCurrentStep();
  confirmPreviewFn=previewFn||null;
  refreshConfirmPreview();
}
function refreshConfirmPreview(){
  if(!gameState)return; // a deferred refresh can land after restart() cleared the game
  if(stepStatusFn)stepStatusFn();
  const el=document.querySelector('#cmdConfirmBtn .cmd-preview');
  if(!el)return;
  const text=confirmPreviewFn?confirmPreviewFn():"";
  el.textContent=text||"";
  el.hidden=!text;
}
// Inputs live in many panels; one delegated listener keeps the preview current.
document.addEventListener('click',()=>{if(gameState)setTimeout(refreshConfirmPreview,0);});
document.addEventListener('input',()=>{if(gameState)refreshConfirmPreview();});

function joinPreview(parts){return parts.filter(Boolean).join(" · ");}

/* Stepper markup bound to a draft field: <div class="inline-stepper" data-field>. */
function stepperHtml(field,label,value,max){
  return `<div class="inline-stepper" data-field="${field}"><label>${label}</label><button type="button" data-step-delta="-1" aria-label="Decrease ${label}">−</button><input type="number" min="0" ${max!=null?`max="${max}"`:""} value="${value||0}" aria-label="${label}"><button type="button" data-step-delta="1" aria-label="Increase ${label}">+</button></div>`;
}
/* Wires every stepper in `root` to draft[field]; onChange(field) runs after each change. */
function wireDraftSteppers(root,draft,onChange){
  root.querySelectorAll('.inline-stepper[data-field]').forEach(stepper=>{
    const field=stepper.dataset.field;
    const inp=stepper.querySelector('input');
    const set=value=>{
      const max=inp.max!==""&&inp.max!=null?parseInt(inp.max):Infinity;
      const v=Math.max(0,Math.min(isNaN(max)?Infinity:max,value));
      inp.value=v;draft[field]=v;if(onChange)onChange(field);refreshConfirmPreview();
    };
    stepper.querySelectorAll('[data-step-delta]').forEach(btn=>{btn.onclick=()=>set((parseInt(inp.value)||0)+parseInt(btn.dataset.stepDelta));});
    inp.oninput=()=>{draft[field]=Math.max(0,parseInt(inp.value)||0);if(onChange)onChange(field,true);};
    inp.onchange=()=>set(parseInt(inp.value)||0);
  });
}

/* =====================================================================
   TURN RECAP — "since your last turn", shown in your draw step.
   A bookmark (log seq + everyone's life) is taken when you end your turn.
   ===================================================================== */
const RECAP_KEY="mng_recap";
function recapEnabled(){return safeGet(RECAP_KEY)!=="off";}
function setRecapEnabled(on){safeSet(RECAP_KEY,on?"on":"off");updateRecapToggle();}
function updateRecapToggle(){
  const toggle=document.getElementById('recapToggle');
  if(toggle)toggle.checked=recapEnabled();
}
function markRecapStart(){
  const life={player:gameState.player.life};
  gameState.opponents.forEach(opp=>{life[opp.id]=opp.life;});
  gameState.recap={seq:gameState.logSeq||0,life};
}
function buildRecapHtml(){
  const recap=gameState.recap;
  if(!recap)return "";
  const RECAP_MAX_LINES=8;
  const people=[{id:"player",ico:"🗡️",name:"You",life:gameState.player.life},
    ...gameState.opponents.map(opp=>({id:opp.id,ico:opp.ico,name:nm(opp),life:opp.life}))];
  const changes=people.filter(p=>recap.life[p.id]!=null&&recap.life[p.id]!==p.life).map(p=>{
    const delta=p.life-recap.life[p.id];
    return `<span class="recap-life ${delta<0?"down":"up"}${p.id==="player"?" is-you":""}">${p.ico} ${p.name} ${recap.life[p.id]} → <b>${p.life}</b> <small>(${delta>0?"+":"−"}${Math.abs(delta)})</small></span>`;
  });
  const entries=gameState.log.filter(e=>e.seq>recap.seq).reverse();
  const shown=entries.slice(-RECAP_MAX_LINES);
  const hidden=entries.length-shown.length;
  return `<section class="turn-recap" aria-label="Since your last turn">
    <div class="turn-recap-h"><strong>Since your last turn</strong><button type="button" class="btn-quiet" id="recapOpenLog">Full log</button></div>
    <div class="recap-lives">${changes.length?changes.join(""):'<span class="recap-quiet">No life totals changed.</span>'}</div>
    ${shown.length?`<ul class="recap-lines">${hidden>0?`<li class="recap-more">${plural(hidden,"earlier event")} in the log</li>`:""}${shown.map(e=>`<li>${e.msg}</li>`).join("")}</ul>`:""}
  </section>`;
}

function logCommander(msg){
  if(!gameState)return;
  gameState.logSeq=(gameState.logSeq||0)+1;
  gameState.log.unshift({cls:"sys",who:"",msg,turn:gameState.turn,seq:gameState.logSeq});
  if(gameState.log.length>80)gameState.log.pop();
  renderCommanderLog();
}
function renderCommanderLog(){
  const l=document.getElementById('log');if(l){l.innerHTML="";gameState.log.forEach(e=>{const d=document.createElement('div');d.className="log-e "+e.cls;d.innerHTML=(e.who?`<span class="who">${e.who} · T${e.turn}</span>`:"")+e.msg;l.appendChild(d);});}
  const cnt=document.getElementById('logCount');if(cnt)cnt.textContent=gameState.log.length;
}

/* =====================================================================
   SEATS & ROUNDS
   A round runs every seat from gameState.firstSeat in table order. The
   queue (gameState.cpuQueueIds), the active CPU and its stored phase
   result are saved, so reload and undo resume the same window.
   ===================================================================== */
let windowSeq=0;          // increments for every window; stale handlers check it
let transitioning=false;  // a confirm handler is running

function advanceSeat(){
  markCommanderEliminations(gameState);
  const end=checkCommanderBattleEnd(gameState);
  if(end.over){saveState();endCommanderGame(end.won,end.reason);return;}
  let seat=nextCommanderSeat(gameState);
  if(seat===null){
    gameState.turn++;
    beginCommanderRoundQueue(gameState);
    seat=nextCommanderSeat(gameState);
  }
  if(seat==="player"){startPlayerPhase();return;}
  const opp=oppById(seat);
  if(!opp){saveState();return;}
  beginCpuTurn(opp);
}

/* ---------- CPU turn: main → window 1 → combat → window 2 → end step ---------- */
function beginCpuTurn(opp){
  gameState.phase="cpu";gameState.playerStep=null;
  gameState.activeOppId=opp.id;
  const main=executeOpponentMainPhase(opp,allPlayersForTargeting(gameState));
  logCpuActions(opp,main.actions);
  gameState.activeResult={stage:"main",actions:main.actions};
  gameState.responseStage="main";
  responseDraft=null;commanderEffectDraft=null;
  if(isOpponentDead(opp)){finishCpuTurn(opp,false);return;}
  saveState();
  showCpuWindow();
}
function logCpuActions(opp,actions){
  actions.filter(a=>(a.discarded&&a.discarded.length)||a.deckOut).forEach(a=>logCommander(`${nm(opp)}: ${a.detail}`));
  const notable=actions.map(a=>a.label).filter(label=>label&&!/^Draw$|^No draw$|land drop|^Discard/i.test(label));
  if(notable.length)logCommander(`${opp.ico} ${nm(opp)}: ${notable.join(" · ")}.`);
}
function finishCpuTurn(opp,runEndStep=true){
  if(runEndStep&&!isOpponentDead(opp)){
    const end=executeOpponentEndStep(opp);
    logCpuActions(opp,end.actions);
  }
  gameState.activeOppId=null;gameState.activeResult=null;gameState.responseStage=null;
  responseDraft=null;
  advanceSeat();
}
/* Confirm on a CPU window: snapshot first (before any CPU phase runs), resolve, then advance. */
function continueCpuWindow(seq){
  if(seq!==windowSeq||transitioning)return;
  const opp=oppById(gameState.activeOppId),result=gameState.activeResult;
  if(!opp||!result)return;
  transitioning=true;
  clearConfirmBar();
  try{
    cmdSnapshot();
    resolveCpuResponse(opp,result,buildCpuResponse(opp,result));
    responseDraft=null;commanderEffectDraft=null;
    const end=checkCommanderBattleEnd(gameState);
    if(end.over){saveState();endCommanderGame(end.won,end.reason);return;}
    if(result.stage==="main"&&!isOpponentDead(opp)){
      const combat=executeOpponentCombat(opp,allPlayersForTargeting(gameState));
      logCpuActions(opp,combat.actions.filter(a=>a.type!=="attack"));
      if(combat.attackPower>0&&combat.target){
        gameState.activeResult={stage:"combat",target:combat.target,attackPower:combat.attackPower,commanderAttacking:combat.commanderAttacking,
          planeswalkerTargetId:combat.planeswalkerTarget?combat.planeswalkerTarget.id:null,actions:combat.actions};
        gameState.responseStage="combat";
        const pw=cpuAttackPlaneswalker(gameState.activeResult);
        logCommander(`⚔ ${nm(opp)} attacks ${pw?`⬡ ${pw.name}`:getTargetName(gameState,combat.target)==="You"?"you":getTargetName(gameState,combat.target)} for ${combat.attackPower}.`);
        saveState();
        showCpuWindow();
        return;
      }
    }
    finishCpuTurn(opp);
  }finally{transitioning=false;}
}

/* Label for the button that ends this CPU's turn. */
function nextSeatLabel(){
  const queue=(gameState.cpuQueueIds||[]).filter(id=>id==="player"||(oppById(id)&&!isOpponentDead(oppById(id))));
  const next=queue.length?queue[0]:commanderSeatOrder(gameState).find(id=>id==="player"||(oppById(id)&&!isOpponentDead(oppById(id))));
  if(next==="player")return "Continue to Your Turn ▸";
  const opp=oppById(next);
  return opp?`Continue to ${nm(opp)}'s Turn ▸`:"Continue ▸";
}

/* =====================================================================
   CPU RESPONSE WINDOWS
   ===================================================================== */
/* The player's selections for the open window. Keyed by token uid / action key. */
let responseDraft=null;
function ensureResponseDraft(opp,result){
  const key=`${gameState.turn}:${opp.id}:${result.stage}`;
  if(!responseDraft||responseDraft.key!==key){
    responseDraft={key,counters:new Set(),removals:new Map(),blocks:new Map(),combatDeaths:new Set(),
      overrides:{},flashCreatures:0,lifeGained:0,instantDamage:0,instantTarget:opp.id,playerDeaths:0};
  }
  // Drop selections for tokens that left the battlefield (board ✕ Remove, undo).
  const exists=(ownerId,uid)=>{const o=oppById(ownerId);return !!(o&&findTokenByUid(o,uid));};
  responseDraft.removals.forEach((r,uid)=>{if(!exists(r.ownerId,uid))responseDraft.removals.delete(uid);});
  responseDraft.blocks.forEach((b,uid)=>{if(!exists(opp.id,uid))responseDraft.blocks.delete(uid);});
  responseDraft.combatDeaths.forEach(uid=>{if(!exists(opp.id,uid))responseDraft.combatDeaths.delete(uid);});
  responseDraft.counters.forEach(k=>{const a=cpuActionByKey(result,k);if(!a||a.countered)responseDraft.counters.delete(k);});
  if(!oppById(responseDraft.instantTarget)&&responseDraft.instantTarget!=="player")responseDraft.instantTarget=opp.id;
  return responseDraft;
}
function buildCpuResponse(opp,result){
  const d=ensureResponseDraft(opp,result);
  return {
    stage:result.stage,
    counters:Array.from(d.counters),
    removals:Array.from(d.removals.values()),
    blocks:Array.from(d.blocks.values()),
    combatDeaths:Array.from(d.combatDeaths),
    damageToPlayer:d.overrides.damageToPlayer??null,
    commanderDamageToPlayer:d.overrides.commanderDamageToPlayer??null,
    damageToPW:d.overrides.damageToPW??null,
    playerDeaths:d.playerDeaths||0,
    flashCreatures:d.flashCreatures||0,
    lifeGained:d.lifeGained||0,
    instantDamage:d.instantDamage>0?[{targetId:d.instantTarget,amount:d.instantDamage}]:[]
  };
}

function showCpuWindow(){
  const opp=oppById(gameState.activeOppId),result=gameState.activeResult;
  if(!opp||!result){advanceSeat();return;}
  windowSeq++;const seq=windowSeq;
  clearConfirmBar();
  ensureResponseDraft(opp,result);
  gameState.phase="cpu";
  showCommanderGame();
  if(gameState.viewMode==="single")gameState.viewTarget=opp.index;
  renderBoardView(gameState);
  document.getElementById('huntTitle').textContent=`${opp.ico} ${nm(opp)}'s Turn`;
  document.getElementById('declare').className="declare garruk compact-declare";
  document.getElementById('declareTitle').textContent=result.stage==="main"?"Main Phase":"Combat";
  document.getElementById('declareMech').innerHTML='';
  document.getElementById('respTitle').textContent="Your Response";
  renderLastTurnSection(opp,result);
  const pending=result.stage==="main"?pendingPlayerRemovalActions(result):[];
  if(pending.length){
    document.getElementById('declareFlavor').textContent="Resolve the spell aimed at your board.";
    document.getElementById('respGrid').innerHTML=`<div class="context-form commander-form"><div class="context-summary"><span class="context-summary-icon">⚡</span><div><strong>Waiting for your answer</strong><span>Resolve the open dialog to continue.</span></div></div></div>`;
    runPlayerRemovalPrompts(opp,result,pending,seq);
    return;
  }
  renderCpuWindowForm();
}
async function runPlayerRemovalPrompts(opp,result,pending,seq){
  for(const entry of pending){
    if(seq!==windowSeq)return;
    const choice=await askPlayerRemovalChoice(opp,entry.action);
    if(seq!==windowSeq)return;
    cmdSnapshot();
    resolveCpuPlayerRemoval(opp,entry.action,choice);
    saveState();
    renderBoardView(gameState);renderLifeHud(gameState);
  }
  if(seq!==windowSeq)return;
  const end=checkCommanderBattleEnd(gameState);
  if(end.over){endCommanderGame(end.won,end.reason);return;}
  renderLastTurnSection(opp,result);
  renderCpuWindowForm();
}

/* Re-render whatever form is open (after a board removal, theme change, …). */
function refreshActivePanel(){
  if(!gameState||gameState.gameOver||transitioning)return;
  if(document.getElementById('inputOverlay').classList.contains('show'))return;
  if(gameState.phase==="cpu"&&gameState.activeOppId&&gameState.activeResult){
    const opp=oppById(gameState.activeOppId);
    if(opp){renderLastTurnSection(opp,gameState.activeResult);renderCpuWindowForm();}
  }else if(gameState.phase==="player"){
    renderPlayerStepPanel();
  }
}

/* ---------- actions panel above the form ---------- */
function ensureLastTurnSection(){
  let el=document.getElementById('cmdLastTurn');
  if(!el){
    el=document.createElement('div');el.id='cmdLastTurn';el.className='cmd-last-turn';
    const main=document.querySelector('main.grid');
    if(main)main.parentNode.insertBefore(el,main);
  }
  return el;
}
function commanderDeckCardByName(name){
  if(!name||typeof VOLTRON_CARDS==="undefined")return null;
  for(const cards of Object.values(VOLTRON_CARDS)){
    const card=(cards||[]).find(candidate=>candidate.name===name);
    if(card)return card;
  }
  return null;
}
function commanderActionCards(opp,action){
  if(action.cards?.length)return action.cards;
  if(action.type==="attack")return (action.attackerUids||[]).map(uid=>findTokenByUid(opp,uid)).filter(Boolean);
  if(action.tokenUid){const token=findTokenByUid(opp,action.tokenUid);if(token)return [token];}
  if(action.type==="land")return [{name:"Land",ico:"🌲",type:"Land"}];
  if(action.type==="explosive")return [{name:"Fast Mana",ico:"⚙",type:"Artifact",effect:"Mana source"}];
  const cardName=action.gearName||action.wipeName||action.cardName;
  if(!cardName)return [];
  const gear=[...(opp.attachedGear||[]),...(opp.looseGear||[])].find(candidate=>candidate.name===cardName);
  if(gear)return [{...gear,ico:"⚙",type:"Artifact — Equipment"}];
  const card=commanderDeckCardByName(cardName);
  return card?[card]:[];
}
function renderLastTurnSection(opp,result){
  const el=ensureLastTurnSection();
  // Main window: the stored main-phase actions (counterable). Combat: everything so far this turn.
  const isMain=result&&result.stage==="main";
  const actions=isMain?result.actions:(opp.actionSteps||[]);
  if(!actions.length){el.style.display='none';return;}
  el.style.display='';
  const draft=responseDraft;
  const stepsHtml=actions.map((a,i)=>{
    const key=cpuActionKey(a,i);
    const canCounter=isMain&&a.counterable&&!a.countered;
    const selected=canCounter&&draft&&draft.counters.has(key);
    const cards=commanderActionCards(opp,a);
    return `<button type="button" class="lt-step${canCounter?' lt-counterable':''}${selected||a.countered?' lt-countered':''}" data-counter-key="${canCounter?escapeHtml(key):""}"${canCounter?` aria-pressed="${!!selected}"`:" disabled"}><strong>${escapeHtml(a.label)}</strong><span>${escapeHtml(a.detail||"")}</span>${cardReferenceListHtml(cards,"action-card-list")}${a.response?`<span class="lt-response-note">${escapeHtml(a.response.cardName||"Protected")}</span>`:""}${a.lethal?'<span class="lt-lethal-note">Lethal</span>':""}${a.countered?'<span class="lt-countered-note">Countered</span>':canCounter?'<span class="lt-counter-hint">Counter</span>':''}</button>`;
  }).join('');
  el.innerHTML=`<div class="lt-header"><span class="lt-ico">${opp.ico}</span><span class="lt-title">${nm(opp)}'s Actions</span><span class="lt-turn">Round ${gameState.turn} · ${isMain?"Main phase":"Combat"}</span></div><div class="lt-steps">${stepsHtml}</div>`;
  el.querySelectorAll('.lt-counterable').forEach(btn=>{btn.onclick=()=>toggleCounter(btn.dataset.counterKey);});
}
function hideLastTurnSection(){const el=document.getElementById('cmdLastTurn');if(el)el.style.display='none';}
function toggleCounter(key){
  if(!responseDraft||!key)return;
  if(responseDraft.counters.has(key))responseDraft.counters.delete(key);else responseDraft.counters.add(key);
  const opp=oppById(gameState.activeOppId);
  renderLastTurnSection(opp,gameState.activeResult);
  renderCpuWindowForm();
}

/* ---------- the response form ---------- */
function tokenChoiceHtml(owner,token,draft,isAttacker){
  const removal=draft.removals.get(token.uid);
  const blocked=draft.blocks.get(token.uid);
  const died=draft.combatDeaths.has(token.uid);
  const status=removal?(removal.destination==="exile"?"✦":"💀"):died?"💀":blocked?"🛡️":isAttacker?"⚔":"⬡";
  const label=removal?(removal.destination==="exile"?"Exiled":"Destroyed"):died?"Dies":blocked?(blocked.blockerToughness!=null&&hasKeyword(token,"Trample")?`Blocked · toughness ${blocked.blockerToughness}`:"Blocked"):"";
  return `<button type="button" class="kill-btn card-choice${isAttacker?' is-tapped':''}${removal||died?' selected':''}${blocked?' blocked-btn':''}" data-owner="${owner.id}" data-uid="${escapeHtml(token.uid)}" aria-pressed="${!!(removal||blocked||died)}" aria-label="Select ${escapeHtml(token.name)}${label?` (${label})`:""}"><span class="kill-btn-status">${status}</span>${cardReferenceHtml(token)}${label?`<span class="kill-btn-label">${label}</span>`:""}</button>`;
}
function ownerGroupHtml(owner,tokens,draft,role,attackerUids){
  if(!tokens.length)return "";
  const tapped=tokens.filter(t=>t.attacking).length;
  return `<div class="kill-owner-group"><div class="kill-owner-label" style="border-left-color:${oppColor(owner)}">${owner.ico} ${nm(owner)}${role?` (${role})`:""}${tapped?` · ${tapped} tapped`:""}</div>
    <div class="kill-select">${tokens.map(t=>tokenChoiceHtml(owner,t,draft,attackerUids.has(t.uid))).join("")}</div></div>`;
}
function instantTargetsHtml(draft){
  const people=[{id:"player",ico:"🗡️",name:"You"},...aliveOpponents(gameState).map(o=>({id:o.id,ico:o.ico,name:nm(o)}))];
  return `<div class="inline-stepper instant-target-row"><label>Damage target</label><div class="target-buttons instant-dmg-targets">${people.map(p=>`<button type="button" class="target-btn tiny-target ${draft.instantTarget===p.id?"active":""}" data-instant-target="${p.id}" title="${escapeHtml(p.name)}" aria-pressed="${draft.instantTarget===p.id}">${p.ico} ${escapeHtml(p.name)}</button>`).join("")}</div></div>`;
}

function renderCpuWindowForm(){
  const opp=oppById(gameState.activeOppId),result=gameState.activeResult;
  const panel=document.getElementById('respGrid');
  if(!opp||!result||!panel)return;
  const seq=windowSeq;
  const draft=ensureResponseDraft(opp,result);
  const oppName=nm(opp);
  const isCombat=result.stage==="combat";
  const attacksPlayer=isCombat&&result.target==="player"&&result.attackPower>0;
  const defender=isCombat&&!attacksPlayer?oppById(result.target):null;
  const pw=attacksPlayer?cpuAttackPlaneswalker(result):null;
  const attackerUids=new Set(opp.tokens.filter(t=>t.attacking).map(t=>t.uid));

  // Badge row summary
  const plays=(result.actions||[]).filter(a=>a.label&&a.type!=="drawStep"&&a.type!=="land").length;
  document.getElementById('declareFlavor').textContent=isCombat
    ?(attacksPlayer?`Attacking ${pw?`⬡ ${pw.name}`:"you"} for ${result.attackPower}`:`Attacking ${getTargetName(gameState,result.target)} for ${result.attackPower}`)
    :(plays?`${plural(plays,"play")} · ${opp.heldMana?`${opp.heldMana} mana open`:"No mana open"}`:"No plays this phase");

  let html='<div class="context-form commander-form">';
  let stepNo=1;
  const counterables=isCombat?[]:counterableCpuActions(result);
  if(counterables.length){
    html+=responseStepHtml(stepNo++,"counter","Counter a spell","Select each spell you countered.",
      `<div class="counter-chips">${counterables.map(({action,key})=>`<button type="button" class="counter-chip${draft.counters.has(key)?" active":""}" data-counter-key="${escapeHtml(key)}" aria-pressed="${draft.counters.has(key)}">${escapeHtml(action.label)}</button>`).join("")}</div>`,
      "response-counter");
  }
  let removeBody=ownerGroupHtml(opp,opp.tokens,draft,defender?"attacker":"",attackerUids);
  if(defender&&!isOpponentDead(defender))removeBody+=ownerGroupHtml(defender,defender.tokens,draft,"defender",attackerUids);
  if(removeBody){
    const hint=attacksPlayer?"Select an attacker to mark it blocked, dead, or removed. Select any other creature you removed."
      :defender?`${oppName} is attacking ${nm(defender)}. Select any creature you removed before combat damage.`
      :"Select any creature you removed at instant speed.";
    html+=responseStepHtml(stepNo++,"remove",attacksPlayer?"Block or remove creatures":"Remove creatures",hint,removeBody,"precombat-removal");
  }
  if(attacksPlayer){
    const raw=computeCpuAttackOnPlayer(opp,result,Object.assign(buildCpuResponse(opp,result),{damageToPlayer:null,commanderDamageToPlayer:null,damageToPW:null}));
    const val=(field,computed)=>draft.overrides[field]??computed;
    const commanderAttacking=raw.attackers.some(t=>t.kind==="commander");
    const title=pw?`${oppName} attacks ⬡ ${escapeHtml(pw.name)} (${pw.loyalty}) for ${result.attackPower}`:`${oppName} attacks you for ${result.attackPower}`;
    const edited=Object.keys(draft.overrides).length>0;
    html+=responseStepHtml(stepNo++,"damage",title,
      `Calculated from unblocked attackers${pw?" and aimed at your planeswalker":""}. Adjust for effects the app does not track.${edited?` <button type="button" class="btn-quiet" id="resetDamageBtn">Use calculated values</button>`:""}`,
      `<div class="commander-player-actions">
        ${pw?stepperHtml("damageToPW",`Damage to ⬡ ${escapeHtml(pw.name)}`,val("damageToPW",raw.pwDamage)):""}
        ${stepperHtml("damageToPlayer","Damage to you",val("damageToPlayer",raw.playerDamage))}
        ${commanderAttacking&&!pw?stepperHtml("commanderDamageToPlayer","Commander damage to you",val("commanderDamageToPlayer",raw.commanderDamage)):""}
        ${gameState.player.creatures>0?stepperHtml("playerDeaths","Your creatures that died",draft.playerDeaths,gameState.player.creatures):""}
      </div>`,attackIsLethal(result)?"enemy-combat is-lethal":"enemy-combat");
  }
  if(stepNo===1)html+=`<div class="context-summary"><span class="context-summary-icon">✓</span><div><strong>No response needed</strong><span>${oppName} made no plays you can respond to.</span></div></div>`;

  html+=`<div class="context-section response-extras"><div class="context-section-title">Your instant-speed responses</div>
    <div class="commander-player-actions">
      ${stepperHtml("flashCreatures","Creatures you flashed in",draft.flashCreatures)}
      ${stepperHtml("lifeGained","Life you gained",draft.lifeGained)}
      ${stepperHtml("instantDamage","Damage you dealt",draft.instantDamage)}
      ${instantTargetsHtml(draft)}
    </div></div>`;
  html+='<div id="cpuResponsePlayerAction"></div></div>';
  panel.innerHTML=html;

  wireDraftSteppers(panel.querySelector('.response-extras'),draft);
  const damageStep=panel.querySelector('.response-step[data-step="damage"]');
  if(damageStep){
    damageStep.querySelectorAll('.inline-stepper[data-field]').forEach(stepper=>{
      const field=stepper.dataset.field;
      if(field==="playerDeaths")return;
      // Edits become manual overrides; the rest stays calculated.
      wireDraftSteppers({querySelectorAll:()=>[stepper]},draft.overrides);
    });
    const deaths=damageStep.querySelector('.inline-stepper[data-field="playerDeaths"]');
    if(deaths)wireDraftSteppers({querySelectorAll:()=>[deaths]},draft);
    const reset=panel.querySelector('#resetDamageBtn');
    if(reset)reset.onclick=()=>{draft.overrides={};renderCpuWindowForm();};
  }
  panel.querySelectorAll('[data-instant-target]').forEach(btn=>{btn.onclick=()=>{draft.instantTarget=btn.dataset.instantTarget;renderCpuWindowForm();};});
  panel.querySelectorAll('[data-counter-key]').forEach(chip=>{chip.onclick=()=>toggleCounter(chip.dataset.counterKey);});
  panel.querySelectorAll('.kill-btn[data-uid]').forEach(btn=>{
    btn.onclick=()=>selectResponseToken(oppById(btn.dataset.owner),btn.dataset.uid,attacksPlayer&&attackerUids.has(btn.dataset.uid));
  });
  renderPlayerActionPanel(panel.querySelector('#cpuResponsePlayerAction'),{
    contextKey:`cpu:${responseDraft.key}`,
    help:"Resolve an instant-speed action, then continue the opponent's turn.",
    onResolved:()=>{if(seq===windowSeq)renderCpuWindowForm();}
  });

  const continueLabel=result.stage==="main"?"Continue to Combat ▸":nextSeatLabel();
  setConfirmButton(continueLabel,"garruk",()=>continueCpuWindow(seq),false,()=>cpuWindowPreviewText(opp,result));
  stepStatusFn=()=>{
    const r=buildCpuResponse(opp,result);
    setStepStatus(panel,"counter",r.counters.length?`${r.counters.length} countered`:"",r.counters.length>0);
    const removed=r.removals.length+r.combatDeaths.length;
    setStepStatus(panel,"remove",joinPreview([removed&&`${removed} removed`,r.blocks.length&&`${r.blocks.length} blocked`]),removed+r.blocks.length>0);
    if(attacksPlayer){
      const preview=previewCpuResponse(opp,result,r).attack;
      if(preview)setStepStatus(panel,"damage",preview.pwDamage&&!preview.playerDamage?`⬡ ${preview.pwDamage}`:`Take ${preview.playerDamage}`,preview.playerDamage+preview.pwDamage<result.attackPower);
    }
  };
  refreshConfirmPreview();
}
function attackIsLethal(result){return !!(result&&(result.actions||[]).some(a=>a.type==="attack"&&a.lethal));}
function cpuWindowPreviewText(opp,result){
  const r=buildCpuResponse(opp,result);
  const p=previewCpuResponse(opp,result,r);
  const parts=[p.countered&&`Counter ${p.countered}`,p.removed&&`Remove ${p.removed}`,p.blocked&&`Block ${p.blocked}`];
  if(p.attack){
    if(p.attack.pwDamage)parts.push(`⬡ ${p.attack.planeswalker?nm(p.attack.planeswalker):"Planeswalker"} takes ${p.attack.pwDamage}`);
    if(p.attack.playerDamage||!p.attack.pwDamage)parts.push(`Take ${p.attack.playerDamage}${p.attack.commanderDamage?` (${p.attack.commanderDamage} commander)`:""}`);
    if(p.attack.prevented)parts.push(`${p.attack.prevented} prevented`);
  }
  if(p.cpuCombat)parts.push(`${nm(p.cpuCombat.defender)} takes ${p.cpuCombat.damage}${p.cpuCombat.blockerDeaths||p.cpuCombat.attackerDeaths?` · ${plural(p.cpuCombat.blockerDeaths+p.cpuCombat.attackerDeaths,"creature")} die`:""}`);
  if(p.flash)parts.push(`+${plural(p.flash,"creature")}`);
  if(p.lifeGained)parts.push(`+${p.lifeGained} life`);
  if(p.instantDamage){const t=r.instantDamage[0];parts.push(`Deal ${p.instantDamage} to ${t.targetId==="player"?"you":getTargetName(gameState,t.targetId)}`);}
  return joinPreview(parts);
}
/* Select / deselect a creature in the response form. */
async function selectResponseToken(owner,uid,isAttackerOnYou){
  if(!owner||!responseDraft)return;
  const draft=responseDraft;
  const token=findTokenByUid(owner,uid);
  if(!token)return;
  if(draft.removals.has(uid)||draft.blocks.has(uid)||draft.combatDeaths.has(uid)){
    draft.removals.delete(uid);draft.blocks.delete(uid);draft.combatDeaths.delete(uid);
    draft.overrides={};renderCpuWindowForm();return;
  }
  let choice="removed";
  if(isAttackerOnYou){choice=await askCommanderCombatChoice(token);if(!choice)return;}
  if(choice==="blocked"){
    let blockerToughness=null;
    if(hasKeyword(token,"Trample")){
      blockerToughness=await askCount(`Blocking ${nm(token)}`,`<strong>${escapeHtml(token.name)}</strong> has trample (${token.p} power). Enter your blocker's toughness; excess damage tramples over to you.`,2,0,99);
      if(blockerToughness==null)return;
    }
    draft.blocks.set(uid,{uid,blockerToughness});
  }else if(choice==="dies"){
    draft.combatDeaths.add(uid);
  }else{
    const destination=token.kind==="commander"?"graveyard":await askCommanderRemovalDestination(token);
    if(!destination)return;
    cmdSnapshot();
    const response=cpuProtectAgainstRemoval(owner,uid);
    saveState();
    if(response){
      renderBoardView(gameState);renderLifeHud(gameState);renderCpuWindowForm();
      await showNotice("Removal answered",`<strong>${escapeHtml(response.label)}</strong>.<br><br>Your removal has no effect.`);
      return;
    }
    draft.removals.set(uid,{ownerId:owner.id,uid,destination,checked:true});
  }
  draft.overrides={};
  renderCpuWindowForm();
}

/* =====================================================================
   CREATE PLAYER ACTION — one panel for main phases, combat, and CPU windows
   ===================================================================== */
let playerActionContextKey=null;
function playerActionDraft(contextKey){
  if(playerActionContextKey!==contextKey||!commanderEffectDraft){
    commanderEffectDraft={scope:"target",action:"discard",count:1,all:false,cardType:"creature",targetId:null,choices:{},selections:{},actionOpen:false};
    playerActionContextKey=contextKey;
  }
  commanderEffectDraft.choices=commanderEffectDraft.choices||{};
  commanderEffectDraft.selections=commanderEffectDraft.selections||{};
  if(commanderEffectDraft.action==="tokens")commanderEffectDraft.scope="each";
  return commanderEffectDraft;
}
function permanentKeyForOption(option){return option.uid?`uid:${option.uid}`:option.key;}
function playerActionHtml(draft,effect,help){
  const isGlobal=effect.action==="exileGraveyards";
  const isTokens=effect.action==="tokens";
  const needsCardType=isPermanentPlayerAction(effect);
  const isAllAmount=!isGlobal&&effect.all;
  const scopeOptions=PLAYER_ACTION_SCOPES.map(s=>`<option value="${s.value}" ${s.value===draft.scope?"selected":""}>${s.label}</option>`).join("");
  const actionOptions=PLAYER_ACTIONS.map(a=>`<option value="${a.value}" ${a.value===draft.action?"selected":""}>${a.label}</option>`).join("");
  const cardTypeOptions=PLAYER_ACTION_CARD_TYPES.map(t=>`<option value="${t}" ${t===draft.cardType?"selected":""}>${t[0].toUpperCase()+t.slice(1)}</option>`).join("");
  const targets=effectTargets(gameState,effect,draft.targetId);
  let html=`<details class="context-disclosure player-action-disclosure"${draft.actionOpen?" open":""}><summary><span>Create Player Action ${helpTip("Resolve a spell or ability you control that affects players: discard, mill, destroy, bounce, draw, life, poison, or tokens. CPUs respond automatically.")}</span><small></small></summary><div class="context-disclosure-body"><div class="context-section player-effect-section">
    <div class="player-action-grid">
      ${isGlobal||isTokens?"":`<label>Scope<select data-pa="scope">${scopeOptions}</select></label>`}
      <label>Action<select data-pa="action">${actionOptions}</select></label>
      ${isGlobal?"":`<label>${isTokens?"Tokens":"Amount"}<div class="inline-stepper player-action-count-stepper${isAllAmount?" all-selected":""}"><button type="button" data-pa-count="-1" ${isAllAmount?"disabled":""} aria-label="Decrease amount">−</button><input type="number" min="1" max="99" value="${isAllAmount?"":effect.count}" data-pa="count" ${isAllAmount?"disabled":""} aria-label="Amount"><button type="button" data-pa-count="1" ${isAllAmount?"disabled":""} aria-label="Increase amount">+</button></div>${isTokens||effect.action==="poison"?"":`<span class="player-action-all-toggle"><input type="checkbox" data-pa="all" ${isAllAmount?"checked":""} aria-label="All">All</span>`}</label>`}
      ${needsCardType?`<label>Card type<select data-pa="cardType">${cardTypeOptions}</select></label>`:""}
    </div>
    <span class="player-effect-help">${isGlobal?"Moves every tracked graveyard card to its owner’s exile zone and clears all graveyard totals.":isTokens?"Adds creature tokens to your creature count.":escapeHtml(help)}</span>
    <div class="player-effect-preview"><strong>${describePlayerEffect(effect)}</strong></div>`;
  if(effect.scope==="target"&&!isGlobal&&!isTokens){
    html+=`<div class="target-buttons player-effect-targets">${[gameState.player,...aliveOpponents(gameState)].map(target=>`<button type="button" class="target-btn ${draft.targetId===target.id?"active":""}" data-action-target-id="${target.id}" aria-pressed="${draft.targetId===target.id}">${target.id==="player"?"🗡️":target.ico} ${effectTargetName(target)}</button>`).join("")}</div>`;
  }
  if(effect.action==="reanimate"&&targets.length>0){
    html+=`<div class="player-effect-choices"><span>${effect.all?"Select every available creature card":`Select up to ${plural(effect.count,"creature card")}`}; every selected card returns to the battlefield under your control.</span>`;
    targets.forEach(owner=>{
      const cards=graveyardCreatureCards(owner);
      html+=`<div class="player-effect-owner"><span>${owner.id==="player"?"🗡️":owner.ico} ${effectTargetName(owner)}'s graveyard</span>${cards.length?`<div class="kill-select">${cards.map(card=>`<button type="button" class="kill-btn card-choice ${(draft.choices[owner.id]||[]).includes(card.id)?"selected":""}" data-reanimate-owner="${owner.id}" data-reanimate-card="${escapeHtml(card.id)}" aria-label="Select ${escapeHtml(card.name)}">${cardReferenceHtml(card)}</button>`).join("")}</div>`:"<small>No recorded creature cards.</small>"}</div>`;
    });
    html+="</div>";
  }
  if(needsCardType&&targets.length>0){
    const cpuTargets=targets.filter(t=>t.id!=="player");
    html+='<div class="player-effect-choices">';
    // A single CPU target: you may select the exact permanents (keyed by uid).
    if(effect.scope==="target"&&cpuTargets.length===1&&effect.action!=="sacrifice"){
      const target=cpuTargets[0];
      const options=opponentPermanentOptions(target,effect.cardType);
      const selected=draft.selections[target.id]||[];
      const limit=playerActionAmount(effect,target);
      html+=`<span>Select up to ${plural(limit,effect.cardType)} you target. With no selection, ${nm(target)} chooses its least valuable.</span>`;
      html+=options.length?`<div class="counter-chips">${options.map(option=>{const key=permanentKeyForOption(option);const on=selected.includes(key);return `<button type="button" class="counter-chip${on?" active":""}" data-perm-key="${escapeHtml(key)}" aria-pressed="${on}">${escapeHtml(option.label)}</button>`;}).join("")}</div>`:`<small>${nm(target)} has no ${effect.cardType} to select.</small>`;
    }else if(cpuTargets.length){
      html+=`<span>Each affected CPU ${effect.action==="sacrifice"?"sacrifices":"loses"} its least valuable ${effect.cardType} automatically.</span>`;
    }
    if(targets.some(t=>t.id==="player"))html+=`<div class="player-effect-manual">🗡️ Complete your own ${effect.all?`all ${effect.cardType}s`:plural(effect.count,effect.cardType)} at the table, then confirm.</div>`;
    html+="</div>";
  }
  const ready=canResolvePlayerEffect(effect,draft);
  return html+`<button type="button" class="target-btn player-effect-resolve" data-pa-resolve ${ready?"":"disabled"}>Resolve action</button></div></div></details>`;
}
/* opts: {contextKey, help, onResolved} */
function renderPlayerActionPanel(host,opts){
  if(!host)return;
  const draft=playerActionDraft(opts.contextKey);
  const effect=createPlayerEffect(draft);
  host.innerHTML=playerActionHtml(draft,effect,opts.help||"");
  const rerender=()=>renderPlayerActionPanel(host,opts);
  const disclosure=host.querySelector(".player-action-disclosure");
  if(disclosure)disclosure.ontoggle=()=>{draft.actionOpen=disclosure.open;};
  const update=(field,value,resetTarget)=>{
    const previousAction=draft.action;
    draft[field]=value;
    if(field==="action"){
      draft.count=1;draft.all=false;
      if(value==="tokens")draft.scope="each";
      else if(previousAction==="tokens")draft.scope="target";
    }
    draft.choices={};draft.selections={};
    if(resetTarget)draft.targetId=null;
    rerender();
  };
  host.querySelector('[data-pa="scope"]')?.addEventListener('change',e=>update("scope",e.target.value,true));
  host.querySelector('[data-pa="action"]')?.addEventListener('change',e=>update("action",e.target.value));
  host.querySelector('[data-pa="cardType"]')?.addEventListener('change',e=>update("cardType",e.target.value));
  host.querySelector('[data-pa="all"]')?.addEventListener('change',e=>update("all",e.target.checked));
  const countInput=host.querySelector('[data-pa="count"]');
  if(countInput){
    countInput.onchange=()=>update("count",Math.max(1,parseInt(countInput.value)||1));
    host.querySelectorAll('[data-pa-count]').forEach(btn=>{btn.onclick=()=>update("count",Math.max(1,(parseInt(countInput.value)||1)+parseInt(btn.dataset.paCount)));});
  }
  host.querySelectorAll('[data-action-target-id]').forEach(btn=>{btn.onclick=()=>{draft.targetId=btn.dataset.actionTargetId;draft.choices={};draft.selections={};rerender();};});
  host.querySelectorAll('[data-reanimate-owner]').forEach(btn=>{btn.onclick=()=>{
    const owner=btn.dataset.reanimateOwner,cardId=btn.dataset.reanimateCard;
    const selected=draft.choices[owner]||[];
    draft.choices[owner]=selected.includes(cardId)?selected.filter(id=>id!==cardId):[...selected,cardId];
    rerender();
  };});
  host.querySelectorAll('[data-perm-key]').forEach(btn=>{btn.onclick=()=>{
    const target=draft.targetId;const key=btn.dataset.permKey;
    const selected=draft.selections[target]||[];
    const opp=oppById(target);
    const limit=opp?playerActionAmount(effect,opp):1;
    if(selected.includes(key))draft.selections[target]=selected.filter(k=>k!==key);
    else if(selected.length<limit)draft.selections[target]=[...selected,key];
    rerender();
  };});
  host.querySelector('[data-pa-resolve]')?.addEventListener('click',async()=>{
    if(!canResolvePlayerEffect(effect,draft))return;
    const resolved=await confirmPlayerAction(effect,draft);
    if(resolved&&opts.onResolved)opts.onResolved();
    else if(resolved)rerender();
  });
}
/* Confirms with the engine's dialog text, then resolves (CPUs may answer removal). */
async function confirmPlayerAction(effect,draft){
  if(!["destroy","exile","bounce"].includes(effect.action))return confirmAndResolvePlayerEffect(effect,draft,askConfirm);
  const dialog=playerEffectConfirmation(effect,draft);
  if(!await askConfirm(dialog.title,dialog.html,dialog.confirmLabel))return false;
  const result=resolvePlayerEffectWithResponses(effect,draft);
  if(result.responses.length)await showNotice("CPU responses",result.responses.map(r=>`<p><strong>${escapeHtml(r.label)}</strong>.</p>`).join("")+"<p>Those targets are not affected.</p>");
  return true;
}

/* =====================================================================
   BATTLEFIELD RULES PANEL
   ===================================================================== */
function battlefieldRuleTypeOptions(selected){
  const groups={};
  BATTLEFIELD_RULE_TYPES.forEach(rule=>{(groups[rule.group]||=[]).push(rule);});
  return Object.entries(groups).map(([group,rules])=>`<optgroup label="${group}">${rules.map(rule=>`<option value="${rule.value}" ${rule.value===selected?"selected":""}>${rule.label}</option>`).join("")}</optgroup>`).join("");
}
function battlefieldRuleHelp(kind){
  return {
    artifactCastBan:"Stops CPUs from casting equipment, fast mana, and modeled artifact spells.",
    noncreatureCastBan:"Stops CPUs from casting noncreature spells while this rule remains active.",
    cpuSpellLimit:"Each CPU can cast only one modeled spell on its turn. Land drops and activated abilities remain available.",
    cpuCreatureAttackBan:"CPU creatures remain unable to declare attacks while this rule remains active.",
    cpuCreatureBlockBan:"CPU creatures cannot be assigned as blockers while this rule remains active.",
    noncreatureTax:"The added cost applies to every modeled CPU noncreature spell, but not activated abilities such as equip.",
    creatureTax:"The added cost applies to commanders and modeled CPU creature spells.",
    preventCpuDamage:"Consumes prevention automatically as CPUs deal damage anywhere on the Commander battlefield.",
    cpuGraveyardExile:"Modeled CPU cards that would enter a graveyard are sent to exile instead. The existing commander-zone handling remains unchanged.",
    cpuDamageReduction:"Reduces the modeled total of CPU combat damage before one-shot prevention is consumed.",
    cpuCreaturePT:"Changes every CPU creature's power and toughness while this rule remains active.",
    cpuCreatureMinusPT:"Reduces every CPU creature's power and toughness by the specified positive values while this rule remains active.",
    cpuCreaturePowerCap:"Caps every CPU creature's power after its other modeled power and toughness changes are applied.",
    cpuCreatureKeywordLoss:"Removes modeled combat keywords such as trample, deathtouch, indestructible, and first strike while this rule remains active."
  }[kind]||"";
}
function battlefieldRuleAmountLabel(kind){
  return {noncreatureTax:"Additional mana",creatureTax:"Additional mana",preventCpuDamage:"Damage to prevent",cpuDamageReduction:"Damage reduction",cpuCreaturePowerCap:"Maximum power"}[kind]||"Amount";
}
let battlefieldRulesOpen=false;
function buildBattlefieldRulesPanel(){
  const draft=battlefieldRuleDraft;
  const needsAmount=["noncreatureTax","creatureTax","preventCpuDamage","cpuDamageReduction","cpuCreaturePowerCap"].includes(draft.kind);
  const needsStats=["cpuCreaturePT","cpuCreatureMinusPT"].includes(draft.kind);
  const statsAreReductions=draft.kind==="cpuCreatureMinusPT";
  const statMinimum=statsAreReductions?0:-20;
  const powerValue=statsAreReductions?Math.max(0,parseInt(draft.power)||0):parseInt(draft.power)||0;
  const toughnessValue=statsAreReductions?Math.max(0,parseInt(draft.toughness)||0):parseInt(draft.toughness)||0;
  const amountMinimum=draft.kind==="cpuCreaturePowerCap"?0:1;
  const amountValue=Math.max(amountMinimum,parseInt(draft.amount)||amountMinimum);
  const active=activeBattlefieldRules();
  const activeHtml=active.length
    ?active.map(rule=>`<li class="battlefield-rule-item"><div><strong>${escapeHtml(rule.sourceName||"Unnamed battlefield rule")}</strong><span>${escapeHtml(battlefieldRuleLabel(rule))}</span></div><button type="button" class="battlefield-rule-remove" data-rule-remove-id="${rule.id}">Remove</button></li>`).join("")
    :"<li class=\"battlefield-rule-empty\">No persistent CPU rules are active.</li>";
  return `<details class="rules-disclosure" id="battlefieldRulesDisclosure"${battlefieldRulesOpen?" open":""}><summary><span>🛡 Battlefield Rules ${helpTip("Ongoing effects you control that restrict the CPUs, such as Stony Silence. CPUs follow them automatically.")}${active.length?` <em class="rules-count">${active.length} active</em>`:""}</span><small></small></summary>
  <section class="battlefield-rules-panel" aria-label="Battlefield Rules and Permissions">
    <div class="battlefield-rules-heading"><small>Track effects on your own permanents at the table.</small></div>
    <div class="battlefield-rule-builder">
      <div class="player-action-grid">
        <label>Rule<select id="battlefieldRuleType">${battlefieldRuleTypeOptions(draft.kind)}</select></label>
        <label>Source name (optional)<input type="text" id="battlefieldRuleSource" maxlength="80" value="${escapeHtml(draft.sourceName)}" placeholder="e.g. Stony Silence"></label>
        <label>Source type<select id="battlefieldRuleSourceType"><option value="Enchantment" ${draft.sourceType==="Enchantment"?"selected":""}>Enchantment</option><option value="Artifact" ${draft.sourceType==="Artifact"?"selected":""}>Artifact</option><option value="Rule" ${draft.sourceType==="Rule"?"selected":""}>Other / rule</option></select></label>
        ${needsAmount?`<label>${battlefieldRuleAmountLabel(draft.kind)}<input type="number" id="battlefieldRuleAmount" min="${amountMinimum}" max="99" value="${amountValue}"></label>`:""}
        ${needsStats?`<label>${statsAreReductions?"Power reduction":"Power"}<input type="number" id="battlefieldRulePower" min="${statMinimum}" max="20" value="${powerValue}"></label><label>${statsAreReductions?"Toughness reduction":"Toughness"}<input type="number" id="battlefieldRuleToughness" min="${statMinimum}" max="20" value="${toughnessValue}"></label>`:""}
      </div>
      <p class="player-effect-help">${battlefieldRuleHelp(draft.kind)}</p>
      <button type="button" class="target-btn battlefield-rule-add" id="addBattlefieldRule">Add persistent rule</button>
    </div>
    <div class="battlefield-rule-active"><span>Active rules</span><ul>${activeHtml}</ul></div>
  </section></details>`;
}
function wireBattlefieldRulesPanel(panel,rerender){
  const disclosure=panel.querySelector("#battlefieldRulesDisclosure");
  if(disclosure)disclosure.ontoggle=()=>{battlefieldRulesOpen=disclosure.open;};
  const updateDraft=()=>{
    battlefieldRuleDraft.kind=panel.querySelector("#battlefieldRuleType")?.value||battlefieldRuleDraft.kind;
    battlefieldRuleDraft.sourceName=panel.querySelector("#battlefieldRuleSource")?.value||"";
    battlefieldRuleDraft.sourceType=panel.querySelector("#battlefieldRuleSourceType")?.value||"Enchantment";
    const amountInput=panel.querySelector("#battlefieldRuleAmount");
    if(amountInput)battlefieldRuleDraft.amount=Math.max(parseInt(amountInput.value)||0,parseInt(amountInput.min)||0);
    const isReduction=battlefieldRuleDraft.kind==="cpuCreatureMinusPT";
    battlefieldRuleDraft.power=Math.max(parseInt(panel.querySelector("#battlefieldRulePower")?.value)||0,isReduction?0:-20);
    battlefieldRuleDraft.toughness=Math.max(parseInt(panel.querySelector("#battlefieldRuleToughness")?.value)||0,isReduction?0:-20);
  };
  panel.querySelector("#battlefieldRuleType")?.addEventListener("change",()=>{updateDraft();rerender();});
  panel.querySelector("#addBattlefieldRule")?.addEventListener("click",()=>{updateDraft();cmdSnapshot();addBattlefieldRule(battlefieldRuleDraft);saveState();showCommanderGame();rerender();});
  panel.querySelectorAll("[data-rule-remove-id]").forEach(button=>button.addEventListener("click",()=>{
    cmdSnapshot();removeBattlefieldRule(button.dataset.ruleRemoveId,"was removed manually");saveState();showCommanderGame();rerender();
  }));
}

/* =====================================================================
   PLAYER PHASE — Draw → Main Phase → Combat → Main Phase 2 / End
   gameState.playerStep is saved after every step.
   ===================================================================== */
let playerDraft=null;   // {key, creaturesPlayed, cardsPlayed, lifeGained}
let attackDraft=null;   // {key, mode:"builder"|"review"|"manual", rows, outcome, manual}
function playerStepDraft(){
  const key=`${gameState.turn}:${gameState.playerStep}`;
  if(!playerDraft||playerDraft.key!==key)playerDraft={key,creaturesPlayed:0,cardsPlayed:0,lifeGained:0};
  return playerDraft;
}

function startPlayerPhase(){
  gameState.phase="player";
  gameState.playerStep="draw";
  gameState.activeOppId=null;gameState.activeResult=null;gameState.responseStage=null;
  playerDraft=null;attackDraft=null;commanderEffectDraft=null;
  saveState();
  showPlayerStep();
}
function showPlayerStep(){
  windowSeq++;
  clearConfirmBar();
  hideLastTurnSection();
  showCommanderGame();
  document.getElementById('phasePill').textContent="Your Turn";
  document.getElementById('declare').className="declare player compact-declare";
  renderPlayerStepPanel();
}
function renderPlayerStepPanel(){
  switch(gameState.playerStep){
    case "main1": showMainStep(); break;
    case "combat": showCombatStep(); break;
    case "end": showMainTwoStep(); break;
    default: showDrawStep();
  }
}
function setPlayerStepHeader(stepLabel,instructions,responseTitle){
  document.getElementById('huntTitle').textContent="🗡️ Your Turn";
  document.getElementById('declareTitle').textContent=stepLabel;
  document.getElementById('declareFlavor').textContent=instructions;
  document.getElementById('declareMech').innerHTML='';
  document.getElementById('respTitle').textContent=responseTitle;
}
/* Moves to the next step: snapshot → apply → save. */
function goToPlayerStep(next,apply){
  if(transitioning)return;
  transitioning=true;clearConfirmBar();
  try{
    cmdSnapshot();
    if(apply)apply();
    const end=checkCommanderBattleEnd(gameState);
    if(end.over){saveState();endCommanderGame(end.won,end.reason);return;}
    gameState.playerStep=next;
    playerDraft=null;commanderEffectDraft=null;
    saveState();
  }finally{transitioning=false;}
  showPlayerStep();
}

/* --- DRAW STEP --- */
function showDrawStep(){
  const p=gameState.player;
  const skip=playerSkipsFirstDraw(gameState);
  setPlayerStepHeader("Draw Step",skip?"Untap and resolve upkeep triggers. You skip your first draw.":"Untap your permanents, resolve upkeep triggers, then draw a card.","Upkeep & Draw");
  const panel=document.getElementById('respGrid');
  const recapHtml=recapEnabled()?buildRecapHtml():"";
  panel.innerHTML=`<div class="context-form commander-form">${recapHtml}
    <div class="context-summary draw-summary"><span class="context-summary-icon">🃏</span><div><strong>${skip?"No draw this turn":"Draw for the turn"}</strong><span>${skip?"The first player in a two-player game skips the first draw.":`Hand ${p.handSize||0} → ${(p.handSize||0)+1} · Library ${p.librarySize||0} → ${Math.max(0,(p.librarySize||0)-1)}`}</span></div></div>
  </div>`;
  const openLogBtn=panel.querySelector('#recapOpenLog');
  if(openLogBtn&&typeof openLog==="function")openLogBtn.onclick=openLog;
  setConfirmButton(skip?"Continue to Main Phase ▸":"I Drew a Card ▸","",()=>goToPlayerStep("main1",()=>playerDrawStep(gameState)),true);
}

/* --- MAIN PHASES --- */
function mainStepPanelHtml(draft,extraHtml){
  return `<div class="context-form commander-form"><div class="context-section"><div class="commander-player-actions">
    ${stepperHtml("creaturesPlayed","Creatures you played",draft.creaturesPlayed)}
    ${stepperHtml("cardsPlayed","Cards played from hand",draft.cardsPlayed,gameState.player.handSize||0)}
    ${stepperHtml("lifeGained","Life you gained",draft.lifeGained)}
  </div>${extraHtml||""}</div>${buildBattlefieldRulesPanel()}<div id="mainPlayerAction"></div></div>`;
}
function mainStepPreview(draft){
  return joinPreview([draft.creaturesPlayed>0&&`+${plural(draft.creaturesPlayed,"creature")}`,draft.cardsPlayed>0&&`−${plural(draft.cardsPlayed,"card")} in hand`,draft.lifeGained>0&&`+${draft.lifeGained} life`]);
}
function renderMainPanel(rerender,extraHtml){
  const draft=playerStepDraft();
  const panel=document.getElementById('respGrid');
  panel.innerHTML=mainStepPanelHtml(draft,extraHtml);
  wireDraftSteppers(panel.querySelector('.commander-player-actions'),draft);
  wireBattlefieldRulesPanel(panel,rerender);
  renderPlayerActionPanel(panel.querySelector('#mainPlayerAction'),{contextKey:`player:${draft.key}`,
    help:"All resolves to each target’s available amount. Noncreature permanents you control remain a table action.",onResolved:rerender});
  return draft;
}
function showMainStep(){
  setPlayerStepHeader("Main Phase","Play lands, cast spells, and record what changed.","Your Actions");
  const draft=renderMainPanel(showMainStep);
  setConfirmButton("Go to Combat ▸","",()=>goToPlayerStep("combat",()=>applyPlayerTurnInputs(gameState,draft)),true,()=>mainStepPreview(draft));
}
function showMainTwoStep(){
  setPlayerStepHeader("Main Phase 2","Cast spells, record what changed, then end your turn.","Your Actions");
  const hand=gameState.player.handSize||0;
  const reminder=hand>7?`<p class="cmd-hand-reminder">You have ${plural(hand,"card")} in hand. Discard to 7 at the end of your turn.</p>`:"";
  const draft=renderMainPanel(showMainTwoStep,reminder);
  setConfirmButton("End Turn ▸","",()=>endPlayerTurn(()=>applyPlayerTurnInputs(gameState,draft,"after combat")),false,()=>mainStepPreview(draft));
}

/* --- END OF TURN --- */
/* End Turn from any step applies that step's entries first. */
function endTurnFromCurrentStep(){
  const step=gameState.playerStep;
  const draft=playerDraft;
  endPlayerTurn(()=>{
    if(step==="draw")playerDrawStep(gameState);
    else if((step==="main1"||step==="end")&&draft)applyPlayerTurnInputs(gameState,draft,step==="end"?"after combat":"");
    else if(step==="combat")applyCombatDraft();
  });
}
async function endPlayerTurn(apply){
  if(transitioning)return;
  transitioning=true;clearConfirmBar();
  try{
    cmdSnapshot();
    if(apply)apply();
    const hand=gameState.player.handSize||0;
    if(hand>7){
      const discards=await askCount("Discard to hand size",`You have ${plural(hand,"card")} in hand. Select how many you discarded.`,hand-7,0,hand);
      if(discards)playerDiscard(gameState,discards,"to hand size");
    }
    const end=checkCommanderBattleEnd(gameState);
    if(end.over){saveState();endCommanderGame(end.won,end.reason);return;}
    markRecapStart();
    gameState.playerStep=null;
    playerDraft=null;attackDraft=null;commanderEffectDraft=null;
    logCommander("You end your turn.");
    advanceSeat();
  }finally{transitioning=false;}
}

/* --- COMBAT: declare attackers (builder) → review → confirm; or enter results manually --- */
function ensureAttackDraft(){
  const key=`${gameState.turn}`;
  if(!attackDraft||attackDraft.key!==key)attackDraft={key,mode:"builder",rows:[],outcome:null,manual:{perOpp:{},kills:new Map(),playerDeaths:0,lifeGained:0}};
  return attackDraft;
}
function defaultAttackTarget(){
  const alive=aliveOpponents(gameState);
  const last=attackDraft&&attackDraft.rows.length?attackDraft.rows[attackDraft.rows.length-1].targetId:null;
  if(last&&alive.some(o=>o.id===last))return last;
  return alive.length?[...alive].sort((a,b)=>a.life-b.life)[0].id:null;
}
function attackerRowHtml(row,i,alive){
  const kwChips=PLAYER_ATTACK_KEYWORDS.map(kw=>{const on=row.kws.includes(kw);return `<button type="button" class="kw-chip${on?" active":""}" data-row="${i}" data-kw="${kw}" aria-pressed="${on}">${kw}</button>`;}).join("");
  return `<div class="attack-row${row.commander?" is-commander":""}" data-row="${i}">
    <div class="attack-row-h"><strong>${row.commander?"⚜ Your commander":`Attacker ${i+1}`}</strong>
      <label class="attack-cmdr-toggle"><input type="checkbox" data-row-cmdr="${i}" ${row.commander?"checked":""}> Commander</label>
      <button type="button" class="btn-quiet attack-row-remove" data-row-remove="${i}" aria-label="Remove attacker ${i+1}">✕</button></div>
    <div class="attack-row-b">
      <div class="inline-stepper" data-row-field="p" data-row-index="${i}"><label>Power</label><button type="button" data-row-delta="-1" aria-label="Decrease power">−</button><input type="number" min="0" max="99" value="${row.p}" aria-label="Power"><button type="button" data-row-delta="1" aria-label="Increase power">+</button></div>
      <div class="inline-stepper" data-row-field="t" data-row-index="${i}"><label>Toughness</label><button type="button" data-row-delta="-1" aria-label="Decrease toughness">−</button><input type="number" min="0" max="99" value="${row.t}" aria-label="Toughness"><button type="button" data-row-delta="1" aria-label="Increase toughness">+</button></div>
      <label class="attack-target">Target<select data-row-target="${i}">${alive.map(o=>`<option value="${o.id}" ${row.targetId===o.id?"selected":""}>${o.ico} ${nm(o)} (${o.life})</option>`).join("")}</select></label>
    </div>
    <div class="kw-chips">${kwChips}</div>
  </div>`;
}
function showCombatStep(){
  setPlayerStepHeader("Combat","Select your attackers. Each defending CPU chooses its blockers.","Combat");
  const draft=ensureAttackDraft();
  const panel=document.getElementById('respGrid');
  const alive=aliveOpponents(gameState);
  if(draft.mode==="manual"){renderManualCombat(panel,alive);return;}
  if(draft.mode==="review"&&draft.outcome){renderAttackReview(panel,draft);return;}
  const p=gameState.player;
  const rowsHtml=draft.rows.map((row,i)=>attackerRowHtml(row,i,alive)).join("");
  panel.innerHTML=`<div class="context-form commander-form">
    <section class="resolution-step response-step attack-builder" data-step="attackers">
      <div class="resolution-step-h"><span>1</span><strong>Declare attackers</strong><em class="step-status">${draft.rows.length?plural(draft.rows.length,"attacker"):"None"}</em></div>
      <p class="step-hint">Add a row for each attacking creature. You control ${plural(p.creatures,"creature")}. CPU creatures that attacked on their last turn are still tapped and cannot block.</p>
      <div class="resolution-step-b">${rowsHtml||'<div class="empty-field">No attackers declared.</div>'}
        <div class="attack-builder-actions"><button type="button" class="target-btn" id="addAttackerBtn">+ Attacker</button>${draft.rows.some(r=>r.commander)?"":`<button type="button" class="target-btn" id="addCommanderBtn">+ Commander</button>`}<button type="button" class="btn-quiet" id="manualCombatBtn">Enter results manually</button></div>
      </div>
    </section>
    <div id="combatPlayerAction"></div></div>`;
  const rerender=()=>showCombatStep();
  const addRow=commander=>{draft.rows.push({p:commander?4:2,t:commander?4:2,kws:[],targetId:defaultAttackTarget(),commander:!!commander});rerender();};
  panel.querySelector('#addAttackerBtn').onclick=()=>addRow(false);
  panel.querySelector('#addCommanderBtn')?.addEventListener('click',()=>addRow(true));
  panel.querySelector('#manualCombatBtn').onclick=()=>{draft.mode="manual";rerender();};
  panel.querySelectorAll('[data-row-remove]').forEach(btn=>{btn.onclick=()=>{draft.rows.splice(parseInt(btn.dataset.rowRemove),1);rerender();};});
  panel.querySelectorAll('[data-row-cmdr]').forEach(box=>{box.onchange=()=>{const i=parseInt(box.dataset.rowCmdr);draft.rows.forEach((r,j)=>{r.commander=j===i?box.checked:false;});rerender();};});
  panel.querySelectorAll('[data-row-target]').forEach(sel=>{sel.onchange=()=>{draft.rows[parseInt(sel.dataset.rowTarget)].targetId=sel.value;refreshConfirmPreview();};});
  panel.querySelectorAll('.kw-chip').forEach(chip=>{chip.onclick=()=>{
    const row=draft.rows[parseInt(chip.dataset.row)];const kw=chip.dataset.kw;
    row.kws=row.kws.includes(kw)?row.kws.filter(k=>k!==kw):[...row.kws,kw];
    if(kw==="Double Strike"&&row.kws.includes(kw))row.kws=row.kws.filter(k=>k!=="First Strike");
    if(kw==="First Strike"&&row.kws.includes(kw))row.kws=row.kws.filter(k=>k!=="Double Strike");
    rerender();
  };});
  panel.querySelectorAll('[data-row-field]').forEach(stepper=>{
    const row=draft.rows[parseInt(stepper.dataset.rowIndex)];const field=stepper.dataset.rowField;
    const inp=stepper.querySelector('input');
    const set=v=>{row[field]=Math.max(0,Math.min(99,v));inp.value=row[field];refreshConfirmPreview();};
    stepper.querySelectorAll('[data-row-delta]').forEach(b=>{b.onclick=()=>set((parseInt(inp.value)||0)+parseInt(b.dataset.rowDelta));});
    inp.onchange=()=>set(parseInt(inp.value)||0);
  });
  renderPlayerActionPanel(panel.querySelector('#combatPlayerAction'),{contextKey:`combat:${gameState.turn}`,help:"Resolve a player action before combat damage.",onResolved:rerender});
  const validRows=draft.rows.filter(r=>r.targetId);
  if(validRows.length){
    setConfirmButton("Declare Attackers ▸","",()=>{
      draft.outcome=computePlayerAttack(gameState,draft.rows);
      draft.mode="review";rerender();
    },true,()=>`${plural(validRows.length,"attacker")} · ${validRows.reduce((s,r)=>s+(parseInt(r.p)||0)*(r.kws.includes("Double Strike")?2:1),0)} power`);
  }else{
    setConfirmButton("Skip Combat ▸","",()=>goToPlayerStep("end",null),true);
  }
}
function renderAttackReview(panel,draft){
  const outcome=draft.outcome;
  const rowsByOpp=outcome.perOpp.map(entry=>{
    const opp=oppById(entry.oppId);
    const killed=entry.kills.map(uid=>findTokenByUid(opp,uid)).filter(Boolean);
    return `<div class="context-section combat-opp-section" style="border-left:3px solid ${oppColor(opp)}">
      <div class="context-section-title">${opp.ico} ${nm(opp)} — ${opp.life} life → ${Math.max(0,opp.life-entry.damage)}</div>
      <ul class="attack-outcome">
        ${entry.blocks.length?entry.blocks.map(b=>`<li>🛡 ${escapeHtml(b)}</li>`).join(""):"<li>No blockers.</li>"}
        <li>⚔ ${entry.damage} combat damage${entry.commanderDamage?` · ⚜ ${entry.commanderDamage} commander damage (${((opp.commanderDamageReceived||{}).player||0)+entry.commanderDamage}/21)`:""}</li>
        ${killed.length?`<li>💀 ${escapeHtml(killed.map(t=>t.name).join(", "))} ${killed.length===1?"dies":"die"}</li>`:""}
      </ul></div>`;
  }).join("");
  panel.innerHTML=`<div class="context-form commander-form">
    <section class="resolution-step response-step is-set" data-step="review"><div class="resolution-step-h"><span>2</span><strong>Combat outcome</strong><em class="step-status">Review</em></div>
      <p class="step-hint">Blocks are the CPUs' choices. Confirm, or adjust the attackers.</p>
      <div class="resolution-step-b">${rowsByOpp||'<div class="empty-field">No attackers reached an opponent.</div>'}
        <div class="context-section"><ul class="attack-outcome">
          <li>${outcome.playerDeaths?`💀 ${plural(outcome.playerDeaths,"creature")} you control ${outcome.playerDeaths===1?"dies":"die"}`:"Your attackers survive."}</li>
          ${outcome.lifeGained?`<li>♥ You gain ${outcome.lifeGained} life (lifelink)</li>`:""}
        </ul></div>
        <div class="attack-builder-actions"><button type="button" class="target-btn" id="editAttackersBtn">Edit attackers</button><button type="button" class="btn-quiet" id="manualCombatBtn">Enter results manually</button></div>
      </div></section></div>`;
  panel.querySelector('#editAttackersBtn').onclick=()=>{draft.mode="builder";draft.outcome=null;showCombatStep();};
  panel.querySelector('#manualCombatBtn').onclick=()=>{draft.mode="manual";showCombatStep();};
  const dealt=outcome.perOpp.reduce((s,e)=>s+e.damage,0);
  const kills=outcome.perOpp.reduce((s,e)=>s+e.kills.length,0);
  setConfirmButton("Confirm Combat ▸","",()=>goToPlayerStep("end",applyCombatDraft),true,
    ()=>joinPreview([`Deal ${dealt}`,kills&&`Destroy ${kills}`,outcome.playerDeaths&&`Lose ${plural(outcome.playerDeaths,"creature")}`,outcome.lifeGained&&`+${outcome.lifeGained} life`]));
}
function manualCombatResults(alive){
  const m=attackDraft.manual;
  return {perOpp:alive.map(opp=>{
    const e=m.perOpp[opp.id]||{};
    const kills=Array.from(m.kills.values()).filter(k=>k.ownerId===opp.id).map(k=>k.uid);
    return {oppId:opp.id,damage:(e.damage||0)+(e.commanderDamage||0),commanderDamage:e.commanderDamage||0,kills};
  }),playerDeaths:m.playerDeaths||0,lifeGained:m.lifeGained||0};
}
function renderManualCombat(panel,alive){
  const m=attackDraft.manual;
  let html='<div class="context-form commander-form">';
  alive.forEach(opp=>{
    const e=m.perOpp[opp.id]=m.perOpp[opp.id]||{damage:0,commanderDamage:0};
    html+=`<div class="context-section combat-opp-section" data-opp-section="${opp.id}" style="border-left:3px solid ${oppColor(opp)}">
      <div class="context-section-title">${opp.ico} ${nm(opp)} — ${opp.life} life</div>
      <div class="commander-player-actions">${stepperHtml("damage","Damage from other creatures",e.damage)}${stepperHtml("commanderDamage","Commander damage",e.commanderDamage)}</div></div>`;
  });
  html+=`<div class="context-section manual-you"><div class="context-section-title">You</div><div class="commander-player-actions">
    ${gameState.player.creatures>0?stepperHtml("playerDeaths","Your creatures that died",m.playerDeaths,gameState.player.creatures):""}
    ${stepperHtml("lifeGained","Life you gained",m.lifeGained)}</div></div>`;
  if(alive.some(o=>o.tokens.length)){
    html+=`<div class="context-section"><div class="context-section-title">Select destroyed CPU creatures</div>`;
    alive.forEach(opp=>{
      if(!opp.tokens.length)return;
      html+=`<div class="kill-owner-group"><div class="kill-owner-label" style="border-left-color:${oppColor(opp)}">${opp.ico} ${nm(opp)}</div><div class="kill-select">${opp.tokens.map(t=>{const on=m.kills.has(t.uid);return `<button type="button" class="kill-btn card-choice${t.attacking?' is-tapped':''}${on?' selected':''}" data-owner="${opp.id}" data-uid="${escapeHtml(t.uid)}" aria-pressed="${on}" aria-label="Select ${escapeHtml(t.name)}"><span class="kill-btn-status">${on?'💀':t.attacking?'⚔':'⬡'}</span>${cardReferenceHtml(t)}</button>`;}).join("")}</div></div>`;
    });
    html+=`</div>`;
  }
  html+=`<div class="attack-builder-actions"><button type="button" class="target-btn" id="backToBuilderBtn">Declare attackers instead</button></div><div id="combatPlayerAction"></div></div>`;
  panel.innerHTML=html;
  alive.forEach(opp=>{const sec=panel.querySelector(`[data-opp-section="${opp.id}"]`);if(sec)wireDraftSteppers(sec,m.perOpp[opp.id]);});
  wireDraftSteppers(panel.querySelector('.manual-you'),m);
  panel.querySelectorAll('.kill-btn[data-uid]').forEach(btn=>{btn.onclick=()=>{
    const uid=btn.dataset.uid;
    if(m.kills.has(uid))m.kills.delete(uid);else m.kills.set(uid,{ownerId:btn.dataset.owner,uid});
    renderManualCombat(panel,alive);
  };});
  panel.querySelector('#backToBuilderBtn').onclick=()=>{attackDraft.mode="builder";showCombatStep();};
  renderPlayerActionPanel(panel.querySelector('#combatPlayerAction'),{contextKey:`combat:${gameState.turn}`,help:"Resolve a player action before finalizing combat.",onResolved:()=>renderManualCombat(panel,alive)});
  setConfirmButton("Finish Combat ▸","",()=>goToPlayerStep("end",applyCombatDraft),true,()=>{
    const r=manualCombatResults(alive);
    const dealt=r.perOpp.reduce((s,e)=>s+e.damage,0),cmd=r.perOpp.reduce((s,e)=>s+e.commanderDamage,0);
    const kills=r.perOpp.reduce((s,e)=>s+e.kills.length,0);
    return joinPreview([dealt&&`Deal ${dealt}${cmd?` (${cmd} commander)`:""}`,kills&&`Destroy ${kills}`,r.playerDeaths&&`Lose ${plural(r.playerDeaths,"creature")}`,r.lifeGained&&`+${r.lifeGained} life`]);
  });
}
/* Applies whichever combat entry is open (review outcome or manual results). */
function applyCombatDraft(){
  if(!attackDraft)return;
  if(attackDraft.mode==="review"&&attackDraft.outcome)applyPlayerCombat(gameState,attackDraft.outcome);
  else if(attackDraft.mode==="manual")applyPlayerCombat(gameState,manualCombatResults(aliveOpponents(gameState)));
  attackDraft=null;
}

/* =====================================================================
   GAME START / END / BOOT
   ===================================================================== */
function endCommanderGame(won,reason){
  gameState.gameOver=true;saveState();
  clearConfirmBar();
  const modal=document.getElementById('modal'),overlay=document.getElementById('overlay');
  if(won){modal.className="modal";modal.innerHTML=`<div class="big-ico">🏆</div><h2>Victory</h2><p>${reason}<br>You won in round <b>${gameState.turn}</b>.</p><button class="cta" id="cmdRestartBtn">Choose Another Mode</button>`;}
  else{modal.className="modal lose";modal.innerHTML=`<div class="big-ico">💀</div><h2>Eliminated</h2><p>${reason}<br>You lasted until round <b>${gameState.turn}</b>.</p><button class="cta" id="cmdRestartBtn">Try Again</button>`;}
  overlay.classList.add("show");
  renderLifeHud(gameState);
  document.getElementById('cmdRestartBtn').onclick=restart;
}

function startCommanderBattle(numOpponents,settings){
  const chosen=settings||commanderSettingsFromSetup(loadCommanderSetup());
  gameState=createCommanderBattle(numOpponents,chosen);
  // Engines without deck selection ignore settings.decks; keep the choice on record.
  if(gameState.settings&&gameState.settings.decks==null&&chosen.decks!=null)gameState.settings.decks=chosen.decks;
  ensureCommanderEffectState(gameState);
  cmdUndoStack=[];
  document.getElementById('overlay').classList.remove("show");
  const first=gameState.firstSeat==="player"?"You go":`${nm(oppById(gameState.firstSeat))} goes`;
  logCommander(`Commander Battle begins. ${first} first.`);
  markRecapStart();
  showCommanderGame();
  beginCommanderRoundQueue(gameState);
  advanceSeat();
}

/* Re-shows the saved turn state (boot, undo). Never re-runs a CPU phase that already ran. */
function resumeTurnFlow(){
  if(!gameState)return;
  responseDraft=null;
  showCommanderGame();
  renderCommanderLog();
  if(gameState.gameOver){const end=checkCommanderBattleEnd(gameState);endCommanderGame(end.won,end.reason||"");return;}
  if(gameState.phase==="player"){
    if(!gameState.playerStep)gameState.playerStep="draw";
    showPlayerStep();return;
  }
  if(gameState.activeOppId&&gameState.activeResult){showCpuWindow();return;}
  // Saves from before the saved turn queue: start a fresh round.
  if(!Array.isArray(gameState.cpuQueueIds))beginCommanderRoundQueue(gameState);
  advanceSeat();
}

function startAdventure(mode){
  gameState=null;cleanupCommanderUI();
  if(window._adventureEngine)window._adventureEngine.start(mode);
}

function restart(){
  safeRemove(SAVE_KEY);safeRemove("magic_no_gathering_save_v1");safeRemove("garruk_slayer_save_v4");
  gameState=null;cmdUndoStack=[];responseDraft=null;playerDraft=null;attackDraft=null;
  document.getElementById('overlay').classList.remove("show");
  document.getElementById('inputOverlay').classList.remove("show");
  document.getElementById('logOverlay').classList.remove("show");
  cleanupCommanderUI();showSetup();
}

function showSetup(){renderSetupScreen(startAdventure,startCommanderBattle);}

/* Settings dialog: read-only summary of the current game's opponents and difficulty. */
function opponentDeckName(opp,index){
  const decks=gameState&&gameState.settings&&gameState.settings.decks;
  const id=opp.deckId||(opp.deck&&opp.deck.id)||(Array.isArray(decks)?decks[index]:null);
  const deck=id?deckById(id):null;
  if(deck)return deck.name;
  const all=availableDecks();
  return all.length===1?all[0].name:"Unknown deck";
}
function renderOpponentSettingsSummary(){
  const host=document.getElementById('settingsOpponentsSummary');
  if(!host)return;
  if(!gameState){host.innerHTML="";return;}
  const cpu=typeof cpuSettings==="function"?cpuSettings(gameState):((gameState.settings&&gameState.settings.cpu)||{powerLevel:3,aggression:0.5,interaction:0.5});
  const info=difficultyInfo(cpu.powerLevel);
  const pct=v=>`${Math.round((v==null?0.5:v)*100)}%`;
  host.innerHTML=`<dl class="opp-summary">
      <div><dt>Difficulty</dt><dd>${info.level} · ${info.name}</dd></div>
      <div><dt>Aggression</dt><dd>${pct(cpu.aggression)}</dd></div>
      <div><dt>Interaction</dt><dd>${pct(cpu.interaction)}</dd></div>
    </dl>
    <ul class="opp-summary-decks">${gameState.opponents.map((opp,i)=>`<li><span>${opp.ico||""} ${escapeHtml(nm(opp))}</span><span>${escapeHtml(opponentDeckName(opp,i))}</span></li>`).join("")}</ul>`;
}
window.renderOpponentSettingsSummary=renderOpponentSettingsSummary;

function boot(){
  const raw=safeGet(SAVE_KEY);
  if(raw){
    try{
      const parsed=JSON.parse(raw);
      if(parsed._type==="commander"&&!parsed.gameOver){
        delete parsed._type;
        gameState=parsed;
        document.getElementById('overlay').classList.remove("show");
        resumeTurnFlow();
        return;
      }
    }catch(e){console.log("[MNG boot] Commander save parse error:",e);}
  }
  if(window._adventureEngine){
    const adventureSave=load();
    if(adventureSave&&adventureSave.player&&adventureSave.player.life>0&&(adventureSave.mode==="horde"?(adventureSave.loyalty>0||adventureSave.tokens.length>0):adventureSave.loyalty>0)){
      window._adventureEngine.resume(adventureSave);
      return;
    }
  }
  showSetup();
}

// Adjust player stats from the HUD +/- buttons when in commander mode
function adjustPlayerStat(stat, d) {
  if(!gameState)return;
  if(stat==="life") gameState.player.life=Math.max(0,gameState.player.life+d);
  else if(stat==="creatures") gameState.player.creatures=Math.max(0,gameState.player.creatures+d);
  document.getElementById('pLife').textContent=gameState.player.life;
  document.getElementById('pCreatures').textContent=gameState.player.creatures;
  document.getElementById('lifeStat').classList.toggle('warn',gameState.player.life<=10);
  renderLifeHud(gameState);
}

// Expose for game.js integration
window._commanderMain={restart,showSetup,boot,adjust:adjustPlayerStat};
// Expose functions needed by ai-commander.js / commander-turn.js (global scope)
window.logCommander=logCommander;
window.saveState=saveState;
window.showCommanderGame=showCommanderGame;
window.cmdSnapshot=cmdSnapshot;
window.renderBoardView=renderBoardView;

// Wire reset button (overrides game.js's binding)
const resetBtn=document.getElementById('resetBtn');
if(resetBtn)resetBtn.onclick=async()=>{
  closeSettings();
  const ok=await askConfirm("Restart encounter?","This ends the current game and returns to mode selection. This cannot be undone.","Restart","Cancel");
  if(ok)restart();
};

// "New game with different settings…" — back to the setup screen (choices are kept).
const newGameSettingsBtn=document.getElementById('newGameSettingsBtn');
if(newGameSettingsBtn)newGameSettingsBtn.onclick=async()=>{
  closeSettings();
  const ok=await askConfirm("Start a new game?","This ends the current game and opens Commander setup, where you can change opponents and difficulty.","New game","Keep playing");
  if(ok)restart();
};

// Turn Recap setting (commander mode only). Re-renders the draw step if you're on it.
const recapToggle=document.getElementById('recapToggle');
if(recapToggle)recapToggle.onchange=()=>{
  setRecapEnabled(recapToggle.checked);
  if(gameState&&gameState.phase==="player"&&gameState.playerStep==="draw")showDrawStep();
};
updateRecapToggle();

// Boot is called externally by bootGame() in the HTML after all scripts load

})();
