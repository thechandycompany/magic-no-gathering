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
const SAVE_KEY=COMMANDER_SAVE_KEY;
const nm=owner=>owner?(owner.id==="player"?"You":String(owner.name||"?").split(",")[0]):"?";

/* ---------- Commander setup choices (opponent count, decks, difficulty) ---------- */
const SETUP_KEY="ratt_commander_setup";
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
    <h2>${gameTitleHtml()}</h2>
    <p class="setup-sub">${GAME_TAGLINE}</p>
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
    </div>
    <footer class="project-foot"><p class="project-links">${projectLinksHtml()}</p><p class="setup-fan-note">Free, unofficial fan project, not approved or endorsed by Wizards of the Coast.</p></footer>`;
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
  document.getElementById('startCommanderBtn').onclick=()=>{persist();try{onStartCommander(setup.count,commanderSettingsFromSetup(setup));}catch(e){console.error("[RATT] startCommanderBattle failed:",e);}};
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
      ${adventureModes.map((m,i)=>`<label class="mode-option"><input type="radio" name="encounterMode" value="${m.id}" ${i===0?'checked':''}><div class="mode-card"><div class="mode-title">${m.icon} ${modeDisplayName(m)}</div><div class="mode-desc">${m.summary.split('.')[0]}.</div></div></label>`).join('')}
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

/* ---------- Board controls shared by both views (Table · Detail) ----------
   Every view renders the same data-* controls and wires them through wireBoardControls, so no edit
   ever needs a view switch. */
const BOARD_VIEWS=[["table","🂠","Table"],["single","◻","Detail"]];
function viewSwitchHtml(state){
  return `<div class="view-switch" role="group" aria-label="Board view">${BOARD_VIEWS.map(([mode,ico,label])=>`<button type="button" class="view-switch-btn" data-view-mode="${mode}" aria-pressed="${state.viewMode===mode}" title="${label} view"><span aria-hidden="true">${ico}</span><span class="view-switch-lbl">${label}</span></button>`).join("")}</div>`;
}
// Compact − value + control. data is the attribute string that identifies the stat (see wireBoardControls).
function stepHtml(data,label,value,opts={}){
  return `<span class="step ${opts.warn?"warn":""} ${opts.className||""}" title="${escapeHtml(opts.title||label)}"><button type="button" class="step-btn" ${data} data-d="-1" aria-label="Decrease ${escapeHtml(label)}">−</button><span class="step-val">${opts.ico?`<span class="step-ico" aria-hidden="true">${opts.ico}</span>`:""}${value}</span><button type="button" class="step-btn" ${data} data-d="1" aria-label="Increase ${escapeHtml(label)}">+</button></span>`;
}
function refreshBoard(state){renderBoardView(state);renderLifeHud(state);saveState();}
function wireBoardControls(board,state){
  board.querySelectorAll('[data-view-mode]').forEach(btn=>{btn.onclick=event=>{event.stopPropagation();
    const mode=btn.dataset.viewMode;
    if(mode==="single"&&state.viewMode!=="single"){const active=oppById(state.activeOppId);state.viewTarget=active&&state.phase==="cpu"?active.index:-1;}
    state.viewMode=mode;renderBoardView(state);};});
  board.querySelectorAll('[data-view-target]').forEach(el=>{el.onclick=event=>{if(event.target.closest('button:not([data-view-target]),[data-graveyard-owner],[data-exile-owner],input'))return;
    if(boardAttackMode()&&el.closest('[data-attack-target]'))return;
    state.viewMode="single";state.viewTarget=parseInt(el.dataset.viewTarget,10);renderBoardView(state);};});
  board.querySelectorAll('[data-opp-stat]').forEach(btn=>{btn.onclick=event=>{event.stopPropagation();
    const opp=oppById(btn.dataset.oppId);if(!opp)return;
    opp[btn.dataset.oppStat]=Math.max(0,(opp[btn.dataset.oppStat]||0)+parseInt(btn.dataset.d,10));refreshBoard(state);};});
  board.querySelectorAll('[data-player-stat]').forEach(btn=>{btn.onclick=event=>{event.stopPropagation();
    const key=btn.dataset.playerStat;
    // The creature count never drops below your tracked creature cards (remove those with ✕).
    const min=key==="creatures"?trackedPlayerCreatures(state.player).length:0;
    state.player[key]=Math.max(min,(state.player[key]||0)+parseInt(btn.dataset.d,10));refreshBoard(state);
    if(key==="creatures")refreshActivePanel();};});
  if(boardAttackMode()){
    board.querySelectorAll('[data-attack-target]').forEach(seat=>{seat.addEventListener('click',event=>{
      if(event.target.closest('button:not(.tt-seat-name),input,[data-graveyard-owner],[data-exile-owner]'))return;
      setAttackTarget(seat.dataset.attackTarget);
    });});
    board.querySelectorAll('[data-attack-uid]').forEach(slot=>{slot.addEventListener('click',event=>{
      if(event.target.closest('button'))return;
      toggleBoardAttacker(slot.dataset.attackUid);
    });});
    board.querySelector('[data-attack-paper]')?.addEventListener('click',event=>{event.stopPropagation();addPaperAttacker();});
  }
  board.querySelectorAll('[data-block-open]').forEach(slot=>{slot.addEventListener('click',event=>{
    if(event.target.closest('button'))return;
    const opp=oppById(gameState.activeOppId);
    if(opp&&gameState.activeResult)openBlockersDialog(opp,gameState.activeResult);
  });});
  board.querySelectorAll('[data-creature-add]').forEach(btn=>{btn.onclick=event=>{event.stopPropagation();addPlayerCreatureFlow();};});
  board.querySelectorAll('[data-player-dup]').forEach(btn=>{btn.onclick=async event=>{event.stopPropagation();
    const token=(state.player.tokens||[]).find(t=>t.uid===btn.dataset.playerDup);if(!token)return;
    const n=await askCount(`Duplicate ${token.name}`,`How many more copies of <strong>${escapeHtml(token.name)}</strong> (${token.p}/${token.t})?`,1,1,99,"Add copies");
    if(!n)return;
    cmdSnapshot();duplicatePlayerCreature(state,token.uid,n);refreshBoard(state);refreshActivePanel();};});
  board.querySelectorAll('[data-player-rm]').forEach(btn=>{btn.onclick=async event=>{event.stopPropagation();
    const token=(state.player.tokens||[]).find(t=>t.uid===btn.dataset.playerRm);if(!token)return;
    const destination=token.commander||token.isToken?"graveyard":await askCommanderRemovalDestination(token);
    if(!destination)return;
    cmdSnapshot();removePlayerCreature(state,token.uid,destination,destination==="exile"?"is exiled":"leaves the battlefield");refreshBoard(state);refreshActivePanel();};});
  board.querySelectorAll('[data-cmdr-from]').forEach(btn=>{btn.onclick=event=>{event.stopPropagation();
    const id=btn.dataset.cmdrFrom;state.player.commanderDamageReceived[id]=Math.max(0,(state.player.commanderDamageReceived[id]||0)+parseInt(btn.dataset.d,10));refreshBoard(state);};});
  board.querySelectorAll('[data-rm-uid]').forEach(btn=>{btn.onclick=event=>{event.stopPropagation();removeCpuTokenFromBoard(oppById(btn.dataset.opp),btn.dataset.rmUid);};});
  board.querySelectorAll('[data-perm-key]').forEach(btn=>{btn.onclick=async event=>{event.stopPropagation();
    const owner=oppById(btn.dataset.opp);if(!owner)return;
    const destination=await askCommanderRemovalDestination({name:btn.dataset.permName,ico:btn.dataset.permIco,type:"Permanent"});
    if(!destination)return;
    cmdSnapshot();
    const moved=removeOpponentPermanent(owner,btn.dataset.permKey,destination);
    if(moved)logCommander(`You ${destination==="exile"?"exile":"destroy"} ${movementCardText({...moved,destination:moved.destination||destination})} (${nm(owner)}).`);
    saveState();renderBoardView(gameState);renderLifeHud(gameState);refreshActivePanel();};});
  wireGraveyardViewerControls(board,state);
  wirePlaneswalkerControls(board,state);
}

function renderBoardView(state){
  updateCommanderTurnBanner(state);
  const originalBoard=document.getElementById('board');
  if(originalBoard)originalBoard.style.display='none';
  let board=document.getElementById('commanderBoardOverlay');
  if(!board){
    board=document.createElement('section');board.id='commanderBoardOverlay';board.className='board';
    const hud=document.querySelector('.player-hud');
    if(hud&&hud.nextSibling)hud.parentNode.insertBefore(board,hud.nextSibling);
    else if(originalBoard)originalBoard.parentNode.insertBefore(board,originalBoard);
  }
  if(state.viewMode!=="single")state.viewMode="table";  // older saves may hold the retired "all" view
  if(state.viewMode==="table")renderTableView(state,board);
  else{tableAnimState=null;tableAnimLive.clear();hideTablePeek();renderSingleView(state,board);}
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
      const tooltip=`${t.name}, ${t.p}/${t.t}${t.kws&&t.kws.length?' · '+t.kws.join(', '):''}${t.effect?'. '+t.effect:''}`;
      return `<div class="card ${t.kind==='commander'?'commander':''} ${t.summoningSick?'sick':''} ${isCreatureTapped(t)?'tapped':''}" title="${escapeHtml(tooltip)}">
      ${dead?"":`<button type="button" class="c-remove" data-opp="${opp.id}" data-rm-uid="${escapeHtml(t.uid)}" title="${t.kind==='commander'?`Return ${escapeHtml(t.name)} to the command zone`:`Remove ${escapeHtml(t.name)} from the battlefield`}" aria-label="Remove ${escapeHtml(t.name)}">✕<span class="c-remove-label"> Remove</span></button>`}
      <span class="c-name"><span>${t.name}</span><span class="mana">${t.kind==='commander'?'⚜':'🌲'}</span></span>
      <span class="c-art">${t.ico}</span>
      ${kws?`<span class="c-kw">${kws}</span>`:''}
      ${t.effect?`<span class="c-effect">${t.effect}</span>`:''}
      <span class="c-pt">${t.p}/${t.t}</span>
      ${t.attacking?`<div class="c-atk">⚔️</div>${isCreatureTapped(t)?'<div class="c-tapped-label">TAPPED</div>':''}`:''}${t.summoningSick?'<div class="c-sick">💤</div>':''}</div>`;
    }).join('');

  const viewLabel=`${viewIdx+2}/${totalViews}`;
  const cdFromOpp=state.player.commanderDamageReceived[opp.id]||0;
  const gearNames=[...(opp.attachedGear||[]).map(g=>g.name),...(opp.looseGear||[]).map(g=>`${g.name} (unattached)`)];
  const intent=dead?"":intentText(state,opp);
  board.innerHTML=`<div class="board-h"><span class="ico">${opp.ico}</span><span>${opp.name}</span>
    <span class="atk-note">${opp.currentStrategy?STRATEGY_LABELS[opp.currentStrategy]||'':''}</span>
    <div class="view-controls"><button class="btn-ghost view-btn" id="prevOppBtn" title="Previous player" aria-label="Previous player">◂</button><span class="view-counter">${viewLabel}</span><button class="btn-ghost view-btn" id="nextOppBtn" title="Next player" aria-label="Next player">▸</button>${viewSwitchHtml(state)}</div>
  </div><div class="board-inner commander-board-inner"><div class="garruk-col">
    <div class="commander-board-stats">
      <div class="cbs-item"><span class="cbs-label">Life</span><div class="cbs-adj"><button type="button" class="cbs-btn" data-opp-stat="life" data-opp-id="${opp.id}" data-d="-1">−</button><span class="cbs-val ${opp.life<=10?'warn':''}">${opp.life}</span><button type="button" class="cbs-btn" data-opp-stat="life" data-opp-id="${opp.id}" data-d="1">+</button></div></div>
      <div class="cbs-item cbs-cmdr-dmg"><span class="cbs-label">⚜ Commander damage to you ${helpTip("Combat damage this opponent’s commander has dealt you. 21 from one commander eliminates you.")}</span><div class="cbs-adj"><button type="button" class="cbs-btn" data-cmdr-from="${opp.id}" data-d="-1">−</button><span class="cbs-val ${cdFromOpp>=14?'warn':''}">${cdFromOpp}/21</span><button type="button" class="cbs-btn" data-cmdr-from="${opp.id}" data-d="1">+</button></div></div>
      <div class="cbs-item"><span class="cbs-label">Mana</span><span class="cbs-val">${manaAvailable(opp)}${opp.heldMana?` · ${opp.heldMana} open`:""}</span></div>
      <div class="cbs-item"><span class="cbs-label">Hand</span><span class="cbs-val">🃏 ${opponentHandSize(opp)}/${MAX_CPU_HAND_SIZE}</span></div>
      <div class="cbs-item cbs-wide"><span class="cbs-label">Hand contents</span><span class="cbs-val cbs-small">${handBreakdownText(opp)}</span></div>
      <div class="cbs-item"><span class="cbs-label">Deck</span><span class="cbs-val">📚 ${opponentDeckSize(opp)}</span></div>
      ${(opp.poison||0)>0?`<div class="cbs-item"><span class="cbs-label">Poison</span><span class="cbs-val ${opp.poison>=7?'warn':''}">☣ ${opp.poison}/10</span></div>`:""}
      <div class="cbs-item"><span class="cbs-label">Commander ${helpTip("Commander tax: each recast from the command zone costs 2 more mana.")}</span><span class="cbs-val">${commanderOnField(opp)?'Battlefield':opp.commanderInHand?'In hand (no tax)':'Command zone (+'+opp.commanderTax+')'}</span></div>
      <div class="cbs-item cbs-wide"><span class="cbs-label">Equipment</span><span class="cbs-val cbs-small">${gearNames.length?escapeHtml(gearNames.join(", ")):"None"}</span></div>
      ${(opp.utilityPermanents||[]).length?`<div class="cbs-item cbs-wide"><span class="cbs-label">Other permanents</span><span class="cbs-val cbs-small">${opp.utilityPermanents.map((u,i)=>`<span class="cbs-util">${escapeHtml(u.ico||"✦")} ${escapeHtml(u.name)}${dead?"":`<button type="button" class="cbs-util-remove" data-opp="${opp.id}" data-perm-key="util:${i}" data-perm-name="${escapeHtml(u.name)}" data-perm-ico="${escapeHtml(u.ico||"✦")}" aria-label="Remove ${escapeHtml(u.name)}">✕</button>`}</span>`).join("")}</span></div>`:""}
      ${intent?`<div class="cbs-item cbs-wide"><span class="cbs-label">Likely next attack ${helpTip("A prediction. It can change before this CPU's turn.")}</span><span class="cbs-val cbs-small">${escapeHtml(intent)}</span></div>`:""}
      <div class="cbs-item"><span class="cbs-label">Graveyard</span><button type="button" class="cbs-zone-btn" data-graveyard-owner="${opp.id}">⚰ ${opp.graveyardCount}</button></div>
      <div class="cbs-item"><span class="cbs-label">Exile</span><button type="button" class="cbs-zone-btn" data-exile-owner="${opp.id}">✦ ${opp.exileCount}</button></div>
    </div></div>
    <div class="field-col"><div class="field-h"><span class="lbl">${nm(opp)}'s creatures</span></div><div class="tokens">${tokensHtml}</div></div></div>`;

  document.getElementById('prevOppBtn').onclick=()=>{state.viewTarget=viewIdx===0?-1:(viewIdx-1);renderBoardView(state);};
  document.getElementById('nextOppBtn').onclick=()=>{state.viewTarget=viewIdx>=state.opponents.length-1?-1:(viewIdx+1);renderBoardView(state);};
  wireBoardControls(board,state);
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

  const playerCreatureCards=trackedPlayerCreatures(p);
  const untracked=untrackedPlayerCreatures(p);
  const attackDraftNow=boardAttackMode()?ensureAttackDraft():null;
  const attackAttrs=token=>{
    if(!attackDraftNow||isCreatureTapped(token))return "";
    const row=attackDraftNow.rows.find(r=>r.uid===token.uid);
    return ` data-attack-uid="${escapeHtml(token.uid)}" role="button" aria-pressed="${!!row}"`;
  };
  const attackClass=token=>attackDraftNow&&!isCreatureTapped(token)?(attackDraftNow.rows.some(r=>r.uid===token.uid)?" tt-attackable is-attacking-target":" tt-attackable"):"";
  const playerTokensHtml=(playerCreatureCards.length?playerCreatureCards.map(token=>`<div class="card voltron-creature ${token.kind==="reanimated-creature"?"reanimated":""} ${token.commander?"commander":""} ${isCreatureTapped(token)?"tapped":""}${attackClass(token)}"${attackAttrs(token)} title="${escapeHtml(token.kind==="reanimated-creature"?`Reanimated from ${token.owner}`:token.name)}"><span class="c-name"><span>${escapeHtml(token.name)}</span><span class="mana">${token.kind==="reanimated-creature"?"↩":token.commander?"⚜":""}</span></span><span class="c-art">${escapeHtml(token.ico)}</span>${token.kws?.length?`<span class="c-kw">${escapeHtml(token.kws.join(" · "))}</span>`:""}${token.effect?`<span class="c-effect">${escapeHtml(token.effect)}</span>`:""}<span class="c-pt">${token.p}/${token.t}</span>${token.summoningSick?'<div class="c-sick">💤</div>':''}<button type="button" class="c-dup" data-player-dup="${escapeHtml(token.uid)}" title="Duplicate" aria-label="Duplicate ${escapeHtml(token.name)}">⧉</button><button type="button" class="c-remove" data-player-rm="${escapeHtml(token.uid)}" title="Remove ${escapeHtml(token.name)}" aria-label="Remove ${escapeHtml(token.name)}">✕</button></div>`).join(""):"")
    +(untracked||!playerCreatureCards.length?`<div class="empty-field">${plural(untracked,playerCreatureCards.length?"other creature":"creature")} on your battlefield</div>`:"");

  const pws=p.planeswalkers||[];
  const pwHtml=pws.map(pw=>`<div class="card commander pw-card" title="${escapeHtml(pw.name)} · Loyalty ${pw.loyalty}"><span class="c-name"><span>${escapeHtml(pw.name)}</span><span class="mana">⬡</span></span><span class="c-art">⬡</span><span class="c-pt">${pw.loyalty}</span><button type="button" class="c-remove" data-pw-remove="${pw.id}" title="Remove ${escapeHtml(pw.name)} from the battlefield" aria-label="Remove ${escapeHtml(pw.name)}">✕<span class="c-remove-label"> Remove</span></button><div class="pw-adj"><button type="button" class="cbs-btn" data-pw-loyalty="${pw.id}" data-d="-1">−</button><button type="button" class="cbs-btn" data-pw-loyalty="${pw.id}" data-d="1">+</button></div></div>`).join("");
  const stat=(key,label,value,warn)=>`<div class="cbs-item"><span class="cbs-label">${label}</span><div class="cbs-adj"><button type="button" class="cbs-btn" data-player-stat="${key}" data-d="-1" aria-label="Decrease ${label}">−</button><span class="cbs-val ${warn?'warn':''}">${value}</span><button type="button" class="cbs-btn" data-player-stat="${key}" data-d="1" aria-label="Increase ${label}">+</button></div></div>`;

  board.innerHTML=`<div class="board-h"><span class="ico">🗡️</span><span>You</span>
    <span class="atk-note"></span>
    <div class="view-controls"><button class="btn-ghost view-btn" id="prevOppBtn" title="Previous player" aria-label="Previous player">◂</button><span class="view-counter">1/${totalViews}</span><button class="btn-ghost view-btn" id="nextOppBtn" title="Next player" aria-label="Next player">▸</button>${viewSwitchHtml(state)}</div>
  </div><div class="board-inner commander-board-inner"><div class="garruk-col">
    <div class="commander-board-stats">
      ${stat("life","Life",p.life,p.life<=10)}
      ${cmdrDmgHtml}
      ${stat("creatures","Creatures",p.creatures,false)}
      ${stat("librarySize","Library",p.librarySize||0,(p.librarySize||0)<=5)}
      ${stat("poison","Poison",p.poison||0,(p.poison||0)>=7)}
      <div class="cbs-item"><span class="cbs-label">Planeswalkers</span><span class="cbs-val">⬡ ${pws.length}</span></div>
      <div class="cbs-item"><span class="cbs-label">Graveyard</span><button type="button" class="cbs-zone-btn" data-graveyard-owner="player">⚰ ${p.graveyardCount}</button></div>
      <div class="cbs-item"><span class="cbs-label">Exile</span><button type="button" class="cbs-zone-btn" data-exile-owner="player">✦ ${p.exileCount}</button></div>
    </div></div>
    <div class="field-col"><div class="field-h"><span class="lbl">Your battlefield</span><button class="btn-ghost" data-creature-add type="button">+ Creature</button><button class="btn-ghost" data-pw-add type="button">+ Planeswalker</button></div><div class="tokens">${pwHtml}${playerTokensHtml}</div></div></div></div>`;

  document.getElementById('prevOppBtn').onclick=()=>{state.viewTarget=state.opponents.length-1;renderBoardView(state);};
  document.getElementById('nextOppBtn').onclick=()=>{state.viewTarget=0;renderBoardView(state);};
  wireBoardControls(board,state);
}

/* ---------- Tabletop view: every battlefield laid out as physical cards ---------- */
// Tapped/attacking cards turn sideways; P/T shows buffs (green) and shrinks (red) against the printed stats.
// Identical cards share one slot with a ×N stack. Cards that are new since the last table render animate in;
// cards whose tapped state changed animate the turn. Undo/new game/switching views re-prime without animating.
let tableAnimPrev=null,tableAnimState=null;
// The board can re-render several times in one tick; a started animation is remembered so later renders resume it.
const TABLE_ANIM_MS={"tt-enter":1400,"tt-tap":300,"tt-untap":300,"tt-bump":350};
let tableAnimLive=new Map();
function tableAnimClass(anim,keys,value){
  keys.forEach(k=>anim.next.set(k,value));
  let cls="";
  if(anim.prev){
    const seen=keys.filter(k=>anim.prev.has(k));
    if(!seen.length)cls=value===0?"":"tt-enter";
    else if(typeof value==="number")cls=value>anim.prev.get(keys[0])?"tt-bump":"";
    else if(seen.length<keys.length)cls="tt-bump";
    else if(seen.some(k=>anim.prev.get(k)!==value))cls=value?"tt-tap":"tt-untap";
  }
  const now=performance.now();
  if(cls){keys.forEach(k=>tableAnimLive.set(k,{cls,start:now}));return {cls,delay:0};}
  const live=keys.map(k=>tableAnimLive.get(k)).find(l=>l&&now-l.start<TABLE_ANIM_MS[l.cls]);
  return live?{cls:live.cls,delay:Math.round(now-live.start)}:{cls:"",delay:0};
}
function animAttrs(a){return a&&a.cls?{cls:a.cls,style:`--tt-delay:-${a.delay}ms;`}:{cls:"",style:""};}
// Same card, same state → same stack. The commander never stacks.
function tableCardSignature(card){
  return card.kind==="commander"||card.commander?`uid:${card.uid}`:JSON.stringify([card.name,card.ico,card.kind,card.p,card.t,card.baseP,card.baseT,(card.kws||[]).join(","),card.effect||"",!!card.isToken,!!card.attacking,!!card.tapped,!!card.summoningSick]);
}
function groupTableCards(cards){
  const groups=new Map();
  cards.forEach(card=>{const sig=tableCardSignature(card);if(!groups.has(sig))groups.set(sig,[]);groups.get(sig).push(card);});
  return [...groups.values()];
}
function tableCardHtml(card,opts={}){
  const tapped=isCreatureTapped(card);
  const commander=card.kind==="commander";
  const count=opts.count||1;
  const hasStats=card.p!=null&&card.t!=null;
  const baseP=card.baseP!=null?card.baseP:card.p,baseT=card.baseT!=null?card.baseT:card.t;
  const ptClass=!hasStats?"":(card.p>baseP||card.t>baseT)?"buffed":(card.p<baseP||card.t<baseT)?"shrunk":"";
  const kws=(card.kws||[]).filter(Boolean);
  const gear=opts.gear||[];
  const tooltip=[`${count>1?`${count}× `:""}${card.name}${hasStats?`, ${card.p}/${card.t}`:""}`,kws.join(", "),card.effect||"",gear.length?`Equipped: ${gear.map(g=>g.name).join(", ")}`:"",tapped?"Tapped":"",card.summoningSick?"Summoning sick":""].filter(Boolean).join(" · ");
  const classes=["tt-card",opts.className||"",commander?"commander":"",card.isToken?"token":"",card.summoningSick?"sick":"",count>1?"stacked":"",count>2?"stacked-3":""].filter(Boolean).join(" ");
  const stat=opts.stat!=null?opts.stat:hasStats?`${card.p}/${card.t}`:"";
  const peekIndex=tablePeek.push({card,count,gear,tapped,stat:opts.stat,className:opts.className||""})-1;
  const gearHtml=gear.map((g,i)=>`<span class="tt-gear ${animAttrs(g.anim).cls}" style="--i:${i};${animAttrs(g.anim).style}" title="${escapeHtml(`${g.name}${g.effect?`, ${g.effect}`:""}`)}">⚙ ${escapeHtml(g.name)}</span>`).join("");
  const removeTarget=opts.permKey?`data-perm-key="${escapeHtml(opts.permKey)}" data-perm-name="${escapeHtml(card.name)}" data-perm-ico="${escapeHtml(card.ico||"✦")}"`:opts.pwId?`data-pw-remove="${escapeHtml(opts.pwId)}"`:`data-rm-uid="${escapeHtml(card.uid)}"`;
  const removeHtml=opts.removeOpp||opts.pwId?`<button type="button" class="tt-remove" data-opp="${escapeHtml(opts.removeOpp||"")}" ${removeTarget} title="${commander?"Return to the command zone":count>1?"Remove one from the battlefield":"Remove from the battlefield"}" aria-label="Remove ${count>1?"one ":""}${escapeHtml(card.name)}">✕</button>`:"";
  const a=animAttrs(opts.anim);
  return `<div class="tt-slot ${tapped?"is-tapped":""} ${a.cls} ${opts.slotClass||""}" ${opts.slotAttrs||""} style="--gear:${gear.length};${a.style}">${gearHtml}${count>1?`<span class="tt-count">×${count}</span>`:""}<div class="${classes}" data-peek="${peekIndex}" tabindex="0" aria-label="${escapeHtml(tooltip)}">
    <span class="tt-name">${escapeHtml(card.name)}</span>
    <span class="tt-art">${escapeHtml(card.ico||"🃏")}</span>
    ${kws.length?`<span class="tt-kw">${escapeHtml(kws.join(" · "))}</span>`:""}
    ${stat!==""?`<span class="tt-pt ${ptClass}">${escapeHtml(stat)}</span>`:""}
    ${card.attacking?'<span class="tt-badge tt-atk" title="Attacking">⚔</span>':card.summoningSick?'<span class="tt-badge" title="Summoning sick">💤</span>':""}
    ${opts.extraHtml||""}${removeHtml}</div></div>`;
}
// Battlefield creatures, stacked; one remove button per stack takes the last copy.
function tableCreaturesHtml(anim,ownerId,cards,opts={}){
  // Declaring attacks: every copy gets its own slot so each one can be sent separately.
  const groups=opts.attack?cards.map(c=>[c]):groupTableCards(cards);
  return groups.map(group=>{
    const card=group[0];const tapped=isCreatureTapped(card);
    const anim_=tableAnimClass(anim,group.map(c=>`${ownerId}|${c.uid}`),tapped);
    const gear=card.kind==="commander"?(opts.gear||[]).map((g,i)=>({...g,anim:tableAnimClass(anim,[`${ownerId}|gear|${g.name}|${i}`],true)})):[];
    const uid=group[group.length-1].uid;
    // Your creatures: ⧉ duplicate and ✕ remove (one copy) on the card.
    const extraHtml=opts.player?`<button type="button" class="tt-dup" data-player-dup="${escapeHtml(uid)}" title="Duplicate" aria-label="Duplicate ${escapeHtml(card.name)}">⧉</button><button type="button" class="tt-remove" data-player-rm="${escapeHtml(uid)}" title="${group.length>1?"Remove one from the battlefield":"Remove from the battlefield"}" aria-label="Remove ${group.length>1?"one ":""}${escapeHtml(card.name)}">✕</button>`:"";
    let slotAttrs="",slotClass="",badge="";
    if(opts.attack){
      const row=opts.attack.rows.find(r=>r.uid===card.uid);
      const target=row?oppById(row.targetId):null;
      slotAttrs=`data-attack-uid="${escapeHtml(card.uid)}" role="button" aria-pressed="${!!row}"`;
      slotClass=isCreatureTapped(card)?"tt-cant-attack":`tt-attackable${row?" is-attacking-target":""}`;
      if(target)badge=`<span class="tt-attack-badge" title="Attacking ${escapeHtml(nm(target))}">⚔ ${target.ico}</span>`;
    }else if(opts.blockOpen&&card.attacking){
      slotAttrs=`data-block-open="1" role="button" title="Attacking you: click to declare blockers"`;slotClass="tt-blockable";
    }
    return tableCardHtml({...card,uid},{count:group.length,anim:anim_,gear,className:[opts.className,card.kind==="reanimated-creature"?"reanimated":"",card.commander?"commander":""].filter(Boolean).join(" "),removeOpp:opts.removeOpp,extraHtml:badge+extraHtml,slotAttrs,slotClass});
  }).join("");
}
// Non-creature permanents without uids (loose gear, utility): stack by name.
function tablePermanentsHtml(anim,ownerId,items,className,removeOpp){
  const byName=new Map();
  items.forEach(item=>{const key=`${item.name}|${item.ico}`;if(!byName.has(key))byName.set(key,[]);byName.get(key).push(item);});
  return [...byName.values()].map(group=>{
    const item=group[0];
    const anim_=tableAnimClass(anim,group.map((_,i)=>`${ownerId}|${className}|${item.name}|${i}`),true);
    return tableCardHtml(item,{className,stat:"",count:group.length,anim:anim_,removeOpp,permKey:removeOpp?group[group.length-1].key:null});
  }).join("");
}
// A face-down or face-up pile (lands, library, graveyard…) with a count; grows with a bump.
function tablePileHtml(ico,label,count,opts={}){
  const attrs=opts.attrs||"";
  const tag=attrs?"button":"div";
  const step=opts.stepData?`<span class="tt-pile-step"><button type="button" class="step-btn" ${opts.stepData} data-d="-1" aria-label="Decrease ${escapeHtml(label)}">−</button><button type="button" class="step-btn" ${opts.stepData} data-d="1" aria-label="Increase ${escapeHtml(label)}">+</button></span>`:"";
  if(step)return `<div class="tt-pile ${opts.className||""} ${count?"":"empty"} ${animAttrs(opts.anim).cls}" style="${animAttrs(opts.anim).style}" title="${escapeHtml(opts.title||`${label}: ${count}`)}"><span class="tt-pile-ico">${ico}</span><span class="tt-pile-count">${count}</span><span class="tt-pile-lbl">${escapeHtml(label)}</span>${step}</div>`;
  return `<${tag} ${tag==="button"?'type="button"':""} class="tt-pile ${opts.className||""} ${count?"":"empty"} ${animAttrs(opts.anim).cls}" style="${animAttrs(opts.anim).style}" ${attrs} title="${escapeHtml(opts.title||`${label}: ${count}`)}"><span class="tt-pile-ico">${ico}</span><span class="tt-pile-count">${count}</span><span class="tt-pile-lbl">${escapeHtml(label)}</span></${tag}>`;
}
function tablePile(anim,key,ico,label,count,opts={}){return tablePileHtml(ico,label,count,{...opts,anim:tableAnimClass(anim,[key],count)});}
function tableOpponentSeatHtml(state,opp,anim){
  const dead=isOpponentDead(opp);
  const active=state.phase==="cpu"&&state.activeOppId===opp.id;
  const cd=state.player.commanderDamageReceived[opp.id]||0;
  const commander=commanderOnField(opp);
  const creatures=opp.tokens.slice().sort((a,b)=>(b.kind==="commander")-(a.kind==="commander"));
  const blockOpen=state.phase==="cpu"&&active&&cpuAttacksPlayer(state.activeResult);
  const creaturesHtml=creatures.length?tableCreaturesHtml(anim,opp.id,creatures,{gear:opp.attachedGear||[],removeOpp:dead?null:opp.id,blockOpen}):'<span class="tt-empty">No creatures</span>';
  // Declaring your attacks: each living opponent's seat is a target you can click.
  const attacking=boardAttackMode()&&!dead;
  const incoming=attacking?ensureAttackDraft().rows.filter(r=>r.targetId===opp.id):[];
  const isTarget=attacking&&attackTargetId()===opp.id;
  const commandZone=commander?"":tableCardHtml({name:opp.name,ico:opp.ico,kind:"commander",effect:"Command zone"},{className:"in-zone",stat:opp.commanderInHand?"Hand":`+${opp.commanderTax||0}`});
  const removeOpp=dead?null:opp.id;
  const permanents=tablePermanentsHtml(anim,opp.id,(opp.looseGear||[]).map((g,i)=>({name:g.name,ico:"⚙",effect:`${g.effect||""} (unattached)`,key:`loose:${i}`})),"artifact",removeOpp)
    +tablePermanentsHtml(anim,opp.id,(opp.utilityPermanents||[]).map((u,i)=>({name:u.name,ico:u.ico||"✦",effect:u.effect||"",key:`util:${i}`})),"enchantment",removeOpp);
  const rocks=(opp.rampInPlay||0)+(opp.explosiveInPlay||0);
  return `<div class="tt-seat ${dead?"dead":""} ${active?"is-active":""}${attacking?" tt-attack-target":""}${isTarget?" is-target":""}" ${attacking?`data-attack-target="${opp.id}" title="Click to attack ${escapeHtml(nm(opp))}"`:""} style="--seat:${oppColor(opp)}">
    <div class="tt-seat-h"><button type="button" class="tt-seat-name" data-view-target="${opp.index}" title="Open ${escapeHtml(nm(opp))}'s detail view">${opp.ico} ${escapeHtml(nm(opp))}</button>
      ${dead?'<span class="tt-life">☠</span>':stepHtml(`data-opp-stat="life" data-opp-id="${opp.id}"`,`${nm(opp)} life`,opp.life,{className:"tt-life",ico:"♥",warn:opp.life<=10})}
      ${(opp.poison||0)>0?`<span class="tt-chip" title="Poison counters">☣ ${opp.poison}</span>`:""}
      ${dead?"":stepHtml(`data-cmdr-from="${opp.id}"`,`commander damage from ${nm(opp)}`,`${cd}/21`,{className:"tt-chip",ico:"⚜",warn:cd>=14,title:"Commander damage this opponent has dealt you"})}
      <span class="tt-chip" title="Mana available${opp.heldMana?" · held open":""}">◇ ${manaAvailable(opp)}${opp.heldMana?` (${opp.heldMana} open)`:""}</span>
      <span class="tt-chip" title="${escapeHtml(handBreakdownText(opp))}">🃏 ${opponentHandSize(opp)}</span>
      ${active?'<span class="tt-chip tt-turn">▶ Their turn</span>':""}${isTarget?'<span class="tt-chip tt-target-chip">🎯 Target</span>':""}${incoming.length?`<span class="tt-chip tt-incoming" title="Your attackers on ${escapeHtml(nm(opp))}">⚔ ${incoming.length} · ${incoming.reduce((s,r)=>s+(parseInt(r.p)||0)*(r.kws.includes("Double Strike")?2:1),0)} power</span>`:""}</div>
    <div class="tt-zone tt-creatures">${commandZone}${creaturesHtml}</div>
    <div class="tt-zone tt-back">
      ${tablePile(anim,`${opp.id}|lands`,"🌲","Lands",opp.landsInPlay||0,{className:"land"})}
      ${rocks?tablePile(anim,`${opp.id}|rocks`,"💠","Mana rocks",rocks,{className:"artifact"}):""}
      ${permanents}
      <span class="tt-spacer"></span>
      ${tablePileHtml("📚","Library",opponentDeckSize(opp),{className:"facedown"})}
      ${tablePile(anim,`${opp.id}|gy`,"⚰","Graveyard",opp.graveyardCount||0,{attrs:`data-graveyard-owner="${opp.id}"`,title:"View graveyard"})}
      ${opp.exileCount?tablePile(anim,`${opp.id}|ex`,"✦","Exile",opp.exileCount,{attrs:`data-exile-owner="${opp.id}"`,title:"View exile"}):""}
    </div></div>`;
}
function tablePlayerSeatHtml(state,anim){
  const p=state.player;
  const pws=(p.planeswalkers||[]).map(pw=>tableCardHtml({name:pw.name,ico:"⬡"},{className:"pw",stat:`◆${pw.loyalty}`,pwId:pw.id,anim:tableAnimClass(anim,[`player|${pw.id}`],true),
    extraHtml:`<div class="tt-pw-adj"><button type="button" class="step-btn" data-pw-loyalty="${pw.id}" data-d="-1" aria-label="Decrease ${escapeHtml(pw.name)} loyalty">−</button><button type="button" class="step-btn" data-pw-loyalty="${pw.id}" data-d="1" aria-label="Increase ${escapeHtml(pw.name)} loyalty">+</button></div>`})).join("");
  const tracked=trackedPlayerCreatures(p).slice().sort((a,b)=>(b.commander?1:0)-(a.commander?1:0));
  const attackMode=boardAttackMode();
  const yourCreatures=tableCreaturesHtml(anim,"player",tracked,{player:true,attack:attackMode?ensureAttackDraft():null});
  const paperAttackers=attackMode?ensureAttackDraft().rows.filter(r=>!r.uid).length:0;
  const untracked=untrackedPlayerCreatures(p);
  const cmdrDmg=state.opponents.filter(o=>(p.commanderDamageReceived[o.id]||0)>0).map(o=>{const v=p.commanderDamageReceived[o.id];return stepHtml(`data-cmdr-from="${o.id}"`,`commander damage from ${nm(o)}`,`${v}/21`,{className:"tt-chip",ico:o.ico,warn:v>=14});}).join("");
  return `<div class="tt-seat tt-you ${state.phase==="player"?"is-active":""}" style="--seat:var(--gold)">
    <div class="tt-seat-h"><button type="button" class="tt-seat-name" data-view-target="-1" title="Open your detail view">🗡️ You</button>
      ${stepHtml('data-player-stat="life"',"your life",p.life,{className:"tt-life",ico:"♥",warn:p.life<=10})}
      ${stepHtml('data-player-stat="poison"',"your poison counters",p.poison||0,{className:"tt-chip",ico:"☣",warn:(p.poison||0)>=7})}${cmdrDmg}
      ${state.phase==="player"?'<span class="tt-chip tt-turn">▶ Your turn</span>':""}
      <button type="button" class="btn-ghost tt-add" data-creature-add>+ Creature</button>
      <button type="button" class="btn-ghost tt-add" data-pw-add>+ Planeswalker</button></div>
    <div class="tt-zone tt-creatures">${pws}${yourCreatures}
      ${attackMode&&untracked?`<button type="button" class="tt-pile tt-attackable-pile" data-attack-paper title="Attack with a creature you have not added as a card"><span class="tt-pile-ico">♟</span><span class="tt-pile-count">${untracked}</span><span class="tt-pile-lbl">${paperAttackers?`⚔ ${paperAttackers} attacking`:"Click to attack"}</span></button>`
        :tablePile(anim,"player|creatures","♟",tracked.length?"Other creatures":"Creatures (paper)",untracked,{stepData:'data-player-stat="creatures"',title:"Creatures on your real table that you have not added as cards"})}
      <span class="tt-spacer"></span>
      ${tablePileHtml("📚","Library",p.librarySize||0,{className:"facedown",stepData:'data-player-stat="librarySize"'})}
      ${tablePile(anim,"player|gy","⚰","Graveyard",p.graveyardCount||0,{attrs:'data-graveyard-owner="player"',title:"View graveyard"})}
      ${p.exileCount?tablePile(anim,"player|ex","✦","Exile",p.exileCount,{attrs:'data-exile-owner="player"',title:"View exile"}):""}
    </div></div>`;
}
// Card detail popup (hover/keyboard focus unless turned off in Settings; click/tap always): type, stats vs printed, keywords with reminders, effect, gear, state.
let tablePeek=[];
function keywordReminder(kw){
  const key=String(kw).toLowerCase().replace(/\s*\d+$/,"");
  return (typeof KEYWORD_REMINDERS!=="undefined"&&KEYWORD_REMINDERS[key])||"";
}
function tablePeekHtml(entry){
  const {card,count,gear,tapped}=entry;
  const commander=card.kind==="commander";
  const type=card.type||(commander?"Legendary Creature — Commander":/artifact/.test(entry.className)?"Artifact":/enchantment/.test(entry.className)?"Permanent":/pw/.test(entry.className)?"Planeswalker":card.p!=null?"Creature":"Card");
  const hasStats=card.p!=null&&card.t!=null&&entry.stat==null;
  const baseP=card.baseP!=null?card.baseP:card.p,baseT=card.baseT!=null?card.baseT:card.t;
  const changed=hasStats&&(card.p!==baseP||card.t!==baseT);
  const kws=(card.kws||[]).filter(Boolean);
  const state=[count>1?`${count} identical copies`:"",card.attacking?"Attacking":tapped?"Tapped":"",card.summoningSick?"Summoning sick":"",card.isToken?"Token":"",card.kind==="reanimated-creature"&&card.owner?`Reanimated from ${card.owner}`:""].filter(Boolean);
  return `<div class="tt-peek-h"><span class="tt-peek-ico">${escapeHtml(card.ico||"🃏")}</span><strong>${escapeHtml(card.name)}</strong>${count>1?`<span class="tt-peek-count">×${count}</span>`:""}</div>
    <div class="tt-peek-type">${escapeHtml(type)}${hasStats?`<span class="tt-peek-pt ${changed?(card.p>=baseP&&card.t>=baseT?"buffed":"shrunk"):""}">${card.p}/${card.t}</span>`:entry.stat?`<span class="tt-peek-pt">${escapeHtml(entry.stat)}</span>`:""}</div>
    ${changed?`<div class="tt-peek-sub">Printed ${baseP}/${baseT}</div>`:""}
    ${kws.length?`<ul class="tt-peek-kws">${kws.map(k=>{const r=keywordReminder(k);return `<li><b>${escapeHtml(k)}</b>${r?`: ${escapeHtml(r)}`:""}</li>`;}).join("")}</ul>`:""}
    ${card.effect?`<p class="tt-peek-effect">${escapeHtml(card.effect)}</p>`:""}
    ${gear.length?`<div class="tt-peek-gear"><span>Equipped</span>${gear.map(g=>`<div>⚙ ${escapeHtml(g.name)}${g.effect?` <em>${escapeHtml(g.effect)}</em>`:""}</div>`).join("")}</div>`:""}
    ${state.length?`<div class="tt-peek-state">${state.map(x=>`<span>${escapeHtml(x)}</span>`).join("")}</div>`:""}`;
}
const PEEK_KEY="ratt_card_peek";
function peekOnHover(){return safeGet(PEEK_KEY)!=="off";}
function updatePeekToggle(){const t=document.getElementById('peekToggle');if(t)t.checked=peekOnHover();}
function ensureTablePeek(){
  let el=document.getElementById('ttPeek');
  if(!el){el=document.createElement('div');el.id='ttPeek';el.className='tt-peek';el.setAttribute('role','tooltip');el.hidden=true;document.body.appendChild(el);
    window.addEventListener('scroll',hideTablePeek,{passive:true});
    document.addEventListener('pointerdown',e=>{if(!e.target.closest('[data-peek]'))hideTablePeek();});}
  return el;
}
function hideTablePeek(){const el=document.getElementById('ttPeek');if(el)el.hidden=true;}
function showTablePeek(cardEl){
  const entry=tablePeek[parseInt(cardEl.dataset.peek,10)];if(!entry)return;
  const el=ensureTablePeek();
  el.innerHTML=tablePeekHtml(entry);el.hidden=false;
  const r=cardEl.getBoundingClientRect(),w=el.offsetWidth,h=el.offsetHeight,gap=10;
  let left=r.right+gap;if(left+w>window.innerWidth-8)left=r.left-gap-w;if(left<8)left=Math.max(8,Math.min(window.innerWidth-w-8,r.left+r.width/2-w/2));
  let top=r.top+r.height/2-h/2;if(left<r.right&&left+w>r.left)top=r.top-gap-h<8?r.bottom+gap:r.top-gap-h;
  el.style.left=`${Math.round(left)}px`;el.style.top=`${Math.round(Math.max(8,Math.min(window.innerHeight-h-8,top)))}px`;
}
function wireTablePeek(board){
  board.querySelectorAll('[data-peek]').forEach(cardEl=>{
    cardEl.addEventListener('mouseenter',()=>{if(peekOnHover())showTablePeek(cardEl);});
    cardEl.addEventListener('mouseleave',hideTablePeek);
    cardEl.addEventListener('focus',()=>{if(peekOnHover())showTablePeek(cardEl);});
    cardEl.addEventListener('blur',hideTablePeek);
    cardEl.addEventListener('click',e=>{if(e.target.closest('button,[data-attack-uid],[data-block-open]')||(boardAttackMode()&&e.target.closest('[data-attack-target]')))return;showTablePeek(cardEl);});
  });
}
function renderTableView(state,board){
  const seatCount=state.opponents.length;
  board.className=`board table-view seats-${seatCount}`;board.style.borderColor='';
  const anim={prev:tableAnimState===state?tableAnimPrev:null,next:new Map()};
  tablePeek=[];hideTablePeek();
  const seats=state.opponents.map(opp=>tableOpponentSeatHtml(state,opp,anim)).join("");
  board.innerHTML=`<div class="board-h"><span class="ico">🂠</span><span>Table</span><div class="view-controls">${viewSwitchHtml(state)}</div></div>
    <div class="tt-felt"><div class="tt-table">${seats}${tablePlayerSeatHtml(state,anim)}</div></div>`;
  tableAnimPrev=anim.next;tableAnimState=state;
  const now=performance.now();tableAnimLive.forEach((l,k)=>{if(now-l.start>2000)tableAnimLive.delete(k);});
  wireBoardControls(board,state);
  wireTablePeek(board);
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
/* Acknowledge-only notice (OK). Escape also acknowledges. */
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
 * "Declare blockers" popup for a CPU attack on you: lists only the attacking
 * creatures. For each one pick Unblocked / Block / Block & kill / Destroy /
 * Exile; for tramplers, your blocker's toughness. With tracked creatures, an
 * optional Blocker picker fills in the toughness and whether it dies
 * (resolveSingleBlock). `initial` maps uid → {choice,
 * blockerDies, toughness, blockerUid}.
 * Resolves with that map (edited), or null when cancelled.
 */
const BLOCK_CHOICES=[
  {id:"none",ico:"⚔",label:"Unblocked"},
  {id:"block",ico:"🛡️",label:"Block"},
  {id:"kill",ico:"💀",label:"Block & kill"},
  {id:"destroy",ico:"☠",label:"Destroy"},
  {id:"exile",ico:"✦",label:"Exile"}
];
function askCpuAttackBlocks(opp,result,attackers,initial,previewFn){
  const picks=new Map(attackers.map(t=>[t.uid,Object.assign({choice:"none",blockerDies:false,toughness:2,blockerUid:null},initial.get(t.uid)||{})]));
  const pw=cpuAttackPlaneswalker(result);
  const yours=trackedPlayerCreatures(gameState.player).filter(canBlockCreature);
  const yourCreature=uid=>yours.find(c=>c.uid===uid)||null;
  // Identical copies get a number so each blocker is distinguishable.
  const blockerLabel=c=>{
    const same=yours.filter(o=>o.name===c.name&&o.p===c.p&&o.t===c.t);
    return `${c.name} ${c.p}/${c.t}${same.length>1?` #${same.indexOf(c)+1}`:""}`;
  };
  const canBlockAttacker=(blocker,attacker)=>!hasKeyword(attacker,"Flying")||hasKeyword(blocker,"Flying")||hasKeyword(blocker,"Reach");
  // Picking your blocker works out the block: who dies, and how much tramples over.
  const applyBlocker=(attacker,pick)=>{
    const blocker=yourCreature(pick.blockerUid);
    if(!blocker){pick.blockerUid=null;return;}
    const outcome=resolveSingleBlock(attacker,blocker);
    pick.choice=outcome.attackerDies?"kill":"block";
    pick.blockerDies=outcome.blockerDies;
    pick.toughness=blocker.t||0;
  };
  return new Promise(res=>{
    inputResolver=res;
    const body=openInputDialog({title:`${opp.ico} ${nm(opp)} attacks ${pw?`⬡ ${pw.name}`:"you"}`,okLabel:"Confirm blocks",cancelLabel:"Back",bodyHtml:""});
    const render=()=>{
      const rows=attackers.map(t=>{
        const pick=picks.get(t.uid);
        const blocked=pick.choice==="block"||pick.choice==="kill";
        const choices=BLOCK_CHOICES.filter(c=>!(t.kind==="commander"&&c.id==="exile")).map(c=>{
          const label=t.kind==="commander"&&c.id==="destroy"?"Remove":c.label;
          return `<button type="button" class="block-choice choice-${c.id}${pick.choice===c.id?" active":""}" data-block-uid="${escapeHtml(t.uid)}" data-block-choice="${c.id}" aria-pressed="${pick.choice===c.id}"><span aria-hidden="true">${c.ico}</span> ${label}</button>`;
        }).join("");
        const taken=new Set([...picks.entries()].filter(([uid,p])=>uid!==t.uid&&p.blockerUid).map(([,p])=>p.blockerUid));
        const options=yours.filter(c=>!taken.has(c.uid)&&canBlockAttacker(c,t));
        const blockerSelect=options.length||pick.blockerUid?`<label class="block-blocker">Blocker<select data-blocker-for="${escapeHtml(t.uid)}">
            <option value="">${blocked?"A creature not added as a card":"Choose…"}</option>
            ${options.map(c=>`<option value="${escapeHtml(c.uid)}" ${pick.blockerUid===c.uid?"selected":""}>${escapeHtml(blockerLabel(c))}</option>`).join("")}</select></label>`:"";
        const extra=blocked||blockerSelect?`<div class="block-row-extra">${blockerSelect}
            ${blocked&&!pick.blockerUid&&hasKeyword(t,"Trample")?`<div class="inline-stepper block-toughness" data-toughness-uid="${escapeHtml(t.uid)}"><label>Blocker toughness (trample)</label><button type="button" data-step-delta="-1" aria-label="Decrease blocker toughness">−</button><input type="number" min="0" max="99" value="${pick.toughness}" aria-label="Blocker toughness"><button type="button" data-step-delta="1" aria-label="Increase blocker toughness">+</button></div>`:""}
          </div>`:"";
        return `<div class="block-row is-${pick.choice}">
          <div class="block-row-card">${cardReferenceHtml(t)}<span class="block-row-pt">${(t.p||0)*combatStrikeCount(t)} dmg</span></div>
          <div class="block-choices" role="group" aria-label="${escapeHtml(t.name)}">${choices}</div>${extra}</div>`;
      }).join("");
      body.innerHTML=`<div class="block-dialog"><p class="confirm-msg">Choose what happens to each attacker. Unblocked attackers deal their damage.</p>
        <div class="block-rows">${rows}</div><div class="block-summary">${escapeHtml(previewFn(picks))}</div></div>`;
      body.querySelectorAll('[data-block-choice]').forEach(btn=>{btn.onclick=()=>{
        const pick=picks.get(btn.dataset.blockUid);pick.choice=btn.dataset.blockChoice;
        if(pick.choice!=="block"&&pick.choice!=="kill")pick.blockerUid=null;
        render();
      };});
      body.querySelectorAll('[data-blocker-for]').forEach(sel=>{sel.onchange=()=>{
        const attacker=attackers.find(a=>a.uid===sel.dataset.blockerFor);const pick=picks.get(sel.dataset.blockerFor);
        pick.blockerUid=sel.value||null;
        if(pick.blockerUid)applyBlocker(attacker,pick);else{pick.blockerDies=false;if(pick.choice==="none")pick.choice="block";}
        render();
      };});
      body.querySelectorAll('[data-toughness-uid]').forEach(stepper=>{
        const pick=picks.get(stepper.dataset.toughnessUid);const inp=stepper.querySelector('input');
        const set=v=>{pick.toughness=Math.max(0,Math.min(99,isNaN(v)?0:v));inp.value=pick.toughness;body.querySelector('.block-summary').textContent=previewFn(picks);};
        stepper.querySelectorAll('[data-step-delta]').forEach(b=>{b.onclick=()=>set((parseInt(inp.value)||0)+parseInt(b.dataset.stepDelta));});
        inp.onchange=()=>set(parseInt(inp.value));
      });
    };
    render();
    document.getElementById('inputOk').onclick=()=>{closeInput();res(picks);};
    document.getElementById('inputCancel').onclick=()=>{closeInput();res(null);};
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
/**
 * "Add creature" popup: name, P/T, keywords, commander / token, and how many
 * copies to put onto your battlefield. Resolves {spec, count} or null.
 */
function askPlayerCreature(){
  const p=gameState.player;
  const canCommander=!playerCommanderCreature(p);
  const spec={name:"",p:2,t:2,kws:[],commander:false,isToken:false};
  let count=1;
  return new Promise(res=>{
    inputResolver=res;
    const num=(id,label,value)=>`<div class="inline-stepper" data-num="${id}"><label>${label}</label><button type="button" data-step-delta="-1" aria-label="Decrease ${label}">−</button><input type="number" min="0" max="99" value="${value}" aria-label="${label}"><button type="button" data-step-delta="1" aria-label="Increase ${label}">+</button></div>`;
    const body=openInputDialog({title:"Add creature to your battlefield",okLabel:"Add",bodyHtml:`<div class="creature-dialog">
      <label class="cmd-text-field">Name<input type="text" id="creatureName" placeholder="e.g. Llanowar Elves" maxlength="60"></label>
      <div class="creature-dialog-row">${num("p","Power",spec.p)}${num("t","Toughness",spec.t)}${num("count","Copies",count)}</div>
      <div class="kw-chips">${PLAYER_CREATURE_KEYWORDS.map(kw=>`<button type="button" class="kw-chip" data-kw="${kw}" aria-pressed="false">${kw}</button>`).join("")}</div>
      <div class="creature-dialog-row">${canCommander?`<label class="block-check"><input type="checkbox" id="creatureCommander"> Your commander</label>`:""}<label class="block-check"><input type="checkbox" id="creatureToken"> Token</label></div>
      </div>`});
    body.querySelectorAll('[data-num]').forEach(stepper=>{
      const field=stepper.dataset.num;const inp=stepper.querySelector('input');
      const min=field==="count"?1:0;
      const set=v=>{v=Math.max(min,Math.min(99,isNaN(v)?min:v));inp.value=v;if(field==="count")count=v;else spec[field]=v;};
      stepper.querySelectorAll('[data-step-delta]').forEach(b=>{b.onclick=()=>set((parseInt(inp.value,10)||0)+parseInt(b.dataset.stepDelta,10));});
      inp.onchange=()=>set(parseInt(inp.value,10));
    });
    body.querySelectorAll('.kw-chip').forEach(chip=>{chip.onclick=()=>{
      const kw=chip.dataset.kw;const on=!spec.kws.includes(kw);
      spec.kws=on?[...spec.kws,kw]:spec.kws.filter(k=>k!==kw);
      chip.classList.toggle('active',on);chip.setAttribute('aria-pressed',on);
    };});
    const nameInput=document.getElementById('creatureName');
    const done=()=>{
      spec.name=nameInput.value.trim();
      spec.commander=!!document.getElementById('creatureCommander')?.checked;
      spec.isToken=!!document.getElementById('creatureToken')?.checked;
      if(spec.commander)count=1;
      closeInput();res({spec,count});
    };
    nameInput.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();done();}};
    document.getElementById('inputOk').onclick=done;
    document.getElementById('inputCancel').onclick=()=>{closeInput();res(null);};
    setTimeout(()=>nameInput.focus(),60);
  });
}
/* Add-creature flow shared by the board and the main phase. */
async function addPlayerCreatureFlow(onDone){
  const picked=await askPlayerCreature();
  if(!picked)return;
  cmdSnapshot();
  addPlayerCreatures(gameState,picked.spec,picked.count);
  saveState();renderBoardView(gameState);renderLifeHud(gameState);
  if(onDone)onDone();else refreshActivePanel();
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
  const defaultGained=action.playerRemoval?.leavesToken?1:0;
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

/* Screen-reader turn banner (#turnBanner, shared with Adventure mode): says whose turn it is. */
function updateCommanderTurnBanner(state){
  const b=document.getElementById('turnBanner');
  if(!b||!state)return;
  const active=state.phase==="cpu"?oppById(state.activeOppId):null;
  b.className=`turn-banner ${active?"garruk":"player"} sr-only`;
  b.removeAttribute('aria-hidden');
  const ico=document.getElementById('tbIco'),text=document.getElementById('tbText'),sub=document.getElementById('tbSub');
  if(ico)ico.textContent=active?(active.ico||"⚔"):"🗡️";
  if(text)text.textContent=active?`${nm(active)}'s Turn (Turn ${state.turn})`:state.phase==="cpu"?`Opponents' Turn (Turn ${state.turn})`:`Your Turn (Turn ${state.turn})`;
  if(sub)sub.textContent=active?"Respond, then continue":"Take your turn, then end it";
}
function showCommanderGame(){
  if(!gameState)return;
  ensureCommanderEffectState(gameState);
  applyBattlefieldRuleModifiers();
  document.getElementById('modePill').textContent=`Commander Battle`;
  document.getElementById('turnNum').textContent=gameState.turn;
  const active=oppById(gameState.activeOppId);
  document.getElementById('phasePill').textContent=gameState.phase==="ready"?"Ready to start":gameState.phase==="cpu"&&active?`${nm(active)}'s Turn`:gameState.phase==="cpu"?"Opponents' Turn":"Your Turn";
  updateCommanderTurnBanner(gameState);
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
let confirmBarKey="",confirmBarReadyAt=0;
let stepStatusFn=null;
function setConfirmButton(text,className,onclick,showEndTurn,previewFn){
  const bar=ensureConfirmBar();
  let html=`<button class="cmd-confirm-btn ${className}" id="cmdConfirmBtn"><span class="cmd-preview" hidden></span><span class="cmd-label">${text}</span><kbd class="cmd-key" aria-hidden="true">Space</kbd></button>`;
  if(showEndTurn)html+=`<button class="cmd-confirm-btn cmd-end-turn-btn ${className}" id="cmdEndTurnBtn">End Turn</button>`;
  // Player Action and Battlefield Rules open as popups from the bar, on every turn screen.
  if(gameState&&(gameState.phase==="player"||gameState.phase==="cpu")){
    const rules=activeBattlefieldRules().length;
    html+=`<span class="cmd-icon-group"><button type="button" class="cmd-icon-btn" id="cmdPlayerActionBtn" title="Player action: discard, mill, destroy, draw, life, poison, tokens…" aria-label="Player action">⚡<span class="cmd-icon-lbl">Action</span></button>
      <button type="button" class="cmd-icon-btn" id="cmdRulesBtn" title="Battlefield rules: your ongoing effects that restrict the CPUs" aria-label="Battlefield rules${rules?`, ${rules} active`:""}">🛡<span class="cmd-icon-lbl">Rules</span>${rules?`<span class="cmd-icon-badge">${rules}</span>`:""}</button></span>`;
  }
  bar.innerHTML=html;
  // The bar's buttons move between screens (End Turn can land where Continue was), so a
  // double-click or a fast second click would hit the new button. Ignore clicks briefly.
  // Only a new screen restarts the pause; redraws of the same screen (stepper edits) don't.
  const barKey=`${windowSeq}|${text}|${showEndTurn?1:0}`;
  if(barKey!==confirmBarKey){confirmBarKey=barKey;confirmBarReadyAt=performance.now()+450;}
  const readyAt=confirmBarReadyAt;
  const guarded=fn=>event=>{if(performance.now()<readyAt){event.preventDefault();return;}fn(event);};
  document.getElementById('cmdConfirmBtn').onclick=guarded(onclick);
  if(showEndTurn)document.getElementById('cmdEndTurnBtn').onclick=guarded(()=>endTurnFromCurrentStep());
  document.getElementById('cmdPlayerActionBtn')?.addEventListener('click',openPlayerActionPopup);
  document.getElementById('cmdRulesBtn')?.addEventListener('click',openBattlefieldRulesPopup);
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
const RECAP_KEY="ratt_recap";
function recapEnabled(){return safeGet(RECAP_KEY)!=="off";}
function setRecapEnabled(on){safeSet(RECAP_KEY,on?"on":"off");updateRecapToggle();}
function updateRecapToggle(){
  const toggle=document.getElementById('recapToggle');
  if(toggle)toggle.checked=recapEnabled();
}
function markRecapStart(){
  const life={player:gameState.player.life};
  gameState.opponents.forEach(opp=>{life[opp.id]=opp.life;});
  // Board bookmark for the "Since your last turn" popup: who controls which creatures.
  const creatures={player:Object.fromEntries((gameState.player.tokens||[]).map(t=>[t.uid,t.name]))};
  gameState.opponents.forEach(opp=>{creatures[opp.id]=Object.fromEntries(opp.tokens.map(t=>[t.uid,t.name]));});
  gameState.recap={seq:gameState.logSeq||0,life,creatures,paper:untrackedPlayerCreatures(gameState.player),
    cmdDamage:{...(gameState.player.commanderDamageReceived||{})},poison:gameState.player.poison||0,
    dead:gameState.opponents.filter(isOpponentDead).map(o=>o.id)};
}
/* "2× Soldier token, Primal Hydra" */
function recapNameList(names){
  const counts=new Map();names.forEach(n=>counts.set(n,(counts.get(n)||0)+1));
  return [...counts].map(([n,c])=>`${c>1?`${c}× `:""}${escapeHtml(n)}`).join(", ");
}
/* Popup overview of everything since you ended your last turn: life, creatures that died or
   arrived, commander damage, eliminations, and what each CPU did. */
function recapPopupHtml(){
  const recap=gameState.recap;
  if(!recap)return `<p class="recap-quiet">Nothing to report yet.</p>`;
  const seats=[{id:"player",ico:"🗡️",name:"You",life:gameState.player.life,tokens:gameState.player.tokens||[]},
    ...gameState.opponents.map(o=>({id:o.id,ico:o.ico,name:nm(o),life:o.life,tokens:o.tokens,opp:o}))];
  const section=(title,body)=>body?`<section class="recap-section"><h4>${title}</h4>${body}</section>`:"";
  // Life
  const lives=seats.filter(p=>recap.life[p.id]!=null&&recap.life[p.id]!==p.life).map(p=>{
    const delta=p.life-recap.life[p.id];
    return `<span class="recap-life ${delta<0?"down":"up"}${p.id==="player"?" is-you":""}">${p.ico} ${escapeHtml(p.name)} ${recap.life[p.id]} → <b>${p.life}</b> <small>(${delta>0?"+":"−"}${Math.abs(delta)})</small></span>`;
  });
  let html=section("Life",lives.length?`<div class="recap-lives">${lives.join("")}</div>`:`<p class="recap-quiet">No life totals changed.</p>`);
  // Eliminations, commander damage and poison on you
  const notes=[];
  gameState.opponents.filter(o=>isOpponentDead(o)&&!(recap.dead||[]).includes(o.id)).forEach(o=>notes.push(`☠ <b>${escapeHtml(nm(o))}</b> was eliminated.`));
  const cmd=gameState.player.commanderDamageReceived||{};
  gameState.opponents.forEach(o=>{
    const before=(recap.cmdDamage||{})[o.id]||0,now=cmd[o.id]||0;
    if(now>before)notes.push(`⚜ ${escapeHtml(nm(o))} dealt you ${now-before} commander damage <b>(${now}/21)</b>.`);
  });
  if((gameState.player.poison||0)>(recap.poison||0))notes.push(`☣ You got ${(gameState.player.poison||0)-(recap.poison||0)} poison <b>(${gameState.player.poison}/10)</b>.`);
  html+=section("Watch out",notes.length?`<ul class="recap-lines">${notes.map(n=>`<li>${n}</li>`).join("")}</ul>`:"");
  // Creatures that left and arrived, per seat
  if(recap.creatures){
    const left=[],arrived=[];
    seats.forEach(p=>{
      const before=recap.creatures[p.id]||{};
      const nowUids=new Set(p.tokens.map(t=>t.uid));
      const gone=Object.entries(before).filter(([uid])=>!nowUids.has(uid)).map(([,n])=>n);
      const fresh=p.tokens.filter(t=>!(t.uid in before)).map(t=>t.name);
      if(p.id==="player"){
        const paperDelta=untrackedPlayerCreatures(gameState.player)-(recap.paper||0);
        if(paperDelta<0)gone.push(...Array(-paperDelta).fill("Creature (not added as a card)"));
        if(paperDelta>0)fresh.push(...Array(paperDelta).fill("Creature (not added as a card)"));
      }
      if(gone.length)left.push(`<li>${p.ico} <b>${escapeHtml(p.name)}</b>: ${recapNameList(gone)}</li>`);
      if(fresh.length)arrived.push(`<li>${p.ico} <b>${escapeHtml(p.name)}</b>: ${recapNameList(fresh)}</li>`);
    });
    html+=section("Creatures that died or left",left.length?`<ul class="recap-lines">${left.join("")}</ul>`:"");
    html+=section("New creatures",arrived.length?`<ul class="recap-lines">${arrived.join("")}</ul>`:"");
  }
  // What each CPU did (its spell summary and attacks), oldest first
  const lines=gameState.log.filter(e=>e.seq>recap.seq).reverse().map(e=>e.msg)
    .filter(m=>/^⚔/.test(m)||gameState.opponents.some(o=>m.startsWith(`${o.ico} `)));
  html+=section("What happened",lines.length?`<ul class="recap-lines">${lines.map(m=>`<li>${m}</li>`).join("")}</ul>`:`<p class="recap-quiet">The opponents made no notable plays.</p>`);
  return `<div class="recap-popup">${html}</div>`;
}
function showRecapPopup(){
  openInfoModal(`📜 Since your last turn · Round ${gameState.turn}`,recapPopupHtml());
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
  // An attack on you opens the blockers popup once per window.
  const draft=responseDraft;
  if(cpuAttacksPlayer(result)&&!draft.blocksPrompted){draft.blocksPrompted=true;openBlockersDialog(opp,result);}
}
function cpuAttacksPlayer(result){return !!result&&result.stage==="combat"&&result.target==="player"&&result.attackPower>0;}
/* The blockers popup's picks, read from / written to the response draft. */
function blockPicksFromDraft(draft,attackers){
  const picks=new Map();
  attackers.forEach(t=>{
    const removal=draft.removals.get(t.uid),block=draft.blocks.get(t.uid);
    if(removal)picks.set(t.uid,{choice:removal.destination==="exile"?"exile":"destroy"});
    else if(block)picks.set(t.uid,{choice:draft.combatDeaths.has(t.uid)?"kill":"block",blockerDies:!!block.blockerDies,toughness:block.blockerToughness??2,blockerUid:block.blockerUid||null});
    else if(draft.combatDeaths.has(t.uid))picks.set(t.uid,{choice:"kill"});
  });
  return picks;
}
function blockEntry(token,uid,pick){
  return {uid,blockerToughness:token&&hasKeyword(token,"Trample")?pick.toughness:null,blockerDies:!!pick.blockerDies,blockerUid:pick.blockerUid||null};
}
function responseWithPicks(opp,result,picks){
  const r=Object.assign(buildCpuResponse(opp,result),{damageToPlayer:null,commanderDamageToPlayer:null,damageToPW:null});
  const uids=new Set(picks.keys());
  r.removals=r.removals.filter(x=>!uids.has(x.uid));
  r.blocks=r.blocks.filter(b=>!uids.has(b.uid));
  r.combatDeaths=r.combatDeaths.filter(uid=>!uids.has(uid));
  picks.forEach((pick,uid)=>{
    const token=findTokenByUid(opp,uid);
    if(pick.choice==="destroy"||pick.choice==="exile")r.removals.push({ownerId:opp.id,uid,destination:pick.choice==="exile"?"exile":"graveyard",checked:true});
    if(pick.choice==="block"||pick.choice==="kill")r.blocks.push(blockEntry(token,uid,pick));
    if(pick.choice==="kill")r.combatDeaths.push(uid);
  });
  return r;
}
function blockPreviewText(opp,result,picks){
  const attack=previewCpuResponse(opp,result,responseWithPicks(opp,result,picks)).attack;
  if(!attack)return "";
  const parts=[];
  if(attack.pwDamage)parts.push(`⬡ ${attack.planeswalker?attack.planeswalker.name:"Planeswalker"} takes ${attack.pwDamage}`);
  if(attack.playerDamage||!attack.pwDamage)parts.push(`You take ${attack.playerDamage}${attack.commanderDamage?` (${attack.commanderDamage} commander)`:""}`);
  if(attack.prevented)parts.push(`${attack.prevented} prevented`);
  return parts.join(" · ");
}
async function openBlockersDialog(opp,result){
  const seq=windowSeq;
  const draft=responseDraft;
  const attackers=opp.tokens.filter(t=>t.attacking);
  if(!draft||!attackers.length)return;
  const picks=await askCpuAttackBlocks(opp,result,attackers,blockPicksFromDraft(draft,attackers),p=>blockPreviewText(opp,result,p));
  if(!picks||seq!==windowSeq||draft!==responseDraft)return;
  const answered=[];
  let snapshotTaken=false;
  picks.forEach((pick,uid)=>{
    const prior=draft.removals.get(uid);
    draft.blocks.delete(uid);draft.combatDeaths.delete(uid);
    if(pick.choice==="destroy"||pick.choice==="exile"){
      const destination=pick.choice==="exile"?"exile":"graveyard";
      if(prior){prior.destination=destination;return;}
      // The CPU may answer your removal (protection spell) before it resolves.
      if(!snapshotTaken){cmdSnapshot();snapshotTaken=true;}
      const response=cpuProtectAgainstRemoval(opp,uid);
      if(response){answered.push(response.label);return;}
      draft.removals.set(uid,{ownerId:opp.id,uid,destination,checked:true});
      return;
    }
    draft.removals.delete(uid);
    const token=findTokenByUid(opp,uid);
    if(pick.choice==="block"||pick.choice==="kill")draft.blocks.set(uid,blockEntry(token,uid,pick));
    if(pick.choice==="kill")draft.combatDeaths.add(uid);
  });
  // Tracked blockers that die are removed by uid; other deaths go in "Your creatures that died".
  draft.overrides={};
  if(snapshotTaken)saveState();
  renderBoardView(gameState);renderLifeHud(gameState);renderCpuWindowForm();
  if(answered.length)await showNotice("Removal answered",`<strong>${answered.map(escapeHtml).join("<br>")}</strong>.<br><br>Your removal has no effect.`);
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
function commanderDeckCardByName(name,opp){
  return name?cardDefinitionByName(name,opp):null;
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
  const card=commanderDeckCardByName(cardName,opp);
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
  if(attacksPlayer){
    const attackers=opp.tokens.filter(t=>t.attacking);
    const body=`<div class="kill-select">${attackers.map(t=>tokenChoiceHtml(opp,t,draft,true)).join("")}</div>
      <div class="attack-builder-actions"><button type="button" class="target-btn" id="declareBlockersBtn">🛡 Declare blockers</button></div>`;
    html+=responseStepHtml(stepNo++,"remove","Block or remove attackers","Select an attacker, or open Declare blockers, to block it, kill it, or remove it.",body,"precombat-removal");
  }else{
    let removeBody=ownerGroupHtml(opp,opp.tokens,draft,defender?"attacker":"",attackerUids);
    if(defender&&!isOpponentDead(defender))removeBody+=ownerGroupHtml(defender,defender.tokens,draft,"defender",attackerUids);
    if(removeBody){
      const hint=defender?`${oppName} is attacking ${nm(defender)}. Select any creature you removed before combat damage.`
        :"Select any creature you removed at instant speed.";
      html+=responseStepHtml(stepNo++,"remove","Remove creatures",hint,removeBody,"precombat-removal");
    }
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

  // Rarely needed, so folded away; opens by itself once something is entered.
  const extrasUsed=draft.flashCreatures||draft.lifeGained||draft.instantDamage;
  html+=`<details class="context-disclosure response-extras"${draft.extrasOpen||extrasUsed?" open":""}><summary><span>Instant-speed responses</span><small>${extrasUsed?"Set":"Optional"}</small></summary><div class="context-disclosure-body">
    <div class="commander-player-actions">
      ${stepperHtml("flashCreatures","Creatures you flashed in",draft.flashCreatures)}
      ${stepperHtml("lifeGained","Life you gained",draft.lifeGained)}
      ${stepperHtml("instantDamage","Damage you dealt",draft.instantDamage)}
      ${draft.instantDamage>0?instantTargetsHtml(draft):""}
    </div></div></details>`;
  html+='</div>';
  panel.innerHTML=html;

  const extras=panel.querySelector('.response-extras');
  extras.addEventListener('toggle',()=>{draft.extrasOpen=extras.open;});
  // The damage target only appears once you deal damage.
  wireDraftSteppers(extras,draft,field=>{if(field==="instantDamage"&&(draft.instantDamage>0)!==!!extras.querySelector('.instant-target-row'))renderCpuWindowForm();});
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
    btn.onclick=()=>attacksPlayer?openBlockersDialog(opp,result):selectResponseToken(oppById(btn.dataset.owner),btn.dataset.uid);
  });
  panel.querySelector('#declareBlockersBtn')?.addEventListener('click',()=>openBlockersDialog(opp,result));

  const continueLabel=result.stage==="main"?"Continue to Combat ▸":nextSeatLabel();
  setConfirmButton(continueLabel,"garruk",()=>continueCpuWindow(seq),false,()=>cpuWindowPreviewText(opp,result));
  stepStatusFn=()=>{
    const r=buildCpuResponse(opp,result);
    setStepStatus(panel,"counter",r.counters.length?`${r.counters.length} countered`:"",r.counters.length>0);
    const removed=r.removals.length+r.combatDeaths.filter(uid=>!r.blocks.some(b=>b.uid===uid)).length;
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
/* Select / deselect a creature to remove in the response form (attacks on you use openBlockersDialog). */
async function selectResponseToken(owner,uid){
  if(!owner||!responseDraft)return;
  const draft=responseDraft;
  const token=findTokenByUid(owner,uid);
  if(!token)return;
  if(draft.removals.has(uid)||draft.blocks.has(uid)||draft.combatDeaths.has(uid)){
    draft.removals.delete(uid);draft.blocks.delete(uid);draft.combatDeaths.delete(uid);
    draft.overrides={};renderCpuWindowForm();return;
  }
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
  let html=`<details class="context-disclosure player-action-disclosure"${draft.actionOpen?" open":""}><summary><span>Create Player Action ${helpTip("Resolve your spell or ability that affects players: discard, mill, destroy, bounce, draw, life, poison, or tokens.")}</span><small></small></summary><div class="context-disclosure-body"><div class="context-section player-effect-section">
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

/* Player action draft for the open screen: one per step / CPU window. */
function playerActionContext(){
  if(gameState.phase==="cpu"&&responseDraft)return {contextKey:`cpu:${responseDraft.key}`,help:"Resolve an instant-speed action, then continue the opponent's turn."};
  if(gameState.playerStep==="combat")return {contextKey:`combat:${gameState.turn}`,help:"Resolve a player action before combat damage."};
  return {contextKey:`player:${gameState.turn}:${gameState.playerStep}`,help:"All resolves to each target’s available amount. Noncreature permanents you control remain a table action."};
}
function openPlayerActionPopup(){
  const ctx=playerActionContext();
  openInfoModal("⚡ Player Action",'<div class="modal-panel" id="playerActionModal"></div>');
  const draft=playerActionDraft(ctx.contextKey);draft.actionOpen=true;
  renderPlayerActionPanel(document.getElementById('playerActionModal'),{...ctx,onResolved:()=>{closeInfoModal();refreshActivePanel();}});
}
function openBattlefieldRulesPopup(){
  openInfoModal("🛡 Battlefield Rules",'<div class="modal-panel" id="rulesModal"></div>');
  const host=document.getElementById('rulesModal');
  const render=()=>{battlefieldRulesOpen=true;host.innerHTML=buildBattlefieldRulesPanel();wireBattlefieldRulesPanel(host,()=>{render();refreshActivePanel();});};
  render();
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
  return `<details class="rules-disclosure" id="battlefieldRulesDisclosure"${battlefieldRulesOpen?" open":""}><summary><span>🛡 Battlefield Rules ${helpTip("Ongoing effects you control that restrict the CPUs, such as Stony Silence.")}${active.length?` <em class="rules-count">${active.length} active</em>`:""}</span><small></small></summary>
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
let playerDraft=null;   // {key, creaturesPlayed, lifeGained}
let attackDraft=null;   // {key, mode:"builder"|"review"|"manual", rows, outcome, manual}
function playerStepDraft(){
  const key=`${gameState.turn}:${gameState.playerStep}`;
  if(!playerDraft||playerDraft.key!==key)playerDraft={key,creaturesPlayed:0,lifeGained:0};
  return playerDraft;
}

function startPlayerPhase(){
  gameState.phase="player";
  gameState.activeOppId=null;gameState.activeResult=null;gameState.responseStage=null;
  gameState.playerStep="draw";
  playerDraft=null;attackDraft=null;commanderEffectDraft=null;
  saveState();
  showPlayerStep();
  if(recapEnabled())showRecapPopup();
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
// With the "Since your last turn" popup on, the step offers a button to reopen it;
// with it off, the recap shows inline here.
function showDrawStep(){
  const p=gameState.player;
  const skip=playerSkipsFirstDraw(gameState);
  setPlayerStepHeader("Draw Step",skip?"Untap and resolve upkeep triggers. You skip your first draw.":"Untap your permanents, resolve upkeep triggers, then draw a card.","Upkeep & Draw");
  const panel=document.getElementById('respGrid');
  const recapHtml=recapEnabled()?`<div class="attack-builder-actions"><button type="button" class="target-btn" id="recapPopupBtn">📜 Since your last turn</button></div>`:buildRecapHtml();
  panel.innerHTML=`<div class="context-form commander-form">${recapHtml}
    <div class="context-summary draw-summary"><span class="context-summary-icon">🃏</span><div><strong>${skip?"No draw this turn":"Draw for the turn"}</strong><span>${skip?"The first player in a two-player game skips the first draw.":`Library ${p.librarySize||0} → ${Math.max(0,(p.librarySize||0)-1)}`}</span></div></div>
  </div>`;
  const openLogBtn=panel.querySelector('#recapOpenLog');
  if(openLogBtn&&typeof openLog==="function")openLogBtn.onclick=openLog;
  panel.querySelector('#recapPopupBtn')?.addEventListener('click',showRecapPopup);
  setConfirmButton(skip?"Continue to Main Phase ▸":"Draw a Card ▸","",()=>goToPlayerStep("main1",()=>playerDrawStep(gameState)),false);
}

/* --- MAIN PHASES --- */
function mainStepPanelHtml(draft,extraHtml,topHtml){
  return `<div class="context-form commander-form">${topHtml||""}<div class="context-section"><div class="attack-builder-actions"><button type="button" class="target-btn" id="mainAddCreatureBtn">+ Creature you played</button></div><div class="commander-player-actions">
    ${stepperHtml("lifeGained","Life you gained",draft.lifeGained)}
  </div>${extraHtml||""}</div></div>`;
}
function mainStepPreview(draft){
  return joinPreview([draft.creaturesPlayed>0&&`+${plural(draft.creaturesPlayed,"creature")}`,draft.lifeGained>0&&`+${draft.lifeGained} life`]);
}
function renderMainPanel(rerender,extraHtml,topHtml){
  const draft=playerStepDraft();
  const panel=document.getElementById('respGrid');
  panel.innerHTML=mainStepPanelHtml(draft,extraHtml,topHtml);
  wireDraftSteppers(panel.querySelector('.commander-player-actions'),draft);
  panel.querySelector('#mainAddCreatureBtn').onclick=()=>addPlayerCreatureFlow(rerender);
  return draft;
}
function showMainStep(){
  setPlayerStepHeader("Main Phase","Play lands, cast spells, and record what changed.","Your Actions");
  const draft=renderMainPanel(showMainStep);
  setConfirmButton("Go to Combat ▸","",()=>goToPlayerStep("combat",()=>applyPlayerTurnInputs(gameState,draft)),true,()=>mainStepPreview(draft));
}
function showMainTwoStep(){
  setPlayerStepHeader("Main Phase 2","Cast spells, record what changed, then end your turn.","Your Actions");
  const draft=renderMainPanel(showMainTwoStep);
  setConfirmButton("End Turn ▸","",()=>endPlayerTurn(()=>applyPlayerTurnInputs(gameState,draft,"after combat")),false,()=>mainStepPreview(draft));
}

/* --- END OF TURN --- */
/* End Turn from any step applies that step's entries first. */
async function endTurnFromCurrentStep(){
  const step=gameState.playerStep;
  const draft=playerDraft;
  // Ending before combat with creatures that could attack is usually a misclick: ask.
  const couldAttack=gameState.player.creatures>0&&trackedPlayerCreatures(gameState.player).filter(t=>!isCreatureTapped(t)).length+untrackedPlayerCreatures(gameState.player)>0;
  if((step==="draw"||step==="main1")&&couldAttack){
    if(!await askConfirm("End your turn?","You haven't gone to combat yet. Ending now skips your attack this turn.","End Turn","Keep playing"))return;
    if(gameState.phase!=="player"||gameState.playerStep!==step)return;
  }
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
    <div class="attack-row-h"><strong>${row.commander?"⚜ ":""}${row.name?escapeHtml(row.name):row.commander?"Your commander":`Attacker ${i+1}`}</strong>
      ${row.uid?(row.kws.length?`<small class="attack-row-kws">${escapeHtml(row.kws.join(" · "))}</small>`:""):`<label class="attack-cmdr-toggle"><input type="checkbox" data-row-cmdr="${i}" ${row.commander?"checked":""}> Commander</label>`}
      <button type="button" class="btn-quiet attack-row-remove" data-row-remove="${i}" aria-label="Remove attacker ${i+1}">✕</button></div>
    <div class="attack-row-b">
      <div class="inline-stepper" data-row-field="p" data-row-index="${i}"><label>Power</label><button type="button" data-row-delta="-1" aria-label="Decrease power">−</button><input type="number" min="0" max="99" value="${row.p}" aria-label="Power"><button type="button" data-row-delta="1" aria-label="Increase power">+</button></div>
      <div class="inline-stepper" data-row-field="t" data-row-index="${i}"><label>Toughness</label><button type="button" data-row-delta="-1" aria-label="Decrease toughness">−</button><input type="number" min="0" max="99" value="${row.t}" aria-label="Toughness"><button type="button" data-row-delta="1" aria-label="Increase toughness">+</button></div>
      <label class="attack-target">Target<select data-row-target="${i}">${alive.map(o=>`<option value="${o.id}" ${row.targetId===o.id?"selected":""}>${o.ico} ${nm(o)} (${o.life})</option>`).join("")}</select></label>
    </div>
    ${row.uid?"":`<div class="kw-chips">${kwChips}</div>`}
  </div>`;
}
/* ---------- Declaring attacks on the board ----------
   While your Combat step is in the builder, the table is the input: click an opponent's
   seat to make it the target, then click your creatures to send them (click again to take
   one back, or pick another target and click to move it). The paper-creature pile adds an
   attacker for creatures you have not added as cards. */
function boardAttackMode(){
  return !!gameState&&!gameState.gameOver&&gameState.phase==="player"&&gameState.playerStep==="combat"
    &&(!attackDraft||attackDraft.key!==`${gameState.turn}`||attackDraft.mode==="builder");
}
function attackTargetId(){
  const draft=ensureAttackDraft();
  if(!aliveOpponents(gameState).some(o=>o.id===draft.activeTarget))draft.activeTarget=defaultAttackTarget();
  return draft.activeTarget;
}
function refreshCombatViews(){renderBoardView(gameState);showCombatStep();}
function setAttackTarget(id){
  if(!aliveOpponents(gameState).some(o=>o.id===id))return;
  ensureAttackDraft().activeTarget=id;refreshCombatViews();
}
function attackRowFor(t,targetId){return {uid:t.uid,name:t.name,p:t.p,t:t.t,kws:(t.kws||[]).slice(),targetId,commander:!!t.commander};}
function toggleBoardAttacker(uid){
  const draft=ensureAttackDraft();
  const t=trackedPlayerCreatures(gameState.player).find(x=>x.uid===uid);
  if(!t||isCreatureTapped(t))return;
  const target=attackTargetId();
  const row=draft.rows.find(r=>r.uid===uid);
  if(!row)draft.rows.push(attackRowFor(t,target));
  else if(row.targetId===target)draft.rows.splice(draft.rows.indexOf(row),1);
  else row.targetId=target;
  refreshCombatViews();
}
function addPaperAttacker(){
  const draft=ensureAttackDraft();
  if(draft.rows.filter(r=>!r.uid).length>=untrackedPlayerCreatures(gameState.player))return;
  draft.rows.push({p:2,t:2,kws:[],targetId:attackTargetId(),commander:false});
  refreshCombatViews();
}
function attackRowPower(r){return (parseInt(r.p)||0)*(r.kws.includes("Double Strike")?2:1);}
function attackRowLabel(r){return r.name||(r.commander?"Your commander":"Creature");}
function showCombatStep(){
  setPlayerStepHeader("Combat","Declare attackers on the table. Each defending CPU chooses its blockers.","Combat");
  const draft=ensureAttackDraft();
  const panel=document.getElementById('respGrid');
  const alive=aliveOpponents(gameState);
  if(draft.mode==="manual"){renderManualCombat(panel,alive);return;}
  if(draft.mode==="review"&&draft.outcome){renderAttackReview(panel,draft);return;}
  const p=gameState.player;
  const tracked=trackedPlayerCreatures(p);
  draft.rows=draft.rows.filter(r=>!r.uid||tracked.some(t=>t.uid===r.uid)); // cards removed since
  const target=attackTargetId();
  const targetOpp=oppById(target);
  const ready=tracked.filter(t=>!isCreatureTapped(t)&&!draft.rows.some(r=>r.uid===t.uid));
  const untracked=untrackedPlayerCreatures(p);
  const chips=alive.map(o=>`<button type="button" class="target-btn atk-target-chip${o.id===target?" active":""}" data-set-target="${o.id}" aria-pressed="${o.id===target}" style="--seat:${oppColor(o)}">${o.ico} ${escapeHtml(nm(o))} <small>♥ ${o.life}</small></button>`).join("");
  const summary=alive.map(o=>{
    const rows=draft.rows.map((r,i)=>({r,i})).filter(x=>x.r.targetId===o.id);
    if(!rows.length)return "";
    return `<div class="atk-summary-row" style="border-left-color:${oppColor(o)}"><b>${o.ico} ${escapeHtml(nm(o))}</b><span class="atk-summary-power">⚔ ${rows.reduce((s,x)=>s+attackRowPower(x.r),0)} power</span>
      <div class="atk-summary-chips">${rows.map(({r,i})=>`<span class="atk-chip">${r.commander?"⚜ ":""}${escapeHtml(attackRowLabel(r))} <small>${r.p}/${r.t}</small><button type="button" data-row-remove="${i}" aria-label="Take back ${escapeHtml(attackRowLabel(r))}">✕</button></span>`).join("")}</div></div>`;
  }).join("");
  const hint=tracked.length||untracked
    ?`On the table: click an opponent to choose who you attack (🎯), then click your creatures to send them. Click a creature again to take it back.${untracked?" Click your creature pile to attack with creatures you have not added as cards.":""}`
    :"You have no creatures on the battlefield. Add them with + Creature on your seat.";
  panel.innerHTML=`<div class="context-form commander-form">
    <section class="resolution-step response-step attack-builder" data-step="attackers">
      <div class="resolution-step-h"><span>1</span><strong>Declare attackers</strong><em class="step-status">${draft.rows.length?plural(draft.rows.length,"attacker"):"None"}</em></div>
      <p class="step-hint">${hint}</p>
      <div class="resolution-step-b">
        <div class="atk-targets" role="group" aria-label="Attack target">${chips}</div>
        ${summary||'<div class="empty-field">No attackers yet.</div>'}
        <div class="attack-builder-actions">
          ${ready.length?`<button type="button" class="target-btn" id="attackAllBtn">⚔ All ready creatures → ${escapeHtml(targetOpp?nm(targetOpp):"target")} (${ready.length})</button>`:""}
          <button type="button" class="target-btn" id="addAttackerBtn">+ Attacker not on the table</button>
          ${draft.rows.some(r=>r.commander)||tracked.some(t=>t.commander)?"":`<button type="button" class="target-btn" id="addCommanderBtn">+ Commander</button>`}
          <button type="button" class="btn-quiet" id="manualCombatBtn">Enter results manually</button>
        </div>
        ${draft.rows.length?`<details class="context-disclosure atk-adjust"${draft.adjustOpen?" open":""}><summary><span>Adjust attackers (power, toughness, keywords, target)</span><small>Optional</small></summary><div class="context-disclosure-body">${draft.rows.map((row,i)=>attackerRowHtml(row,i,alive)).join("")}</div></details>`:""}
      </div>
    </section></div>`;
  const rerender=()=>refreshCombatViews();
  const addRow=commander=>{draft.rows.push({p:commander?4:2,t:commander?4:2,kws:[],targetId:target,commander:!!commander});draft.adjustOpen=true;rerender();};
  panel.querySelectorAll('[data-set-target]').forEach(btn=>{btn.onclick=()=>setAttackTarget(btn.dataset.setTarget);});
  panel.querySelector('#attackAllBtn')?.addEventListener('click',()=>{ready.forEach(t=>draft.rows.push(attackRowFor(t,target)));rerender();});
  panel.querySelector('#addAttackerBtn').onclick=()=>addRow(false);
  panel.querySelector('#addCommanderBtn')?.addEventListener('click',()=>addRow(true));
  panel.querySelector('#manualCombatBtn').onclick=()=>{draft.mode="manual";rerender();};
  const adjust=panel.querySelector('.atk-adjust');
  if(adjust)adjust.addEventListener('toggle',()=>{draft.adjustOpen=adjust.open;});
  panel.querySelectorAll('[data-row-remove]').forEach(btn=>{btn.onclick=()=>{draft.rows.splice(parseInt(btn.dataset.rowRemove),1);rerender();};});
  panel.querySelectorAll('[data-row-cmdr]').forEach(box=>{box.onchange=()=>{const i=parseInt(box.dataset.rowCmdr);draft.rows.forEach((r,j)=>{if(!r.uid)r.commander=j===i?box.checked:false;});rerender();};});
  panel.querySelectorAll('[data-row-target]').forEach(sel=>{sel.onchange=()=>{draft.rows[parseInt(sel.dataset.rowTarget)].targetId=sel.value;rerender();};});
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
    const set=v=>{row[field]=Math.max(0,Math.min(99,v));inp.value=row[field];refreshConfirmPreview();renderBoardView(gameState);};
    stepper.querySelectorAll('[data-row-delta]').forEach(b=>{b.onclick=()=>set((parseInt(inp.value)||0)+parseInt(b.dataset.rowDelta));});
    inp.onchange=()=>set(parseInt(inp.value)||0);
  });
  const validRows=draft.rows.filter(r=>r.targetId);
  if(validRows.length){
    setConfirmButton("Declare Attackers ▸","",()=>{
      draft.outcome=computePlayerAttack(gameState,draft.rows);
      draft.mode="review";refreshCombatViews();
    },true,()=>{
      const per=alive.map(o=>({o,n:validRows.filter(r=>r.targetId===o.id)})).filter(x=>x.n.length);
      return per.map(x=>`${x.o.ico} ${x.n.reduce((s,r)=>s+attackRowPower(r),0)}`).join(" · ");
    });
  }else{
    setConfirmButton("Skip Combat ▸","",()=>goToPlayerStep("end",null),true);
  }
}
function renderAttackReview(panel,draft){
  const outcome=draft.outcome;
  const deadNames=(outcome.deadUids||[]).map(uid=>(gameState.player.tokens||[]).find(t=>t.uid===uid)).filter(Boolean).map(t=>t.name);
  const deaths=outcome.playerDeaths+deadNames.length;
  const rowsByOpp=outcome.perOpp.map(entry=>{
    const opp=oppById(entry.oppId);
    const killed=entry.kills.map(uid=>findTokenByUid(opp,uid)).filter(Boolean);
    return `<div class="context-section combat-opp-section" style="border-left:3px solid ${oppColor(opp)}">
      <div class="context-section-title">${opp.ico} ${nm(opp)}, ${opp.life} life → ${Math.max(0,opp.life-entry.damage)}</div>
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
          <li>${deaths?`💀 ${deadNames.length?escapeHtml(deadNames.join(", "))+(outcome.playerDeaths?` and ${plural(outcome.playerDeaths,"other creature")}`:""):plural(outcome.playerDeaths,"creature")+" you control"} ${deaths===1?"dies":"die"}`:"Your attackers survive."}</li>
          ${outcome.lifeGained?`<li>♥ You gain ${outcome.lifeGained} life (lifelink)</li>`:""}
        </ul></div>
        <div class="attack-builder-actions"><button type="button" class="target-btn" id="editAttackersBtn">Edit attackers</button><button type="button" class="btn-quiet" id="manualCombatBtn">Enter results manually</button></div>
      </div></section></div>`;
  panel.querySelector('#editAttackersBtn').onclick=()=>{draft.mode="builder";draft.outcome=null;refreshCombatViews();};
  panel.querySelector('#manualCombatBtn').onclick=()=>{draft.mode="manual";showCombatStep();};
  const dealt=outcome.perOpp.reduce((s,e)=>s+e.damage,0);
  const kills=outcome.perOpp.reduce((s,e)=>s+e.kills.length,0);
  setConfirmButton("Confirm Combat ▸","",()=>goToPlayerStep("end",applyCombatDraft),true,
    ()=>joinPreview([`Deal ${dealt}`,kills&&`Destroy ${kills}`,deaths&&`Lose ${plural(deaths,"creature")}`,outcome.lifeGained&&`+${outcome.lifeGained} life`]));
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
      <div class="context-section-title">${opp.ico} ${nm(opp)}, ${opp.life} life</div>
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
  html+=`<div class="attack-builder-actions"><button type="button" class="target-btn" id="backToBuilderBtn">Declare attackers instead</button></div></div>`;
  panel.innerHTML=html;
  alive.forEach(opp=>{const sec=panel.querySelector(`[data-opp-section="${opp.id}"]`);if(sec)wireDraftSteppers(sec,m.perOpp[opp.id]);});
  wireDraftSteppers(panel.querySelector('.manual-you'),m);
  panel.querySelectorAll('.kill-btn[data-uid]').forEach(btn=>{btn.onclick=()=>{
    const uid=btn.dataset.uid;
    if(m.kills.has(uid))m.kills.delete(uid);else m.kills.set(uid,{ownerId:btn.dataset.owner,uid});
    renderManualCombat(panel,alive);
  };});
  panel.querySelector('#backToBuilderBtn').onclick=()=>{attackDraft.mode="builder";refreshCombatViews();};
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
  // Wait on a Start Game screen so the table can be read before the first turn runs.
  gameState.phase="ready";
  saveState();
  showStartScreen();
}
function showStartScreen(){
  windowSeq++;
  clearConfirmBar();hideLastTurnSection();
  showCommanderGame();
  const level=(gameState.settings&&gameState.settings.cpu&&gameState.settings.cpu.powerLevel)||3;
  const diff=(typeof DIFFICULTY_LEVELS!=="undefined"&&DIFFICULTY_LEVELS.find(d=>d.level===level))||null;
  const firstOpp=gameState.firstSeat==="player"?null:oppById(gameState.firstSeat);
  document.getElementById('huntTitle').textContent="⚔ Commander Battle";
  document.getElementById('declare').className="declare player compact-declare";
  document.getElementById('declareTitle').textContent="Ready";
  document.getElementById('declareFlavor').textContent=firstOpp?`${nm(firstOpp)} goes first.`:"You go first.";
  document.getElementById('declareMech').innerHTML='';
  document.getElementById('respTitle').textContent="Your table";
  document.getElementById('respGrid').innerHTML=`<div class="context-form commander-form start-screen">
    <ul class="start-opponents">${gameState.opponents.map((o,i)=>`<li style="border-left-color:${oppColor(o)}"><span>${o.ico} <b>${escapeHtml(nm(o))}</b></span><small>${escapeHtml(opponentDeckName(o,i))}</small></li>`).join("")}</ul>
    <p class="step-hint">Difficulty ${level}${diff?` · ${escapeHtml(diff.name)}`:""} · Everyone starts at 40 life. ${firstOpp?`${escapeHtml(nm(firstOpp))} takes the first turn; you'll see each of its phases.`:"You take the first turn."} Add creatures already on your table with + Creature on your seat.</p>
  </div>`;
  setConfirmButton("Start Game ▸","",()=>{
    if(gameState.phase!=="ready")return;
    gameState.phase="cpu";
    beginCommanderRoundQueue(gameState);
    advanceSeat();
  },false);
}

/* Re-shows the saved turn state (boot, undo). Never re-runs a CPU phase that already ran. */
function resumeTurnFlow(){
  if(!gameState)return;
  responseDraft=null;
  showCommanderGame();
  renderCommanderLog();
  if(gameState.gameOver){const end=checkCommanderBattleEnd(gameState);endCommanderGame(end.won,end.reason||"");return;}
  if(gameState.phase==="ready"){showStartScreen();return;}
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
  safeRemove(SAVE_KEY);safeRemove(ADVENTURE_SAVE_KEY);
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
    }catch(e){console.warn("Commander save could not be read:",e);}
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

// Settings → Restart game (same opponents / same adventure) and New game (setup screen).
function confirmGameChange(title,body,okLabel){return askConfirm(title,body,okLabel,"Keep playing");}
const restartGameBtn=document.getElementById('restartGameBtn');
if(restartGameBtn)restartGameBtn.onclick=async()=>{
  closeSettings();
  if(gameState){
    const settings=gameState.settings,count=gameState.opponents.length;
    if(!await confirmGameChange("Restart this game?",`This ends the current game and starts a fresh one against ${plural(count,"opponent")} at the same difficulty. This cannot be undone.`,"Restart"))return;
    restart();startCommanderBattle(count,settings);
  }else if(typeof S!=="undefined"&&S&&S.mode){
    const mode=S.mode;
    if(!await confirmGameChange("Restart this encounter?","This ends the current encounter and starts it again from the beginning. This cannot be undone.","Restart"))return;
    restart();startAdventure(mode);
  }else showSetup();
};
const newGameBtn=document.getElementById('newGameBtn');
if(newGameBtn)newGameBtn.onclick=async()=>{
  closeSettings();
  if((gameState||(typeof S!=="undefined"&&S))&&!await confirmGameChange("Start a new game?","This ends the current game and opens the setup screen, where you can choose opponents and difficulty.","New game"))return;
  restart();
};

// "Since your last turn" popup setting (commander mode only). Re-renders the draw step if you're on it.
const recapToggle=document.getElementById('recapToggle');
if(recapToggle)recapToggle.onchange=()=>{
  setRecapEnabled(recapToggle.checked);
  if(gameState&&gameState.phase==="player"&&gameState.playerStep==="draw")showDrawStep();
};
updateRecapToggle();

// Card details popup on hover (Table view). Off = details only open when you click/tap a card.
const peekToggle=document.getElementById('peekToggle');
if(peekToggle)peekToggle.onchange=()=>{safeSet(PEEK_KEY,peekToggle.checked?"on":"off");if(!peekToggle.checked)hideTablePeek();};
updatePeekToggle();

// Boot is called externally by bootGame() in the HTML after all scripts load

})();
