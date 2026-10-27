/* =====================================================================
   COMMANDER UI — Rendering, event wiring, game loop, and boot.
   Extracted from commander.js (UI layer).
   ===================================================================== */

// Globals shared with ai-commander.js (must be accessible outside the IIFE)
var gameState = null;

(function() {
"use strict";

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
        logCommander(`${name} discards ${discarded.length?discarded.map(discardedCardText).join(", "):"no cards"}. Types: ${discardedTypeSummary(discarded)}. Card names are not tracked for this hand.`);
      }else{
        const discarded=discardFromOpponent(target,amount);
        logCommander(`${name} chooses to discard ${discarded.length?discarded.map(discardedCardText).join(", "):"no cards"}.${discarded.length?` Types: ${discardedTypeSummary(discarded)}.`:""}`);
      }
    }else if(effect.action==="mill"){
      if(target.id==="player"){
        const milledAmount=Math.min(amount,target.librarySize);target.librarySize-=milledAmount;
        const milled=Array.from({length:milledAmount},()=>addPlayerGraveyardCard(target,{name:"Unrevealed milled card",ico:"📚",types:["Unknown"],virtual:true})).filter(Boolean);
        logCommander(`${name} mills ${milled.length?milled.map(discardedCardText).join(", "):"no cards"}. Types: ${discardedTypeSummary(milled)}. Card names are not tracked for this library.`);
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
    ?`Complete your part at the table, then confirm: ${playerEffectSummary(effect)}`
    :`No action is required from you at the table.`;
  const cpuInstruction=effect.action==="reanimate"
    ?"The selected creature cards return to the battlefield under your control."
    :cpuTargets.length
    ?isPermanentPlayerAction(effect)
      ?"Each affected CPU chooses its least valuable eligible permanent."
      :effect.action==="discard"
        ?"Each affected CPU discards its least valuable card."
        :"CPU totals update automatically."
    :"";
  const message=`<strong>${playerEffectSummary(effect)}</strong><br><br>${playerInstruction}${cpuInstruction?`<br><br>${cpuInstruction}`:""}`;
  const confirmed=typeof askConfirm==="function"
    ?await askConfirm("Confirm action",message,affectsPlayer?"Confirm":"Resolve")
    :window.confirm(`${playerEffectSummary(effect)}\n\n${playerInstruction}\n${cpuInstruction}`);
  if(!confirmed)return false;
  resolvePlayerEffect(effect,draft);
  logCommander("Player action resolved.");
  saveState();
  return true;
}

/* =====================================================================
   UI — Setup screen, life HUD, board views, player inputs
   ===================================================================== */
const SAVE_KEY="magic_no_gathering_save_v2";
function safeGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function safeSet(k,v){try{localStorage.setItem(k,v);}catch(e){}}
function safeRemove(k){try{localStorage.removeItem(k);}catch(e){}}

function renderSetupScreen(onStartAdventure, onStartCommander) {
  const modal=document.getElementById('modal'), overlay=document.getElementById('overlay');
  modal.className="modal setup-modal";
  const adventureModes=Object.values(MODES).filter(m=>m.category==="adventure");

  modal.innerHTML=`
    <div class="big-ico">🎴</div>
    <h2>Magic No Gathering</h2>
    <p class="setup-sub">Solo Commander Encounter Engine</p>
    <div class="setup-columns">
      <div class="setup-col setup-col-commander">
        <h3 class="setup-col-h">⚔️ Commander Battle</h3>
        <p class="setup-col-desc">Play your deck against one to four CPU commanders. Opponents also attack each other.</p>
        <div class="opponent-count">
          <label>Opponents</label>
          <div class="count-row">
            <button type="button" class="count-btn" data-count="1">1</button>
            <button type="button" class="count-btn" data-count="2">2</button>
            <button type="button" class="count-btn active" data-count="3">3</button>
            <button type="button" class="count-btn" data-count="4">4</button>
          </div>
        </div>
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

  let selectedCount=3;
  modal.querySelectorAll('.count-btn').forEach(btn=>{
    btn.onclick=()=>{modal.querySelectorAll('.count-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');selectedCount=parseInt(btn.dataset.count,10);};
  });
  document.getElementById('startCommanderBtn').onclick=()=>{try{onStartCommander(selectedCount);}catch(e){console.error("[MNG] startCommanderBattle failed:",e);}};
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
  return o?o.name.split(',')[0]:"???";
}

function findGraveyardOwner(state,ownerId){
  return ownerId==="player"?state.player:state.opponents.find(opp=>opp.id===ownerId)||null;
}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));}
function showGraveyardViewer(state,ownerId){
  const owner=findGraveyardOwner(state,ownerId);
  const overlay=document.getElementById('overlay'),modal=document.getElementById('modal');
  if(!owner||!overlay||!modal)return;
  const ownerName=owner.id==="player"?"Your":`${owner.name.split(",")[0]}'s`;
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
    const historicalNote=unmaterialized?`<p class="graveyard-untracked">${unmaterialized} earlier card${unmaterialized===1?" is":"s are"} included in the count but ${unmaterialized===1?"was":"were"} not recorded individually.</p>`:"";
    const actionControls=selectableCards.length?`<section class="graveyard-card-actions"><p>${selectedCard?`Selected: <strong>${escapeHtml(selectedCard.name)}</strong>.`:"Select a creature card to exile or return it."}</p><div><button type="button" class="target-btn graveyard-exile-action" id="exileSelectedGraveyardCreature" ${selectedCard?"":"disabled"}>Exile selected creature</button><button type="button" class="target-btn graveyard-resurrect-action" id="resurrectSelectedGraveyardCreature" ${selectedCard?"":"disabled"}>Return to your battlefield</button></div></section>`:"";
    modal.className="modal graveyard-modal";
    modal.innerHTML=`<div class="graveyard-modal-head"><div><span class="big-ico">⚰</span><h2>${escapeHtml(ownerName)} Graveyard</h2></div><button type="button" class="graveyard-close" aria-label="Close graveyard">×</button></div><p class="graveyard-summary">${owner.graveyardCount||0} card${owner.graveyardCount===1?"":"s"} · ${cards.length} shown</p>${cardsHtml}${historicalNote}${actionControls}<button type="button" class="cta ghost" id="closeGraveyardViewer">Close</button>`;
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
      if(action==="exile")logCommander(`You exile ${discardedCardText(moved)} from ${owner.name.split(",")[0]}'s graveyard.`);
      else logCommander(`You resurrect ${discardedCardText(moved)} from ${owner.name.split(",")[0]}'s graveyard onto your battlefield.`);
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
  const ownerName=owner.id==="player"?"Your":`${owner.name.split(",")[0]}'s`;
  const cardsHtml=cards.length?cardReferenceListHtml(cards,"zone-card-list"):`<div class="graveyard-empty">No cards in exile.</div>`;
  modal.className="modal graveyard-modal";
  modal.innerHTML=`<div class="graveyard-modal-head"><div><span class="big-ico">✦</span><h2>${escapeHtml(ownerName)} Exile</h2></div><button type="button" class="graveyard-close" aria-label="Close exile">×</button></div><p class="graveyard-summary">${owner.exileCount||0} card${owner.exileCount===1?"":"s"} exiled</p>${cardsHtml}<button type="button" class="cta ghost" id="closeGraveyardViewer">Close</button>`;
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
window.onThemeChange=()=>{if(gameState){renderLifeHud(gameState);renderBoardView(gameState);}};

function renderLifeHud(state){
  let el=document.getElementById('commanderLifeHud');
  if(!el){el=document.createElement('div');el.id='commanderLifeHud';el.className='commander-life-hud';
    const header=document.querySelector('.app-bar');
    if(header&&header.nextSibling)header.parentNode.insertBefore(el,header.nextSibling);
    else document.querySelector('.wrap').prepend(el);
  }
  let html=`<button type="button" class="life-pip player-pip life-pip-btn" data-view="-1">
    <span class="life-ico">🗡️</span><span class="life-name">You</span>
    <span class="life-val ${state.player.life<=10?'warn':''}">${state.player.life}</span>
  </button>`;
  html+='<span class="life-divider">|</span>';
  state.opponents.forEach(opp=>{
    const dead=isOpponentDead(opp);const cd=state.player.commanderDamageReceived[opp.id]||0;
    const active=state._activeOppIndex===opp.index&&state.phase==="cpu";
    html+=`<button type="button" class="life-pip life-pip-btn ${dead?'dead':''} ${active?'active-opp':''}" data-view="${opp.index}" style="border-color:${oppColor(opp)}"><span class="life-ico">${opp.ico}</span><span class="life-name">${opp.name.split(',')[0]}</span><span class="life-val ${opp.life<=10?'warn':''}">${dead?'☠':opp.life}</span><span class="life-creatures"><span title="Cards in hand">🃏 ${opponentHandSize(opp)}</span> · <span title="Cards in deck">📚 ${opponentDeckSize(opp)}</span> · <span class="life-graveyard" role="button" tabindex="0" title="View graveyard" data-graveyard-owner="${opp.id}">⚰ ${opp.graveyardCount}</span>${opp.exileCount?` · <span class="life-graveyard" role="button" tabindex="0" title="View exile" data-exile-owner="${opp.id}">✦ ${opp.exileCount}</span>`:''}</span>${cd>0?`<span class="life-cmdr-dmg" title="Commander damage dealt to you">⚜${cd}</span>`:''}</button>`;
  });
  el.innerHTML=html;
  el.querySelectorAll('.life-pip-btn').forEach(btn=>{
    btn.onclick=()=>{state.viewMode="single";state.viewTarget=parseInt(btn.dataset.view);renderBoardView(state);};
  });
  wireGraveyardViewerControls(el,state);
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
  const totalViews=state.opponents.length+1; // opponents + player
  const viewIdx=state.viewTarget; // -1 for player, 0+ for opponents
  const isPlayerView=viewIdx===-1;
  const canRemove=true; // Always allow removal to track board state

  if(isPlayerView){
    renderPlayerBoardView(state,board,totalViews);
    return;
  }

  const opp=state.opponents[viewIdx];if(!opp)return;
  const dead=isOpponentDead(opp);
  board.className=`board ${dead?'defeated':''}`;board.style.borderColor=dead?'var(--blood)':oppColor(opp);
  const tokensHtml=opp.tokens.length===0?'<div class="empty-field">No creatures</div>':
    opp.tokens.map((t,i)=>{
      const kws=t.kws&&t.kws.length?t.kws.join(' · '):'';
      const tooltip=`${t.name} — ${t.p}/${t.t}${t.kws&&t.kws.length?' · '+t.kws.join(', '):''}${t.effect?' — '+t.effect:''}`;
      return `<div class="card ${t.kind==='commander'?'commander':''} ${t.summoningSick?'sick':''} ${t.attacking?'tapped':''}" title="${tooltip.replace(/"/g,'&quot;')}">
      ${canRemove?`<button type="button" class="c-remove" data-opp="${opp.id}" data-rm-idx="${i}" title="${t.kind==='commander'?`Return ${t.name} to the command zone`:`Remove ${t.name} from the battlefield`}" aria-label="Remove ${t.name}">✕<span class="c-remove-label"> Remove</span></button>`:''}
      <span class="c-name"><span>${t.name}</span><span class="mana">${t.kind==='commander'?'⚜':'🌲'}</span></span>
      <span class="c-art">${t.ico}</span>
      ${kws?`<span class="c-kw">${kws}</span>`:''}
      ${t.effect?`<span class="c-effect">${t.effect}</span>`:''}
      <span class="c-pt">${t.p}/${t.t}</span>
      ${t.attacking?'<div class="c-atk">⚔️</div><div class="c-tapped-label">TAPPED</div>':''}${t.summoningSick?'<div class="c-sick">💤</div>':''}</div>`;
    }).join('');

  const viewLabel=`${viewIdx+2}/${totalViews}`;
  const cdFromOpp=state.player.commanderDamageReceived[opp.id]||0;
  board.innerHTML=`<div class="board-h"><span class="ico">${opp.ico}</span><span>${opp.name}</span>
    <span class="atk-note">${opp.currentStrategy?STRATEGY_LABELS[opp.currentStrategy]||'':''}</span>
    <div class="view-controls"><button class="btn-ghost view-btn" id="prevOppBtn" title="Previous player" aria-label="Previous player">◂</button><span class="view-counter">${viewLabel}</span><button class="btn-ghost view-btn" id="nextOppBtn" title="Next player" aria-label="Next player">▸</button><button class="btn-ghost view-btn" id="allViewBtn" title="Show all players" aria-label="Show all players">⊞</button></div>
  </div><div class="board-inner commander-board-inner"><div class="garruk-col">
    <div class="commander-board-stats">
      <div class="cbs-item"><span class="cbs-label">Life</span><div class="cbs-adj"><button type="button" class="cbs-btn" data-opp-stat="life" data-opp-id="${opp.id}" data-d="-1">−</button><span class="cbs-val ${opp.life<=10?'warn':''}">${opp.life}</span><button type="button" class="cbs-btn" data-opp-stat="life" data-opp-id="${opp.id}" data-d="1">+</button></div></div>
      <div class="cbs-item cbs-cmdr-dmg"><span class="cbs-label">⚜ Commander damage to you ${helpTip("Combat damage this opponent\u2019s commander has dealt to you. 21 from a single commander eliminates you.")}</span><div class="cbs-adj"><button type="button" class="cbs-btn" data-cmdr-from="${opp.id}" data-d="-1">−</button><span class="cbs-val ${cdFromOpp>=14?'warn':''}">${cdFromOpp}/21</span><button type="button" class="cbs-btn" data-cmdr-from="${opp.id}" data-d="1">+</button></div></div>
      <div class="cbs-item"><span class="cbs-label">Mana</span><span class="cbs-val">${manaAvailable(opp)}</span></div>
      <div class="cbs-item"><span class="cbs-label">Hand</span><span class="cbs-val">🃏 ${opponentHandSize(opp)}/${MAX_CPU_HAND_SIZE}</span></div>
      <div class="cbs-item"><span class="cbs-label">Deck</span><span class="cbs-val">📚 ${opponentDeckSize(opp)}</span></div>
      <div class="cbs-item"><span class="cbs-label">Commander ${helpTip("Commander tax: each recast from the command zone costs 2 more mana.")}</span><span class="cbs-val">${opp.commanderZone?'Command zone (+'+opp.commanderTax+')':'Battlefield'}</span></div>
      <div class="cbs-item"><span class="cbs-label">Equipment</span><span class="cbs-val">${opp.gear}</span></div>
      <div class="cbs-item"><span class="cbs-label">Graveyard</span><button type="button" class="cbs-zone-btn" data-graveyard-owner="${opp.id}">⚰ ${opp.graveyardCount}</button></div>
      <div class="cbs-item"><span class="cbs-label">Exile</span><button type="button" class="cbs-zone-btn" data-exile-owner="${opp.id}">✦ ${opp.exileCount}</button></div>
    </div></div>
    <div class="field-col"><div class="field-h"><span class="lbl">${opp.name.split(',')[0]}'s creatures</span></div><div class="tokens">${tokensHtml}</div></div></div>`;

  // Wire view navigation (player is -1, opponents are 0..N-1)
  document.getElementById('prevOppBtn').onclick=()=>{state.viewTarget=viewIdx===0?-1:(viewIdx-1);renderBoardView(state);};
  document.getElementById('nextOppBtn').onclick=()=>{state.viewTarget=viewIdx>=state.opponents.length-1?-1:(viewIdx+1);renderBoardView(state);};
  document.getElementById('allViewBtn').onclick=()=>{state.viewMode="all";renderBoardView(state);};
  wireGraveyardViewerControls(board,state);

  // Wire opponent life controls
  board.querySelectorAll('[data-opp-stat]').forEach(btn=>{
    btn.onclick=()=>{
      const targetOpp=state.opponents.find(o=>o.id===btn.dataset.oppId);
      if(!targetOpp)return;
      const d=parseInt(btn.dataset.d);
      if(btn.dataset.oppStat==="life")targetOpp.life=Math.max(0,targetOpp.life+d);
      renderBoardView(state);renderLifeHud(state);saveState();
    };
  });
  // Wire commander damage controls (damage this opp has dealt to you)
  board.querySelectorAll('[data-cmdr-from]').forEach(btn=>{
    btn.onclick=()=>{
      const oppId=btn.dataset.cmdrFrom;
      const d=parseInt(btn.dataset.d);
      state.player.commanderDamageReceived[oppId]=Math.max(0,(state.player.commanderDamageReceived[oppId]||0)+d);
      renderBoardView(state);renderLifeHud(state);saveState();
    };
  });

  // Wire remove buttons during player turn
  if(canRemove){
    board.querySelectorAll('.c-remove[data-rm-idx]').forEach(btn=>{
      btn.onclick=async(e)=>{
        e.stopPropagation();
        const targetOpp=state.opponents.find(o=>o.id===btn.dataset.opp);
        const idx=parseInt(btn.dataset.rmIdx);
        if(!targetOpp||idx>=targetOpp.tokens.length)return;
        const token=targetOpp.tokens[idx];

        // Commanders always return to command zone — confirm first, it's costly to undo by hand
        if(token.kind==="commander"){
          const gearCount=(targetOpp.attachedGear||[]).length;
          const ok=await askConfirm(
            `Return ${token.name.split(',')[0]} to the command zone?`,
            `<strong>${token.name}</strong> leaves the battlefield and goes back to the command zone.<br><br>`+
            `${gearCount?`Its ${gearCount} equipment ${gearCount===1?"piece falls":"pieces fall"} off. `:""}Recasting will cost <strong>+${(targetOpp.commanderTax||0)+2}</strong> commander tax.`,
            "Return to zone","Cancel");
          if(!ok)return;
          const moved=removeOpponentPermanent(targetOpp,`token:${idx}`,"graveyard");
          if(moved)logCommander(`${moved.name} returns to the command zone.`);
          renderBoardView(state);renderLifeHud(state);
          if(state.phase==="cpu"&&state._activeOppIndex!=null){
            const activeOpp=state.opponents[state._activeOppIndex];
            if(activeOpp){const panel=document.getElementById('respGrid');if(panel){renderResponseForm(panel,activeOpp,activeOpp._lastResult||{actions:[],attackPower:0,target:null},activeOpp._lastResult?.target==="player"&&activeOpp._lastResult?.attackPower>0);}}
          }
          saveState();
          return;
        }

        // Ask graveyard or exile
        const dest=await askCommanderRemovalDestination(token);
        if(!dest)return; // cancelled
        const moved=removeOpponentPermanent(targetOpp,`token:${idx}`,dest);
        if(moved){
          const verb=dest==="exile"?"exile":"destroy";
          logCommander(`You ${verb} ${movementCardText({...moved,destination:dest})} from ${targetOpp.name.split(',')[0]}. Types: ${discardedTypeSummary([moved])}.`);
        }
        renderBoardView(state);renderLifeHud(state);
        // Refresh the action/response panel to reflect updated creature list
        if(state.phase==="cpu"&&state._activeOppIndex!=null){
          const activeOpp=state.opponents[state._activeOppIndex];
          if(activeOpp){
            const panel=document.getElementById('respGrid');
            if(panel){
              const attacksPlayer=activeOpp._lastResult?.target==="player"&&activeOpp._lastResult?.attackPower>0;
              renderResponseForm(panel,activeOpp,activeOpp._lastResult||{actions:[],attackPower:0,target:null},attacksPlayer);
            }
          }
        }
        saveState();
      };
    });
  }
}

function wirePlaneswalkerControls(board,state){
  board.querySelectorAll('[data-pw-add]').forEach(button=>{
    button.onclick=async event=>{
      event.stopPropagation();
      const name=await askPlaneswalkerName();
      if(!name)return;
      const loyalty=await askPlaneswalkerLoyalty();
      if(loyalty==null)return;
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
        logCommander(`⬡ ${pw.name} has been destroyed (loyalty reached 0).`);
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
  let cmdrDmgHtml='';
  if(cmdrDmgEntries.length>0){
    cmdrDmgHtml=cmdrDmgEntries.map(([oppId,dmg])=>{
      const src=state.opponents.find(o=>o.id===oppId);
      return `<div class="cbs-item cbs-cmdr-dmg"><span class="cbs-label">${src?src.ico:'⚜'} Commander damage from ${src?src.name.split(',')[0]:'?'}</span><div class="cbs-adj"><button type="button" class="cbs-btn" data-cmdr-from="${oppId}" data-d="-1">−</button><span class="cbs-val ${dmg>=14?'warn':''}">${dmg}/21</span><button type="button" class="cbs-btn" data-cmdr-from="${oppId}" data-d="1">+</button></div></div>`;
    }).join('');
  }

  const playerCreatureCards=(p.tokens||[]).filter(token=>token.kind==="reanimated-creature");
  const playerTokensHtml=playerCreatureCards.length?playerCreatureCards.map(token=>`<div class="card voltron-creature reanimated" title="Reanimated from ${token.owner}"><span class="c-name"><span>${token.name}</span><span class="mana">↩</span></span><span class="c-art">${token.ico}</span>${token.kws?.length?`<span class="c-kw">${token.kws.join(" · ")}</span>`:""}${token.effect?`<span class="c-effect">${token.effect}</span>`:""}<span class="c-pt">${token.p}/${token.t}</span>${token.summoningSick?'<div class="c-sick">💤</div>':''}</div>`).join(""):`<div class="empty-field">${p.creatures} creature${p.creatures!==1?'s':''} on your battlefield</div>`;

  // Planeswalker display
  const pws=p.planeswalkers||[];
  const pwHtml=pws.length?pws.map(pw=>`<div class="card commander pw-card" title="${pw.name} · Loyalty ${pw.loyalty}"><span class="c-name"><span>${pw.name}</span><span class="mana">⬡</span></span><span class="c-art">⬡</span><span class="c-pt">${pw.loyalty}</span><button type="button" class="c-remove" data-pw-remove="${pw.id}" title="Remove ${pw.name} from the battlefield" aria-label="Remove ${pw.name}">✕<span class="c-remove-label"> Remove</span></button><div class="pw-adj"><button type="button" class="cbs-btn" data-pw-loyalty="${pw.id}" data-d="-1">−</button><button type="button" class="cbs-btn" data-pw-loyalty="${pw.id}" data-d="1">+</button></div></div>`).join(""):"";

  board.innerHTML=`<div class="board-h"><span class="ico">🗡️</span><span>You</span>
    <span class="atk-note"></span>
    <div class="view-controls"><button class="btn-ghost view-btn" id="prevOppBtn" title="Previous player" aria-label="Previous player">◂</button><span class="view-counter">1/${totalViews}</span><button class="btn-ghost view-btn" id="nextOppBtn" title="Next player" aria-label="Next player">▸</button><button class="btn-ghost view-btn" id="allViewBtn" title="Show all players" aria-label="Show all players">⊞</button></div>
  </div><div class="board-inner commander-board-inner"><div class="garruk-col">
    <div class="commander-board-stats">
      <div class="cbs-item"><span class="cbs-label">Life</span><div class="cbs-adj"><button type="button" class="cbs-btn" data-player-stat="life" data-d="-1">−</button><span class="cbs-val ${p.life<=10?'warn':''}">${p.life}</span><button type="button" class="cbs-btn" data-player-stat="life" data-d="1">+</button></div></div>
      ${cmdrDmgHtml}
      <div class="cbs-item"><span class="cbs-label">Creatures</span><div class="cbs-adj"><button type="button" class="cbs-btn" data-player-stat="creatures" data-d="-1">−</button><span class="cbs-val">${p.creatures}</span><button type="button" class="cbs-btn" data-player-stat="creatures" data-d="1">+</button></div></div>
      <div class="cbs-item"><span class="cbs-label">Planeswalkers</span><span class="cbs-val">⬡ ${pws.length}</span></div>
      <div class="cbs-item"><span class="cbs-label">Graveyard</span><button type="button" class="cbs-zone-btn" data-graveyard-owner="player">⚰ ${p.graveyardCount}</button></div>
      <div class="cbs-item"><span class="cbs-label">Exile</span><button type="button" class="cbs-zone-btn" data-exile-owner="player">✦ ${p.exileCount}</button></div>
    </div></div>
    <div class="field-col"><div class="field-h"><span class="lbl">Your battlefield</span><button class="btn-ghost" data-pw-add type="button">+ Planeswalker</button></div><div class="tokens">${pwHtml}${playerTokensHtml}</div></div></div></div>`;

  document.getElementById('prevOppBtn').onclick=()=>{state.viewTarget=state.opponents.length-1;renderBoardView(state);};
  document.getElementById('nextOppBtn').onclick=()=>{state.viewTarget=0;renderBoardView(state);};
  document.getElementById('allViewBtn').onclick=()=>{state.viewMode="all";renderBoardView(state);};
  wireGraveyardViewerControls(board,state);

  // Wire planeswalker controls shared by single and All Opponents views.
  wirePlaneswalkerControls(board,state);

  // Wire player stat controls
  board.querySelectorAll('[data-player-stat]').forEach(btn=>{
    btn.onclick=()=>{
      const stat=btn.dataset.playerStat;
      const d=parseInt(btn.dataset.d);
      if(stat==="life")state.player.life=Math.max(0,state.player.life+d);
      else if(stat==="creatures")state.player.creatures=Math.max(0,state.player.creatures+d);
      renderBoardView(state);renderLifeHud(state);saveState();
    };
  });
  // Wire commander damage controls
  board.querySelectorAll('[data-cmdr-from]').forEach(btn=>{
    btn.onclick=()=>{
      const oppId=btn.dataset.cmdrFrom;
      const d=parseInt(btn.dataset.d);
      state.player.commanderDamageReceived[oppId]=Math.max(0,(state.player.commanderDamageReceived[oppId]||0)+d);
      renderBoardView(state);renderLifeHud(state);saveState();
    };
  });
}

function renderAllView(state,board){
  board.className='board all-view';board.style.borderColor='';
  const player=state.player;
  const planeswalkers=player.planeswalkers||[];
  const playerPlaneswalkersHtml=planeswalkers.length
    ?`<div class="all-pw-list">${planeswalkers.map(pw=>`<div class="all-pw-card"><span class="all-pw-name" title="${escapeHtml(pw.name)}">⬡ ${escapeHtml(pw.name)}</span><div class="all-pw-controls"><button type="button" class="cbs-btn" data-pw-loyalty="${pw.id}" data-d="-1" aria-label="Decrease ${escapeHtml(pw.name)} loyalty">−</button><span class="all-pw-loyalty">${pw.loyalty}</span><button type="button" class="cbs-btn" data-pw-loyalty="${pw.id}" data-d="1" aria-label="Increase ${escapeHtml(pw.name)} loyalty">+</button><button type="button" class="all-pw-remove" data-pw-remove="${pw.id}" title="Remove ${escapeHtml(pw.name)} from the battlefield" aria-label="Remove ${escapeHtml(pw.name)}">✕</button></div></div>`).join('')}</div>`
    :'<span class="all-pw-empty">No planeswalkers on your battlefield.</span>';
  let html=`<div class="board-h"><span class="ico">⊞</span><span>All Opponents</span><div class="view-controls"><button class="btn-ghost view-btn" id="singleViewBtn" title="Open the active player view">◻</button></div></div><div class="all-opponents-grid">`;
  html+=`<div class="all-opp-card player-card" data-idx="-1" style="border-color:var(--gold-dim)">
    <div class="all-opp-header"><span>🗡️</span><span class="all-opp-name">You</span><span class="all-opp-life">${player.life}</span></div>
    <div class="all-opp-body"><span>♟ ${player.creatures} creature${player.creatures!==1?'s':''}</span><span>⬡ ${planeswalkers.length} planeswalker${planeswalkers.length===1?'':'s'}</span><span>⚰ ${player.graveyardCount}</span><span>✦ ${player.exileCount}</span></div>
    <div class="all-opp-pws"><div class="all-pw-heading"><span>Planeswalkers</span><button type="button" class="all-pw-add" data-pw-add>+ Add</button></div>${playerPlaneswalkersHtml}</div>
  </div>`;
  state.opponents.forEach((opp,i)=>{
    const dead=isOpponentDead(opp);const commander=commanderOnField(opp);
    const commanderSummary=commander?cardReferenceHtml(commander,{className:"all-opp-card-reference"}):'<span title="Commander is in the command zone">⚜ In zone</span>';
    html+=`<div class="all-opp-card ${dead?'dead':''}" data-idx="${i}" style="border-color:${oppColor(opp)}">
      <div class="all-opp-header"><span>${opp.ico}</span><span class="all-opp-name">${opp.name.split(',')[0]}</span><span class="all-opp-life">${dead?'☠':opp.life}</span></div>
      <div class="all-opp-body"><span>♟ ${opp.tokens.length} creature${opp.tokens.length!==1?'s':''}</span>${commanderSummary}<span>◇ ${opp.landsInPlay+opp.rampInPlay} mana</span><span>📚 ${opponentDeckSize(opp)}</span></div>
      ${opp.attackTarget?`<div class="all-opp-target">⚔ Targeting ${opp.attackTarget==="player"?"you":getTargetName(state,opp.attackTarget)}</div>`:''}
    </div>`;
  });
  html+='</div>';board.innerHTML=html;
  document.getElementById('singleViewBtn').onclick=()=>{state.viewMode="single";if(state._activeOppIndex!=null)state.viewTarget=state._activeOppIndex;renderBoardView(state);};
  wirePlaneswalkerControls(board,state);
  board.querySelectorAll('.all-opp-card').forEach(card=>{card.onclick=()=>{state.viewTarget=parseInt(card.dataset.idx,10);state.viewMode="single";renderBoardView(state);};});
}

/* =====================================================================
   GAME LOOP
   ===================================================================== */
// gameState is declared globally (above the IIFE) for ai-commander.js access
let collectInputsFn=null;
let cmdUndoStack=[];
function cmdSnapshot(){cmdUndoStack.push(JSON.stringify(gameState));if(cmdUndoStack.length>15)cmdUndoStack.shift();updateCmdUndoBtn();}
function updateCmdUndoBtn(){const b=document.getElementById('undoBtn');if(b)b.disabled=cmdUndoStack.length===0;}
function cmdUndo(){
  if(cmdUndoStack.length===0)return;
  gameState=JSON.parse(cmdUndoStack.pop());
  updateCmdUndoBtn();showCommanderGame();
  if(gameState.phase==="player")startPlayerPhase();else runCpuPhase();
  logCommander("↶ Reverted to the previous step.");
  saveState();
}

function cleanupCommanderUI(){
  const hud=document.getElementById('commanderLifeHud');if(hud)hud.remove();
  const cb=document.getElementById('commanderBoardOverlay');if(cb)cb.remove();
  const bar=document.getElementById('cmdConfirmBar');if(bar)bar.remove();
  const lt=document.getElementById('cmdLastTurn');if(lt)lt.remove();
  const board=document.getElementById('board');if(board)board.style.display='';
  const playerHud=document.querySelector('.player-hud');if(playerHud)playerHud.style.display='';
  const oldActions=document.querySelector('.turn-actions');if(oldActions)oldActions.style.display='';
  const gameplaySettings=document.getElementById('settingsGameplay');if(gameplaySettings)gameplaySettings.hidden=true;
}

function saveState(){safeSet(SAVE_KEY,JSON.stringify({...gameState,_type:"commander"}));}

function showCommanderGame(){
  ensureCommanderEffectState(gameState);
  applyBattlefieldRuleModifiers();
  document.getElementById('modePill').textContent=`Commander Battle`;
  document.getElementById('turnNum').textContent=gameState.turn;
  document.getElementById('phasePill').textContent=gameState.phase==="cpu"?"Opponents' Turn":"Your Turn";
  renderLifeHud(gameState);
  // Hide the adventure-mode player HUD — life is in the consolidated bar
  const playerHud=document.querySelector('.player-hud');
  if(playerHud)playerHud.style.display='none';
  const cls=document.getElementById('cmdrLifeStat');if(cls)cls.hidden=true;
  renderBoardView(gameState);
  const addBtn=document.getElementById('addWolfBtn');if(addBtn)addBtn.style.display='none';
  const gameplaySettings=document.getElementById('settingsGameplay');if(gameplaySettings)gameplaySettings.hidden=false;
  // Wire undo for commander mode
  const undoBtn=document.getElementById('undoBtn');
  if(undoBtn){undoBtn.onclick=cmdUndo;updateCmdUndoBtn();}
  // Ensure the confirm button zone exists above the action panel
  ensureConfirmBar();
}

function ensureConfirmBar(){
  let bar=document.getElementById('cmdConfirmBar');
  if(!bar){
    bar=document.createElement('div');bar.id='cmdConfirmBar';bar.className='cmd-confirm-bar';
    const main=document.querySelector('main.grid');
    // After the turn panel, sticky to the viewport bottom — so the button is always reachable
    if(main)main.parentNode.insertBefore(bar,main.nextSibling);
  }
  // Hide the original turn-actions since we use the fixed confirm bar
  const oldActions=document.querySelector('.turn-actions');
  if(oldActions)oldActions.style.display='none';
  return bar;
}

/* previewFn(): returns a short outcome string ("Take 7", "Deal 5 · Remove 1") shown on
   the confirm button, or "" for none. Re-run after any click/input in the page. */
let confirmPreviewFn=null;
let stepStatusFn=null; // optional: refreshes per-step status chips (CPU response form)
function setConfirmButton(text,className,onclick,showEndTurn,previewFn){
  const bar=ensureConfirmBar();
  let html=`<button class="cmd-confirm-btn ${className}" id="cmdConfirmBtn"><span class="cmd-preview" hidden></span><span class="cmd-label">${text}</span><kbd class="cmd-key" aria-hidden="true">Space</kbd></button>`;
  if(showEndTurn){
    html+=`<button class="cmd-confirm-btn cmd-end-turn-btn ${className}" id="cmdEndTurnBtn">End Turn</button>`;
  }
  bar.innerHTML=html;
  document.getElementById('cmdConfirmBtn').onclick=onclick;
  if(showEndTurn){
    document.getElementById('cmdEndTurnBtn').onclick=()=>{
      // Resolve current step inputs before ending
      resolveCurrentStepInputs();
      endPlayerTurn();
    };
  }
  confirmPreviewFn=previewFn||null;
  stepStatusFn=null;
  refreshConfirmPreview();
}
function refreshConfirmPreview(){
  if(stepStatusFn)stepStatusFn();
  const el=document.querySelector('#cmdConfirmBtn .cmd-preview');
  if(!el)return;
  const text=confirmPreviewFn?confirmPreviewFn():"";
  el.textContent=text||"";
  el.hidden=!text;
}
// Inputs live in many panels; one delegated listener keeps the preview current.
// setTimeout lets the clicked control's own handler update state first.
document.addEventListener('click',()=>{if(gameState)setTimeout(refreshConfirmPreview,0);});
document.addEventListener('input',()=>{if(gameState)refreshConfirmPreview();});

function inputValue(panel,selector){return parseInt(panel.querySelector(selector)?.value)||0;}
function killCount(panel){return Object.values(panel._killMap||{}).reduce((sum,set)=>sum+(set?set.size:0),0);}
function joinPreview(parts){return parts.filter(Boolean).join(" · ");}
function creaturesPlayedPreview(panel){
  const played=inputValue(panel,'input[data-key="creaturesPlayed"]');
  return played>0?`+${played} creature${played===1?"":"s"}`:"";
}

/* Space / Enter presses the main confirm button. Ignored while typing, while a
   control has keyboard focus (so it keeps its native behaviour), or when a dialog is open. */
document.addEventListener('keydown',event=>{
  if(!gameState||gameState.gameOver||event.repeat)return;
  if(event.key!=="Enter"&&event.key!==" ")return;
  if(event.metaKey||event.ctrlKey||event.altKey)return;
  if(document.querySelector('.overlay.show'))return;
  const active=document.activeElement;
  if(active&&active!==document.body){
    if(active.tagName==="INPUT"){
      // Enter commits a typed number (and refreshes the preview); press again to continue
      if(event.key==="Enter"){event.preventDefault();active.blur();}
      return;
    }
    if(active.matches('select,textarea,button,summary,a,[role="button"],[contenteditable]'))return;
  }
  const btn=document.getElementById('cmdConfirmBtn');
  if(!btn||btn.disabled)return;
  event.preventDefault();
  btn.click();
});
// A mouse click shouldn't leave focus on a stepper — otherwise the next Space/Enter re-presses it.
// (event.detail is 0 for keyboard activation, so keyboard users keep their focus.)
document.addEventListener('click',event=>{
  if(!gameState||event.detail===0)return;
  const btn=event.target.closest&&event.target.closest('button');
  if(btn&&btn.id!=="menuBtn")btn.blur();
});

function endPlayerTurn(){
  const end=checkCommanderBattleEnd(gameState);
  if(end.over){endCommanderGame(end.won,end.reason);return;}
  markRecapStart();
  gameState.turn++;collectInputsFn=null;saveState();runCpuPhase();
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
    ...gameState.opponents.map(opp=>({id:opp.id,ico:opp.ico,name:opp.name.split(',')[0],life:opp.life}))];
  const changes=people.filter(p=>recap.life[p.id]!=null&&recap.life[p.id]!==p.life).map(p=>{
    const delta=p.life-recap.life[p.id];
    return `<span class="recap-life ${delta<0?"down":"up"}${p.id==="player"?" is-you":""}">${p.ico} ${p.name} ${recap.life[p.id]} → <b>${p.life}</b> <small>(${delta>0?"+":"−"}${Math.abs(delta)})</small></span>`;
  });
  // log is newest-first; recap reads oldest-first
  const entries=gameState.log.filter(e=>e.seq>recap.seq).reverse();
  const shown=entries.slice(-RECAP_MAX_LINES);
  const hidden=entries.length-shown.length;
  return `<section class="turn-recap" aria-label="Since your last turn">
    <div class="turn-recap-h"><strong>Since your last turn</strong><button type="button" class="btn-quiet" id="recapOpenLog">Full log</button></div>
    <div class="recap-lives">${changes.length?changes.join(""):'<span class="recap-quiet">No life totals changed.</span>'}</div>
    ${shown.length?`<ul class="recap-lines">${hidden>0?`<li class="recap-more">…${hidden} earlier event${hidden===1?"":"s"} in the log</li>`:""}${shown.map(e=>`<li>${e.msg}</li>`).join("")}</ul>`:""}
  </section>`;
}

function resolveCurrentStepInputs(){
  const panel=document.getElementById('respGrid');
  if(!panel)return;
  if(playerStep==="main1"){
    const played=parseInt(panel.querySelector('input[data-key="creaturesPlayed"]')?.value)||0;
    if(played>0){gameState.player.creatures+=played;logCommander(`You play ${plural(played,"creature")}.`);}
  }else if(playerStep==="combat"){
    // Resolve combat damage if any was entered
    const alive=aliveOpponents(gameState);
    const killMap=panel._killMap||{};
    const playerDeaths=parseInt(panel.querySelector('input[data-key="playerDeaths"]')?.value)||0;
    alive.forEach(opp=>{
      const damage=parseInt(panel.querySelector(`input[data-opp="${opp.id}"][data-key="damage"]`)?.value)||0;
      const cmdrDmg=parseInt(panel.querySelector(`input[data-opp="${opp.id}"][data-key="cmdrDmg"]`)?.value)||0;
      if(damage>0){
        opp.life=Math.max(0,opp.life-damage);
        opp.damageLog["player"]=(opp.damageLog["player"]||0)+damage;
        opp.lastAttacker="player";
        logCommander(`You deal ${damage} to ${opp.name.split(',')[0]}. (Life → ${opp.life})`);
      }
      if(cmdrDmg>0){
        const applied=Math.min(cmdrDmg,damage||cmdrDmg);
        opp.commanderDamageReceived["player"]=(opp.commanderDamageReceived["player"]||0)+applied;
        gameState.player.commanderDamageDealt[opp.id]=(gameState.player.commanderDamageDealt[opp.id]||0)+applied;
        logCommander(`${applied} commander damage to ${opp.name.split(',')[0]} (${opp.commanderDamageReceived["player"]}/21).`);
      }
      const kills=killMap[opp.id];
      if(kills&&kills.size>0){
        Array.from(kills).sort((a,b)=>b-a).forEach(idx=>{
          if(idx<opp.tokens.length){
            const moved=removeOpponentPermanent(opp,`token:${idx}`,"graveyard");
            if(moved)logCommander(`You destroy ${movementCardText(moved)} from ${opp.name.split(',')[0]}. Types: ${discardedTypeSummary([moved])}.`);
          }
        });
      }
      if(isOpponentDead(opp)&&!opp._eliminated){opp._eliminated=true;logCommander(`${opp.ico} ${opp.name.split(',')[0]} has been eliminated!`);}
    });
    if(playerDeaths>0){
      gameState.player.creatures=Math.max(0,gameState.player.creatures-playerDeaths);
      logCommander(`${playerDeaths} of your creatures died in combat.`);
    }
  }
  showCommanderGame();
}

function ensureLastTurnSection(){
  let el=document.getElementById('cmdLastTurn');
  if(!el){
    el=document.createElement('div');el.id='cmdLastTurn';el.className='cmd-last-turn';
    // Directly above the turn panel: what they did → how you respond → continue
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
  const label=action.label||"";
  if(/^Attack /i.test(label))return opp.tokens.filter(token=>token.attacking);
  if(/land drop/i.test(label))return [{name:"Land",ico:"🌲",type:"Land"}];
  if(/fast mana/i.test(label))return [{name:"Fast Mana",ico:"⚙",type:"Artifact",effect:"Mana source"}];
  const castMatch=label.match(/(?:Cast \+ equip|Cast|Equip)\s+(.+?)(?:\s+\([^)]*\))?$/i);
  const cardName=action.wipeName||castMatch?.[1]?.replace(/ targeting .+$/i,"").trim();
  if(!cardName)return [];
  const token=opp.tokens.find(candidate=>candidate.name===cardName);
  if(token)return [token];
  const gear=(opp.attachedGear||[]).find(candidate=>candidate.name===cardName);
  if(gear)return [{...gear,ico:"⚙",type:"Artifact — Equipment"}];
  const card=commanderDeckCardByName(cardName);
  return card?[card]:[];
}
function renderLastTurnSection(opp){
  const el=ensureLastTurnSection();
  if(!opp||!opp.actionSteps||opp.actionSteps.length===0){el.style.display='none';return;}
  el.style.display='';
  const counterable=new Set();
  opp.actionSteps.forEach((a,i)=>{
    if(a.label.includes("Cast")||a.label.includes("Equip"))counterable.add(i);
  });
  el._counteredSet=new Set();
  let stepsHtml=opp.actionSteps.map((a,i)=>{
    const canCounter=counterable.has(i);
    const cards=commanderActionCards(opp,a);
    return `<button type="button" class="lt-step${canCounter?' lt-counterable':''}" data-step-idx="${i}"${!canCounter?' disabled':''}><strong>${a.label}</strong><span>${a.detail}</span>${cardReferenceListHtml(cards,"action-card-list")}${canCounter?'<span class="lt-counter-hint">Counter</span>':''}</button>`;
  }).join('');
  el.innerHTML=`<div class="lt-header"><span class="lt-ico">${opp.ico}</span><span class="lt-title">${opp.name.split(',')[0]}'s Actions</span><span class="lt-turn">Turn ${gameState.turn}</span></div><div class="lt-steps">${stepsHtml}</div>`;
  // Wire counter toggles
  el.querySelectorAll('.lt-counterable').forEach(btn=>{
    btn.onclick=()=>toggleCounter(parseInt(btn.dataset.stepIdx,10));
  });
}
function hideLastTurnSection(){
  const el=document.getElementById('cmdLastTurn');if(el)el.style.display='none';
}

function logCommander(msg){
  // seq lets the turn recap find "everything since your last turn" even after old entries are trimmed
  gameState.logSeq=(gameState.logSeq||0)+1;
  gameState.log.unshift({cls:"sys",who:"",msg,turn:gameState.turn,seq:gameState.logSeq});
  if(gameState.log.length>80)gameState.log.pop();
  const l=document.getElementById('log');if(l){l.innerHTML="";gameState.log.forEach(e=>{const d=document.createElement('div');d.className="log-e "+e.cls;d.innerHTML=(e.who?`<span class="who">${e.who} · T${e.turn}</span>`:"")+e.msg;l.appendChild(d);});}
  const cnt=document.getElementById('logCount');if(cnt)cnt.textContent=gameState.log.length;
}

/* =====================================================================
   CPU PHASE — Step through each opponent one at a time.
   After each opponent acts, the player gets a response window to:
   - Counter/remove a spell they just cast
   - Remove a creature before combat
   - Block if the attack targets the player
   Then we advance to the next opponent.
   ===================================================================== */
let cpuQueue=[];       // opponents still to resolve this turn
let currentCpuResult=null; // the result of the current opponent's turn

function runCpuPhase(){
  gameState.phase="cpu";
  // Build the queue of living opponents
  cpuQueue=gameState.opponents.filter(o=>!isOpponentDead(o));
  currentCpuResult=null;
  showCommanderGame();
  advanceCpuQueue();
}

function advanceCpuQueue(){
  // Check for eliminations from previous resolution
  gameState.opponents.forEach(opp=>{if(isOpponentDead(opp)&&!opp._eliminated){opp._eliminated=true;logCommander(`${opp.ico} ${opp.name.split(',')[0]} has been eliminated!`);}});
  const end=checkCommanderBattleEnd(gameState);
  if(end.over){endCommanderGame(end.won,end.reason);return;}

  if(cpuQueue.length===0){
    // All opponents have acted — move to player's turn
    startPlayerPhase();
    return;
  }

  // Execute next opponent's turn
  const opp=cpuQueue.shift();
  const allPlayers=allPlayersForTargeting(gameState);
  const result=executeOpponentTurn(opp,allPlayers);
  currentCpuResult={opponent:opp,...result};

  // CPU-vs-CPU combat resolves after the response window so intervention can
  // change the actual blockers and attackers before damage is assigned.

  // Show this opponent's actions and give the player a response window
  showOpponentTurnResponse(opp,result);
}


/**
 * Shows a board wipe notification popup to the player.
 * Symmetric: "All creatures have been destroyed. Clear your board."
 * Targeted (player): "Your creatures are being destroyed. Clear your board unless you have a response."
 * Targeted (other CPU): Just log it, no popup needed (already resolved).
 */
function showBoardWipePopup(opp, wipeAction){
  const oppName=opp.name.split(',')[0];
  return new Promise(resolve=>{
    if(wipeAction.boardWipe==="symmetric"){
      // Symmetric — resolve the player's board choice before combat responses.
      logCommander(`💥 ${oppName} casts ${wipeAction.wipeName}! All creatures are destroyed.`);
      setTimeout(()=>{
        askConfirm(
          `💥 ${wipeAction.wipeName}`,
          `<strong>${oppName}</strong> casts <strong>${wipeAction.wipeName}</strong>.<br><br>` +
          `All creatures on the battlefield are destroyed.<br><br>` +
          `<em>Confirm whether you countered the spell or cleared your board.</em>`,
          "I cleared my board",
          "I countered"
        ).then(clearedBoard=>{
          if(gameState){
            if(clearedBoard){
              const destroyed=gameState.player.creatures;
              gameState.player.creatures=0;
              logCommander(`You clear your board; ${wipeAction.wipeName} destroys ${destroyed} creature${destroyed===1?"":"s"}.`);
            }else logCommander(`You counter ${wipeAction.wipeName}; your creatures remain on the battlefield.`);
            saveState();
            renderBoardView(gameState);renderLifeHud(gameState);
          }
          resolve();
        });
      },200);
    }else if(wipeAction.boardWipe==="targeted"&&wipeAction.wipeTarget==="player"){
      // Targeted at player — resolve the wipe before opening the combat response window.
      logCommander(`💥 ${oppName} casts ${wipeAction.wipeName} targeting you! Your creatures are being destroyed.`);
      setTimeout(()=>{
        askConfirm(
          `💥 ${wipeAction.wipeName} — Targeting You`,
          `<strong>${oppName}</strong> casts <strong>${wipeAction.wipeName}</strong> targeting your board.<br><br>` +
          `All creatures you control are destroyed.<br><br>` +
          `<em>Confirm whether you countered the spell or cleared your board.</em>`,
          "I cleared my board",
          "I countered"
        ).then(clearedBoard=>{
          if(gameState){
            if(clearedBoard){
              const destroyed=gameState.player.creatures;
              gameState.player.creatures=0;
              logCommander(`You clear your board; ${wipeAction.wipeName} destroys ${destroyed} creature${destroyed===1?"":"s"}.`);
            }else logCommander(`You counter ${wipeAction.wipeName}; your creatures remain on the battlefield.`);
            saveState();
            renderBoardView(gameState);renderLifeHud(gameState);
          }
          resolve();
        });
      },200);
    }else{
      // Targeted at another CPU — already resolved in executeOpponentTurn.
      logCommander(`💥 ${oppName} casts ${wipeAction.wipeName} targeting ${wipeAction.wipeTargetName}! Their creatures are destroyed.`);
      resolve();
    }
  });
}

function showOpponentTurnResponse(opp,result){
  showCommanderGame();
  result.actions.filter(action=>(action.discarded&&action.discarded.length)||action.deckOut).forEach(action=>{
    logCommander(`${opp.name.split(',')[0]} ${action.detail}`);
  });
  // One-line summary of what they did, so the log (and your turn recap) records it
  const notable=result.actions.map(a=>a.label).filter(label=>label&&!/^Draw$|land drop/i.test(label));
  if(notable.length)logCommander(`${opp.ico} ${opp.name.split(',')[0]}: ${notable.join(" · ")}.`);
  gameState._activeOppIndex=opp.index;
  opp._lastResult=result;
  if(gameState.viewMode==="single")gameState.viewTarget=opp.index;
  renderBoardView(gameState);

  document.getElementById('phasePill').textContent=`${opp.name.split(',')[0]}'s Turn`;
  document.getElementById('huntTitle').textContent=`${opp.ico} ${opp.name.split(',')[0]}'s Turn`;

  const decl=document.getElementById('declare');decl.className="declare garruk compact-declare";
  // Same pattern as your steps: panel title = whose turn, badge = what's happening
  document.getElementById('declareTitle').textContent="Opponent Turn";

  // One-line summary for the badge row
  const attacksPlayer=result.target==="player"&&result.attackPower>0;
  // Factual one-line summary; the actions panel above has the detail
  const plays=result.actions.filter(a=>a.label&&!/^Draw$|land drop/i.test(a.label)).length;
  const attackText=attacksPlayer?`Attacking you for ${result.attackPower}`
    :result.attackPower>0?`Attacking ${getTargetName(gameState,result.target)} for ${result.attackPower}`
    :"No attack this turn";
  const topSummary=`${plays?`${plays} play${plays===1?"":"s"} · `:""}${attackText}`;
  document.getElementById('declareFlavor').textContent=topSummary;
  document.getElementById('declareMech').innerHTML='';

  // Show full action breakdown in the Last Turn section (below confirm bar)
  renderLastTurnSection(opp);

  // Resolve any board-wipe choice before the combat response form is available.
  const wipeAction=result.actions.find(a=>a.boardWipe);
  const renderResponse=()=>{
    const panel=document.getElementById('respGrid');
    document.getElementById('respTitle').textContent="Your Response";
    renderResponseForm(panel,opp,result,attacksPlayer);
  };
  if(wipeAction){
    showBoardWipePopup(opp,wipeAction).then(renderResponse);
    return;
  }
  renderResponse();
}

/**
 * Commander-mode combat choice popup — block (stop damage, creature lives) or kill (dies → graveyard).
 * Returns "blocked" | "dies" | null (cancelled).
 */
function askCommanderCombatChoice(token){
  const p=token.p||0, t=token.t||0;
  const kws=token.kws||[];
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
 * Commander-mode removal destination popup — graveyard or exile.
 * Returns "graveyard" | "exile" | null (cancelled).
 */
function askCommanderRemovalDestination(token){
  const p=token.p||0, t=token.t||0;
  const kws=token.kws||[];
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

/**
 * Ask the player to name a planeswalker they're adding.
 */
function askPlaneswalkerName(){
  return new Promise(res=>{
    inputResolver=res;
    document.getElementById('inputTitle').textContent="Add Planeswalker";
    const body=document.getElementById('inputBody');
    body.innerHTML=`<div class="confirm-msg"><label>Planeswalker name<input type="text" id="pwNameInput" placeholder="e.g. Jace, the Mind Sculptor" maxlength="60" style="width:100%;padding:8px;margin-top:6px;border:1px solid var(--border-lt);border-radius:6px;background:var(--panel);color:var(--ink);font-size:14px;"></label></div>`;
    const acts=document.getElementById('inputActions'); acts.className="input-actions";
    const ok=document.getElementById('inputOk'); ok.textContent="Next";
    ok.onclick=()=>{const v=document.getElementById('pwNameInput').value.trim();closeInput();res(v||null);};
    document.getElementById('inputCancel').onclick=()=>{closeInput();res(null);};
    document.getElementById('inputOverlay').classList.add('show');
    setTimeout(()=>{const inp=document.getElementById('pwNameInput');if(inp){inp.focus();}},60);
  });
}

/**
 * Ask for starting loyalty for the planeswalker.
 */
function askPlaneswalkerLoyalty(){
  return new Promise(res=>{
    inputResolver=res;
    document.getElementById('inputTitle').textContent="Starting Loyalty";
    const body=document.getElementById('inputBody');
    body.innerHTML=`<div class="num-row">
       <button type="button" id="numDown">−</button>
       <input type="number" id="numInput" value="4" min="1" inputmode="numeric">
       <button type="button" id="numUp">+</button></div>`;
    const acts=document.getElementById('inputActions'); acts.className="input-actions";
    document.getElementById('inputOk').textContent="Add";
    const inp=document.getElementById('numInput');
    document.getElementById('numDown').onclick=()=>{inp.value=Math.max(1,(parseInt(inp.value,10)||0)-1);};
    document.getElementById('numUp').onclick=()=>{inp.value=(parseInt(inp.value,10)||0)+1;};
    inp.onkeydown=(e)=>{if(e.key==="Enter"){done();}};
    function done(){const v=parseInt(inp.value,10);closeInput();res(isNaN(v)?null:Math.max(1,v));}
    document.getElementById('inputOk').onclick=done;
    document.getElementById('inputCancel').onclick=()=>{closeInput();res(null);};
    document.getElementById('inputOverlay').classList.add('show');
    setTimeout(()=>{inp.focus();inp.select();},60);
  });
}

function renderResponseForm(panel,opp,result,attacksPlayer){
  const hasCreatures=opp.tokens.length>0;
  const defenderOpp=(!attacksPlayer&&result.target)?gameState.opponents.find(o=>o.id===result.target):null;
  const defenderHasCreatures=defenderOpp&&defenderOpp.tokens.length>0;

  let html='<div class="context-form commander-form">';

  // Numbered steps in rules order (counter → remove/block → damage), same pattern as
  // adventure mode's "Resolve in order". Each step says what you can do and shows a live
  // status (refreshed by stepStatusFn) that highlights once you've used it.
  const isIntervention=!attacksPlayer&&result.attackPower>0;
  const showDefender=isIntervention&&defenderHasCreatures;
  const oppName=opp.name.split(',')[0];
  const counterSteps=(opp.actionSteps||[]).map((a,i)=>({a,i})).filter(({a})=>a.label.includes("Cast")||a.label.includes("Equip"));
  const countered=document.getElementById('cmdLastTurn')?._counteredSet||new Set();
  let stepNo=1;

  if(counterSteps.length){
    html+=responseStepHtml(stepNo++,"counter","Counter a spell",
      "Select each spell you countered.",
      `<div class="counter-chips">${counterSteps.map(({a,i})=>`<button type="button" class="counter-chip${countered.has(i)?" active":""}" data-counter-idx="${i}">${a.label}</button>`).join("")}</div>`,
      "response-counter");
  }

  if(hasCreatures||showDefender){
    const hint=attacksPlayer?"Select an attacker to mark it blocked or destroyed. Select any other creature you removed."
      :isIntervention?`${oppName} is attacking ${defenderOpp?defenderOpp.name.split(',')[0]:"another player"}. Select any creature you removed before combat damage.`
      :"Select any creature you removed at instant speed.";
    let body="";
    // Active opponent's creatures
    if(hasCreatures){
      const tappedCount=opp.tokens.filter(t=>t.attacking).length;
      const roleLabel=isIntervention?" (attacker)":"";
      body+=`<div class="kill-owner-group"><div class="kill-owner-label" style="border-left-color:${oppColor(opp)}">${opp.ico} ${oppName}${roleLabel}${tappedCount?` · ${tappedCount} tapped`:''}</div>
        <div class="kill-select">${opp.tokens.map((t,i)=>{
          const isAttacking=!!t.attacking;
          return `<button type="button" class="kill-btn card-choice${isAttacking?' is-tapped':''}" data-opp="${opp.id}" data-idx="${i}" aria-label="Select ${t.name}"><span class="kill-btn-status">${isAttacking?'⚔':'⬡'}</span>${cardReferenceHtml(t)}</button>`;
        }).join('')}</div></div>`;
    }
    // Defender's creatures (only when there's actual combat between CPUs)
    if(showDefender){
      body+=`<div class="kill-owner-group"><div class="kill-owner-label" style="border-left-color:${oppColor(defenderOpp)}">${defenderOpp.ico} ${defenderOpp.name.split(',')[0]} (defender)</div>
        <div class="kill-select">${defenderOpp.tokens.map((t,i)=>`<button type="button" class="kill-btn card-choice" data-opp="${defenderOpp.id}" data-idx="${i}" aria-label="Select ${t.name}"><span class="kill-btn-status">⬡</span>${cardReferenceHtml(t)}</button>`).join('')}</div></div>`;
    }
    html+=responseStepHtml(stepNo++,"remove",attacksPlayer?"Block or remove creatures":"Remove creatures",hint,body,"precombat-removal");
  }

  // Combat damage inputs (if attacking the player)
  if(attacksPlayer){
    const cmdDmg=result.commanderAttacking?(opp.tokens.find(t=>t.kind==="commander")?.p||0):0;
    const pwTarget=result.planeswalkerTarget||opp._planeswalkerTarget;
    const attackingPW=!!pwTarget;
    const combatTitle=attackingPW
      ?`${oppName} attacks ⬡ ${pwTarget.name} (${pwTarget.loyalty}) for ${result.attackPower}`
      :`${oppName} attacks you for ${result.attackPower}`;
    html+=responseStepHtml(stepNo++,"damage",combatTitle,
      "Calculated from unblocked attackers. Adjust for prevention or other effects.",
      `<div class="commander-player-actions">
        ${attackingPW?`<div class="inline-stepper"><label>Damage to ${pwTarget.name}</label>
          <button type="button" data-key="damageToPW" data-delta="-1">−</button>
          <input type="number" min="0" max="${result.attackPower}" value="${result.attackPower}" data-key="damageToPW" data-pw-id="${pwTarget.id}">
          <button type="button" data-key="damageToPW" data-delta="1">+</button>
        </div>`:""}
        <div class="inline-stepper"><label>Damage to you</label>
          <button type="button" data-key="damageThrough" data-delta="-1">−</button>
          <input type="number" min="0" max="${result.attackPower}" value="${attackingPW?0:result.attackPower}" data-key="damageThrough">
          <button type="button" data-key="damageThrough" data-delta="1">+</button>
        </div>
        ${cmdDmg>0?`<div class="inline-stepper"><label>Commander damage to you</label>
          <button type="button" data-key="cmdrDmgThrough" data-delta="-1">−</button>
          <input type="number" min="0" max="${cmdDmg}" value="${attackingPW?0:cmdDmg}" data-key="cmdrDmgThrough">
          <button type="button" data-key="cmdrDmgThrough" data-delta="1">+</button>
        </div>`:''}
        ${gameState.player.creatures>0?`<div class="inline-stepper"><label>Your creatures that died</label>
          <button type="button" data-key="playerDeaths" data-delta="-1">−</button>
          <input type="number" min="0" max="${gameState.player.creatures}" value="0" data-key="playerDeaths">
          <button type="button" data-key="playerDeaths" data-delta="1">+</button>
        </div>`:''}
      </div>`,
      "enemy-combat");
  }

  // No interaction needed
  if(stepNo===1){
    html+=`<div class="context-summary"><span class="context-summary-icon">✓</span><div><strong>No response needed</strong><span>${oppName} made no plays you can respond to.</span></div></div>`;
  }

  // Board-wipe outcomes are resolved by showBoardWipePopup before this response form appears.

  // Player response actions — always available (instants, flash, abilities)
  html+=`<div class="context-section"><div class="context-section-title">Your response (instants / flash)</div>
    <div class="commander-player-actions">
      <div class="inline-stepper"><label>Creatures you played (flash)</label>
        <button type="button" data-key="flashCreatures" data-delta="-1">−</button>
        <input type="number" min="0" value="0" data-key="flashCreatures">
        <button type="button" data-key="flashCreatures" data-delta="1">+</button>
      </div>
      <div class="inline-stepper"><label>Damage you dealt (instant)</label>
        <button type="button" data-key="instantDamage" data-delta="-1">−</button>
        <input type="number" min="0" value="0" data-key="instantDamage">
        <button type="button" data-key="instantDamage" data-delta="1">+</button>
      </div>
      <div class="inline-stepper"><label>Damage target</label>
        <div class="target-buttons instant-dmg-targets" id="instantDmgTargets">
          <button type="button" class="target-btn tiny-target" data-instant-target="${opp.id}">${opp.ico}</button>
          ${defenderOpp?`<button type="button" class="target-btn tiny-target" data-instant-target="${defenderOpp.id}">${defenderOpp.ico}</button>`:""}
        </div>
      </div>
    </div>
  </div>`;

  html+='</div>';
  panel.innerHTML=html;

  // Wire steppers
  panel.querySelectorAll('[data-delta]').forEach(btn=>{
    btn.onclick=()=>{
      const inp=btn.parentElement.querySelector('input');const mx=inp.max?parseInt(inp.max):999;
      inp.value=Math.max(0,Math.min(mx,(parseInt(inp.value)||0)+parseInt(btn.dataset.delta)));
      if(inp.dataset.key==="playerDeaths")updateCreaturePreview();
    };
  });

  // Wire instant damage target selection
  panel._instantDmgTarget=opp.id;
  panel.querySelectorAll('[data-instant-target]').forEach(btn=>{
    if(btn.dataset.instantTarget===opp.id)btn.classList.add('active');
    btn.onclick=()=>{
      panel.querySelectorAll('[data-instant-target]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      panel._instantDmgTarget=btn.dataset.instantTarget;
    };
  });

  // Wire kill-select buttons — keyed by opp id + index
  const killMap={};  // {oppId: Set of indices}
  const blockMap={};  // {oppId: Set of indices} — blocked but alive
  function updateDamageFromKills(){
    if(!attacksPlayer)return;
    const attackers=opp.tokens.filter(t=>t.attacking);
    const attackerKills=killMap[opp.id]||new Set();
    const attackerBlocks=blockMap[opp.id]||new Set();
    let remaining=0; let cmdAlive=false;
    attackers.forEach((t)=>{
      const realIdx=opp.tokens.indexOf(t);
      if(!attackerKills.has(realIdx)&&!attackerBlocks.has(realIdx)){remaining+=t.p; if(t.kind==="commander")cmdAlive=true;}
    });
    const dmgInput=panel.querySelector('input[data-key="damageThrough"]');
    if(dmgInput){ dmgInput.value=remaining; dmgInput.max=remaining; }
    const cmdrInput=panel.querySelector('input[data-key="cmdrDmgThrough"]');
    if(cmdrInput){
      if(!cmdAlive){cmdrInput.value=0;cmdrInput.max=0;}
      else{const cmdPower=opp.tokens.find(t=>t.kind==="commander")?.p||0;cmdrInput.max=Math.min(cmdPower,remaining);cmdrInput.value=Math.min(parseInt(cmdrInput.value)||0,cmdrInput.max);}
    }
  }
  function updateBtnVisual(btn,oppId,idx){
    const killed=killMap[oppId]&&killMap[oppId].has(idx);
    const blocked=blockMap[oppId]&&blockMap[oppId].has(idx);
    btn.classList.toggle('selected',killed);
    btn.classList.toggle('blocked-btn',blocked);
    // Update label
    const statusEl=btn.querySelector('.kill-btn-status');
    if(statusEl){
      if(killed)statusEl.textContent='💀';
      else if(blocked)statusEl.textContent='🛡️';
      else statusEl.textContent=btn.classList.contains('is-tapped')?'⚔':'⬡';
    }
  }
  panel.querySelectorAll('.kill-btn').forEach(btn=>{
    btn.onclick=async()=>{
      const oppId=btn.dataset.opp;
      const idx=parseInt(btn.dataset.idx);
      if(!killMap[oppId])killMap[oppId]=new Set();
      if(!blockMap[oppId])blockMap[oppId]=new Set();

      // If already marked, clicking resets
      if(killMap[oppId].has(idx)||blockMap[oppId].has(idx)){
        killMap[oppId].delete(idx);
        blockMap[oppId].delete(idx);
        updateBtnVisual(btn,oppId,idx);
        updateDamageFromKills();
        return;
      }

      // Find the token to check if it's attacking
      const targetOpp=gameState.opponents.find(o=>o.id===oppId);
      const token=targetOpp&&targetOpp.tokens[idx];
      if(!token){
        // Fallback: toggle kill
        killMap[oppId].add(idx);
        updateBtnVisual(btn,oppId,idx);
        updateDamageFromKills();
        return;
      }

      // If attacking, show block/die choice
      if(token.attacking){
        const choice=await askCommanderCombatChoice(token);
        if(!choice)return; // cancelled
        if(choice==="blocked"){
          blockMap[oppId].add(idx);
        }else{
          killMap[oppId].add(idx);
        }
      }else{
        // Non-attacking creatures can only die
        killMap[oppId].add(idx);
      }
      updateBtnVisual(btn,oppId,idx);
      updateDamageFromKills();
    };
  });
  panel._killMap=killMap;
  panel._blockMap=blockMap;

  panel.querySelectorAll('[data-counter-idx]').forEach(chip=>{
    chip.onclick=()=>toggleCounter(parseInt(chip.dataset.counterIdx,10));
  });

  // Wire the continue button (fixed position above panel)
  const remaining=cpuQueue.length;
  setConfirmButton(
    remaining>0?`Next Opponent (${remaining} left) ▸`:"Continue to Your Turn ▸",
    "garruk",
    ()=>resolveResponseAndContinue(opp,result,attacksPlayer,panel),
    false,
    ()=>{
      const countered=document.getElementById('cmdLastTurn')?._counteredSet?.size||0;
      const removed=killCount(panel);
      const blocked=Object.values(panel._blockMap||{}).reduce((n,set)=>n+set.size,0);
      const parts=[countered>0&&`Counter ${countered}`,removed>0&&`Remove ${removed}`,blocked>0&&`Block ${blocked}`];
      if(attacksPlayer){
        const taken=inputValue(panel,'input[data-key="damageThrough"]');
        const cmdr=inputValue(panel,'input[data-key="cmdrDmgThrough"]');
        const pwInput=panel.querySelector('input[data-key="damageToPW"]');
        const pwDamage=inputValue(panel,'input[data-key="damageToPW"]');
        if(pwInput&&pwDamage>0){
          const pw=(gameState.player.planeswalkers||[]).find(p=>p.id===pwInput.dataset.pwId);
          parts.push(`⬡ ${pw?pw.name.split(',')[0]:"Planeswalker"} takes ${pwDamage}`);
        }
        parts.push(taken>0?`Take ${taken}${cmdr>0?` (${cmdr} cmdr)`:""}`:(pwInput?"":"Take 0"));
      }
      return joinPreview(parts);
    }
  );
  stepStatusFn=()=>{
    const counteredCount=document.getElementById('cmdLastTurn')?._counteredSet?.size||0;
    setStepStatus(panel,"counter",counteredCount?`${counteredCount} countered`:"",counteredCount>0);
    const dying=Object.values(panel._killMap||{}).reduce((n,set)=>n+set.size,0);
    const blocked=Object.values(panel._blockMap||{}).reduce((n,set)=>n+set.size,0);
    setStepStatus(panel,"remove",joinPreview([dying&&`${dying} dying`,blocked&&`${blocked} blocked`]),dying+blocked>0);
    if(attacksPlayer){
      const taken=inputValue(panel,'input[data-key="damageThrough"]');
      const pwTaken=inputValue(panel,'input[data-key="damageToPW"]');
      setStepStatus(panel,"damage",`Take ${taken}`,taken+pwTaken<result.attackPower);
    }
  };
  refreshConfirmPreview();
}

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
  const step=panel.querySelector(`.response-step[data-step="${key}"]`);
  if(!step)return;
  step.classList.toggle('is-set',!!isSet);
  const status=step.querySelector('.step-status');
  if(status)status.textContent=text||"Optional";
}
/* Counter toggles live in two places (actions panel + step 1); keep them in sync. */
function toggleCounter(idx){
  const el=document.getElementById('cmdLastTurn');
  if(!el||!el._counteredSet)return;
  if(el._counteredSet.has(idx))el._counteredSet.delete(idx);else el._counteredSet.add(idx);
  const on=el._counteredSet.has(idx);
  el.querySelectorAll(`.lt-step[data-step-idx="${idx}"]`).forEach(btn=>btn.classList.toggle('lt-countered',on));
  document.querySelectorAll(`[data-counter-idx="${idx}"]`).forEach(chip=>chip.classList.toggle('active',on));
}

/* Reuse the complete Create Player Action workflow during CPU priority windows.
   The legacy response form still owns combat/removal inputs; this layer removes
   its limited flash/instant tracker and attaches the same action controls used
   in the player's main phases. */
const baseRenderResponseForm=renderResponseForm;
let cpuResponseActionKey=null;

function buildCpuResponsePlayerActionHtml(draft,effect,actionHelp="Resolve an instant-speed action, then continue the opponent's turn."){
  const scopeOptions=PLAYER_ACTION_SCOPES.map(scope=>`<option value="${scope.value}" ${scope.value===draft.scope?"selected":""}>${scope.label}</option>`).join("");
  const actionOptions=PLAYER_ACTIONS.map(action=>`<option value="${action.value}" ${action.value===draft.action?"selected":""}>${action.label}</option>`).join("");
  const needsCardType=["destroy","sacrifice","exile"].includes(effect.action);
  const isGlobalGraveyardExile=effect.action==="exileGraveyards";
  const isAllAmount=!isGlobalGraveyardExile&&effect.all;
  const cardTypeOptions=PLAYER_ACTION_CARD_TYPES.map(type=>`<option value="${type}" ${type===draft.cardType?"selected":""}>${type[0].toUpperCase()+type.slice(1)}</option>`).join("");
  let html=`<details class="context-disclosure player-action-disclosure"${draft.actionOpen?" open":""}><summary><span>Create Player Action ${helpTip("Resolve a spell or ability you control that affects players: discard, mill, destroy, draw, or life changes. CPUs respond automatically.")}</span><small></small></summary><div class="context-disclosure-body"><div class="context-section player-effect-section">
    <div class="player-action-grid">
      ${isGlobalGraveyardExile?"":`<label>Scope<select id="playerActionScope">${scopeOptions}</select></label>`}
      <label>Action<select id="playerActionType">${actionOptions}</select></label>
      ${isGlobalGraveyardExile?"":`<label>Amount<div class="inline-stepper player-action-count-stepper${isAllAmount?" all-selected":""}"><button type="button" id="playerActionCountDown" ${isAllAmount?"disabled":""}>−</button><input type="number" min="1" max="99" value="${isAllAmount?"":effect.count}" id="playerActionCount" ${isAllAmount?"disabled":""}><button type="button" id="playerActionCountUp" ${isAllAmount?"disabled":""}>+</button></div><span class="player-action-all-toggle"><input type="checkbox" id="playerActionAll" ${isAllAmount?"checked":""}>All</span></label>`}
      ${needsCardType?`<label>Card type<select id="playerActionCardType">${cardTypeOptions}</select></label>`:""}
    </div>
    <span class="player-effect-help">${isGlobalGraveyardExile?"Moves every tracked graveyard card to its owner’s exile zone and clears all graveyard totals.":actionHelp}</span>
    <div class="player-effect-preview"><strong>${playerEffectSummary(effect)}</strong></div>`;
  if(effect.scope==="target"){
    html+=`<div class="target-buttons player-effect-targets">${[gameState.player,...aliveOpponents(gameState)].map(target=>`<button type="button" class="target-btn ${draft.targetId===target.id?"active":""}" data-action-target-id="${target.id}">${target.id==="player"?"🗡️":target.ico} ${effectTargetName(target)}</button>`).join("")}</div>`;
  }
  const targets=effectTargets(gameState,effect,draft.targetId);
  if(effect.action==="reanimate"&&targets.length>0){
    html+=`<div class="player-effect-choices"><span>${effect.all?"Select every available creature card":`Select up to ${effect.count} creature card${effect.count===1?"":"s"}`}; every selected card is resurrected onto your battlefield.</span>`;
    targets.forEach(owner=>{
      const cards=graveyardCreatureCards(owner);
      html+=`<div class="player-effect-owner"><span>${owner.id==="player"?"🗡️":owner.ico} ${effectTargetName(owner)}'s graveyard</span>${cards.length?`<div class="kill-select">${cards.map(card=>`<button type="button" class="kill-btn card-choice ${(draft.choices[owner.id]||[]).includes(card.id)?"selected":""}" data-reanimate-owner="${owner.id}" data-reanimate-card="${card.id}" aria-label="Select ${card.name}">${cardReferenceHtml(card)}</button>`).join("")}</div>`:"<small>No materialized creature cards.</small>"}</div>`;
    });
    html+="</div>";
  }
  if(needsCardType&&targets.length>0){
    const cpuTargets=targets.filter(target=>target.id!=="player");
    html+='<div class="player-effect-choices">';
    if(cpuTargets.length)html+=`<span>Each affected CPU chooses its least valuable ${effect.cardType} automatically.</span>`;
    if(targets.some(target=>target.id==="player"))html+=`<div class="player-effect-manual">🗡️ Complete your own ${effect.all?`all ${effect.cardType}s`:`${effect.count} ${effect.cardType}${effect.count===1?"":"s"}`} selection at the table, then confirm resolution.</div>`;
    html+="</div>";
  }
  const ready=canResolvePlayerEffect(effect,draft);
  return html+=`<button type="button" class="target-btn player-effect-resolve" id="resolvePlayerAction" ${ready?"":"disabled"}>Resolve action</button></div></div></details>`;
}

function renderCpuResponsePlayerAction(panel,opp,result,attacksPlayer){
  const host=panel.querySelector("#cpuResponsePlayerAction");
  if(!host)return;
  const contextKey=`${gameState.turn}:${opp.id}`;
  if(cpuResponseActionKey!==contextKey){
    commanderEffectDraft=null;
    cpuResponseActionKey=contextKey;
  }
  const draft=commanderEffectDraftForPanel(host);
  const disclosure=host.querySelector(".player-action-disclosure");
  if(disclosure)draft.actionOpen=disclosure.open;
  const effect=createPlayerEffect(draft);
  host.innerHTML=buildCpuResponsePlayerActionHtml(draft,effect);
  const actionDisclosure=host.querySelector(".player-action-disclosure");
  if(actionDisclosure)actionDisclosure.ontoggle=()=>{draft.actionOpen=actionDisclosure.open;};

  const updateAction=(field,value,resetTarget=false)=>{
    const currentDisclosure=host.querySelector(".player-action-disclosure");
    if(currentDisclosure)draft.actionOpen=currentDisclosure.open;
    draft[field]=value;
    if(field==="action"){draft.count=1;draft.all=false;}
    draft.choices={};
    if(resetTarget)draft.targetId=null;
    renderCpuResponsePlayerAction(panel,opp,result,attacksPlayer);
  };
  const scopeSelect=host.querySelector("#playerActionScope");
  if(scopeSelect)scopeSelect.onchange=event=>updateAction("scope",event.target.value,true);
  host.querySelector("#playerActionType").onchange=event=>updateAction("action",event.target.value);
  const countInput=host.querySelector("#playerActionCount");
  if(countInput){
    countInput.onchange=()=>updateAction("count",Math.max(1,parseInt(countInput.value)||1));
    host.querySelector("#playerActionCountDown").onclick=()=>{countInput.value=Math.max(1,(parseInt(countInput.value)||1)-1);updateAction("count",parseInt(countInput.value));};
    host.querySelector("#playerActionCountUp").onclick=()=>{countInput.value=(parseInt(countInput.value)||1)+1;updateAction("count",parseInt(countInput.value));};
  }
  const allInput=host.querySelector("#playerActionAll");
  if(allInput)allInput.onchange=()=>updateAction("all",allInput.checked);
  const cardType=host.querySelector("#playerActionCardType");
  if(cardType)cardType.onchange=event=>updateAction("cardType",event.target.value);
  host.querySelectorAll("[data-action-target-id]").forEach(button=>{button.onclick=()=>{draft.targetId=button.dataset.actionTargetId;draft.choices={};renderCpuResponsePlayerAction(panel,opp,result,attacksPlayer);};});
  host.querySelectorAll("[data-reanimate-owner]").forEach(button=>{button.onclick=()=>{
    const owner=button.dataset.reanimateOwner,cardId=button.dataset.reanimateCard;
    const selected=draft.choices[owner]||[];
    draft.choices[owner]=selected.includes(cardId)?selected.filter(id=>id!==cardId):[...selected,cardId];
    renderCpuResponsePlayerAction(panel,opp,result,attacksPlayer);
  };});
  host.querySelector("#resolvePlayerAction").onclick=async()=>{
    if(!canResolvePlayerEffect(effect,draft))return;
    const resolved=await confirmAndResolvePlayerEffect(effect,draft);
    if(resolved)renderResponseForm(panel,opp,result,attacksPlayer);
  };
}

function renderCombatPlayerAction(panel){
  const host=panel.querySelector("#combatPlayerAction");
  if(!host)return;
  const draft=commanderEffectDraftForPanel(host);
  const disclosure=host.querySelector(".player-action-disclosure");
  if(disclosure)draft.actionOpen=disclosure.open;
  const effect=createPlayerEffect(draft);
  host.innerHTML=buildCpuResponsePlayerActionHtml(draft,effect,"Resolve a player action before finalizing combat.");
  const actionDisclosure=host.querySelector(".player-action-disclosure");
  if(actionDisclosure)actionDisclosure.ontoggle=()=>{draft.actionOpen=actionDisclosure.open;};

  const updateAction=(field,value,resetTarget=false)=>{
    const currentDisclosure=host.querySelector(".player-action-disclosure");
    if(currentDisclosure)draft.actionOpen=currentDisclosure.open;
    draft[field]=value;
    if(field==="action"){draft.count=1;draft.all=false;}
    draft.choices={};
    if(resetTarget)draft.targetId=null;
    renderCombatPlayerAction(panel);
  };
  const scopeSelect=host.querySelector("#playerActionScope");
  if(scopeSelect)scopeSelect.onchange=event=>updateAction("scope",event.target.value,true);
  host.querySelector("#playerActionType").onchange=event=>updateAction("action",event.target.value);
  const countInput=host.querySelector("#playerActionCount");
  if(countInput){
    countInput.onchange=()=>updateAction("count",Math.max(1,parseInt(countInput.value)||1));
    host.querySelector("#playerActionCountDown").onclick=()=>{countInput.value=Math.max(1,(parseInt(countInput.value)||1)-1);updateAction("count",parseInt(countInput.value));};
    host.querySelector("#playerActionCountUp").onclick=()=>{countInput.value=(parseInt(countInput.value)||1)+1;updateAction("count",parseInt(countInput.value));};
  }
  const allInput=host.querySelector("#playerActionAll");
  if(allInput)allInput.onchange=()=>updateAction("all",allInput.checked);
  const cardType=host.querySelector("#playerActionCardType");
  if(cardType)cardType.onchange=event=>updateAction("cardType",event.target.value);
  host.querySelectorAll("[data-action-target-id]").forEach(button=>{button.onclick=()=>{draft.targetId=button.dataset.actionTargetId;draft.choices={};renderCombatPlayerAction(panel);};});
  host.querySelectorAll("[data-reanimate-owner]").forEach(button=>{button.onclick=()=>{
    const owner=button.dataset.reanimateOwner,cardId=button.dataset.reanimateCard;
    const selected=draft.choices[owner]||[];
    draft.choices[owner]=selected.includes(cardId)?selected.filter(id=>id!==cardId):[...selected,cardId];
    renderCombatPlayerAction(panel);
  };});
  host.querySelector("#resolvePlayerAction").onclick=async()=>{
    if(!canResolvePlayerEffect(effect,draft))return;
    const resolved=await confirmAndResolvePlayerEffect(effect,draft);
    if(resolved)renderCombatPlayerAction(panel);
  };
}

renderResponseForm=function(panel,opp,result,attacksPlayer){
  baseRenderResponseForm(panel,opp,result,attacksPlayer);
  const limitedResponse=Array.from(panel.querySelectorAll(".context-section")).find(section=>section.querySelector(".context-section-title")?.textContent.trim()==="Your response (instants / flash)");
  if(limitedResponse)limitedResponse.remove();
  const actionHost=document.createElement("div");
  actionHost.id="cpuResponsePlayerAction";
  panel.appendChild(actionHost);
  renderCpuResponsePlayerAction(panel,opp,result,attacksPlayer);
};

function resolveResponseAndContinue(opp,result,attacksPlayer,panel){
  cmdSnapshot();
  // Read player's responses
  const ltEl=document.getElementById('cmdLastTurn');
  const counteredSet=ltEl?._counteredSet||new Set();
  const damageThrough=parseInt(panel.querySelector('input[data-key="damageThrough"]')?.value)||0;
  const cmdrDmgThrough=parseInt(panel.querySelector('input[data-key="cmdrDmgThrough"]')?.value)||0;
  const playerDeaths=parseInt(panel.querySelector('input[data-key="playerDeaths"]')?.value)||0;
  const flashCreatures=parseInt(panel.querySelector('input[data-key="flashCreatures"]')?.value)||0;
  const instantDamage=parseInt(panel.querySelector('input[data-key="instantDamage"]')?.value)||0;
  const damageToPW=parseInt(panel.querySelector('input[data-key="damageToPW"]')?.value)||0;
  const pwDmgInput=panel.querySelector('input[data-key="damageToPW"]');
  const pwTargetId=pwDmgInput?pwDmgInput.dataset.pwId:null;
  const instantDmgTarget=panel._instantDmgTarget||opp.id;

  // Apply countered spells
  if(counteredSet.size>0){
    counteredSet.forEach(idx=>{
      const action=opp.actionSteps[idx];
      if(!action)return;
      logCommander(`You counter ${action.label}.`);
      // If they cast their commander and it was countered, return to zone
      if(action.label.includes("Cast "+opp.name.split(',')[0])){
        const cmdToken=opp.tokens.find(t=>t.kind==="commander"&&t.summoningSick);
        if(cmdToken){
          returnCommanderToZone(opp);
          logCommander(`${opp.name.split(',')[0]}'s commander is countered — returns to command zone.`);
        }
      }
      // If gear was countered, undo its bonus
      if(action.label.includes("Equip")){
        const commander=commanderOnField(opp);
        if(commander){
          // Find the gear bonus from the action detail (look for +X pattern)
          const gearCard=VOLTRON_CARDS.gear.find(g=>action.label.includes(g.name));
          if(gearCard){
            const gearIndex=(opp.attachedGear||[]).findIndex(gear=>gear.name===gearCard.name);
            const [removedGear]=gearIndex>=0?opp.attachedGear.splice(gearIndex,1):[];
            refreshCommanderGear(opp);
            const moved=removedGear&&recordOpponentPermanentZone(opp,"graveyard",{name:removedGear.name,ico:"⚙",types:["Artifact","Equipment"],effect:removedGear.kw||""});
            logCommander(moved?`${gearCard.name} is countered: ${movementCardText(moved)}. Types: ${discardedTypeSummary([moved])}. ${commander.name} reverts to ${commander.p}/${commander.t}.`:`${gearCard.name} is countered — ${commander.name} reverts to ${commander.p}/${commander.t}.`);
          }
        }
      }
      // If a creature cast was countered, remove it
      if(action.label.includes("Cast ")&&!action.label.includes("Equip")&&!action.label.includes(opp.name.split(',')[0])){
        // Find the most recently added creature that matches this action
        const castName=action.label.replace(/^Cast /,'').replace(/ \(.*$/,'');
        const tokenIdx=opp.tokens.findIndex(t=>t.name===castName&&t.summoningSick);
        if(tokenIdx>=0){
          const moved=removeOpponentPermanent(opp,`token:${tokenIdx}`,"graveyard");
          if(moved)logCommander(`${castName} is countered: ${movementCardText(moved)}. Types: ${discardedTypeSummary([moved])}.`);
        }
      }
    });
  }

  // Apply creature kills (grouped by owner)
  const killMap=panel._killMap||{};
  for(const [oppId, kills] of Object.entries(killMap)){
    if(!kills||kills.size===0)continue;
    const targetOpp=gameState.opponents.find(o=>o.id===oppId);
    if(!targetOpp)continue;
    const indices=Array.from(kills).sort((a,b)=>b-a);
    indices.forEach(idx=>{
      if(idx<targetOpp.tokens.length){
        const moved=removeOpponentPermanent(targetOpp,`token:${idx}`,"graveyard");
        if(moved)logCommander(`You destroy ${movementCardText(moved)} from ${targetOpp.name.split(',')[0]}. Types: ${discardedTypeSummary([moved])}.`);
      }
    });
  }

  // Apply combat damage to player
  if(attacksPlayer){
    // Recalculate actual attack power after removals (attackers may have been removed)
    const actualPower=opp.tokens.filter(t=>t.attacking).reduce((s,t)=>s+t.p,0);
    const declaredDamage=Math.min(damageThrough,actualPower);
    const declaredCommanderDamage=Math.min(cmdrDmgThrough,declaredDamage);
    const prevention=applyCpuDamagePrevention(declaredDamage,declaredCommanderDamage);
    const finalDamage=prevention.damage;

    if(finalDamage>0){
      gameState.player.life=Math.max(0,gameState.player.life-finalDamage);
      opp.damageLog["player"]=(opp.damageLog["player"]||0)+finalDamage;
      logCommander(`${opp.name.split(',')[0]} hits you for ${finalDamage}. Life → ${gameState.player.life}.`);
    } else {
      logCommander(`You prevent all damage from ${opp.name.split(',')[0]}.`);
    }
    if(prevention.reduced)logCommander(`Battlefield damage reduction lowers ${opp.name.split(',')[0]}'s combat damage by ${prevention.reduced}.`);
    if(prevention.prevented)logCommander(`Battlefield prevention stops ${prevention.prevented} damage from ${opp.name.split(',')[0]}.`);

    if(prevention.commanderDamage>0){
      gameState.player.commanderDamageReceived[opp.id]=(gameState.player.commanderDamageReceived[opp.id]||0)+prevention.commanderDamage;
      logCommander(`${prevention.commanderDamage} commander damage from ${opp.name.split(',')[0]} (${gameState.player.commanderDamageReceived[opp.id]}/21).`);
    }

    if(playerDeaths>0){
      gameState.player.creatures=Math.max(0,gameState.player.creatures-playerDeaths);
      logCommander(`${playerDeaths} of your creatures died blocking.`);
    }
  }else if(result.target){
    const defender=gameState.opponents.find(candidate=>candidate.id===result.target);
    const attackers=opp.tokens.filter(token=>token.attacking);
    if(defender&&!isOpponentDead(defender)&&attackers.length>0){
      const combat=resolveCpuCombat(opp,defender,attackers);
      const prevention=applyCpuDamagePrevention(combat.damageToDefender,combat.commanderDamage);
      if(prevention.damage>0){
        defender.life=Math.max(0,defender.life-prevention.damage);
        defender.damageLog[opp.id]=(defender.damageLog[opp.id]||0)+prevention.damage;
        defender.lastAttacker=opp.id;
      }
      if(prevention.commanderDamage>0){
        defender.commanderDamageReceived[opp.id]=(defender.commanderDamageReceived[opp.id]||0)+prevention.commanderDamage;
      }
      if(prevention.reduced)logCommander(`Battlefield damage reduction lowers ${opp.name.split(",")[0]}'s combat damage by ${prevention.reduced}.`);
      if(prevention.prevented)logCommander(`Battlefield prevention stops ${prevention.prevented} damage from ${opp.name.split(",")[0]}.`);
      combat.defenderCreaturesKilled.forEach(dead=>{
        const index=defender.tokens.indexOf(dead);
        if(index>=0){
          const moved=removeOpponentPermanent(defender,`token:${index}`,"graveyard");
          if(moved)logCommander(`${dead.name} (${defender.name.split(",")[0]}) dies blocking → ${moved.destination}.`);
        }
      });
      combat.attackerCreaturesKilled.forEach(dead=>{
        const index=opp.tokens.indexOf(dead);
        if(index>=0){
          const moved=removeOpponentPermanent(opp,`token:${index}`,"graveyard");
          if(moved)logCommander(`${dead.name} (${opp.name.split(",")[0]}) dies in combat → ${moved.destination}.`);
        }
      });
      if(combat.blockedDescriptions.length){
        const blocks=combat.blockedDescriptions.map(block=>{
          const resultText=block.attackerDies&&block.blockerDies?`${block.attacker} trades with ${block.blocker}`:block.attackerDies?`${block.blocker} kills ${block.attacker}`:block.blockerDies?`${block.attacker} kills ${block.blocker}`:`${block.blocker} blocks ${block.attacker}`;
          return `${resultText}${block.trampleDamage?` (${block.trampleDamage} trample)`:""}`;
        }).join("; ");
        logCommander(`Combat: ${blocks}.`);
      }
      if(prevention.damage>0)logCommander(`${combat.unblocked.length} unblocked attacker${combat.unblocked.length===1?"":"s"} → ${prevention.damage} damage to ${defender.name.split(",")[0]}. Life → ${defender.life}.`);
      else if(combat.blockedDescriptions.length||prevention.prevented)logCommander(`${defender.name.split(",")[0]} takes no combat damage from ${opp.name.split(",")[0]}.`);
    }
  }

  // Clear summoning sickness for this opponent's creatures
  opp.tokens.forEach(t=>{t.summoningSick=false;});

  // Apply player response actions (flash creatures, instant damage, PW damage)
  if(flashCreatures>0){
    gameState.player.creatures+=flashCreatures;
    logCommander(`You flash in ${flashCreatures} creature${flashCreatures===1?"":"s"} during ${opp.name.split(',')[0]}'s turn.`);
  }
  if(instantDamage>0){
    const dmgTarget=gameState.opponents.find(o=>o.id===instantDmgTarget);
    if(dmgTarget){
      dmgTarget.life=Math.max(0,dmgTarget.life-instantDamage);
      dmgTarget.damageLog["player"]=(dmgTarget.damageLog["player"]||0)+instantDamage;
      logCommander(`You deal ${instantDamage} instant damage to ${dmgTarget.name.split(',')[0]}. (Life → ${dmgTarget.life})`);
    }
  }
  if(damageToPW>0&&pwTargetId){
    const pw=(gameState.player.planeswalkers||[]).find(p=>p.id===pwTargetId);
    if(pw){
      pw.loyalty=Math.max(0,pw.loyalty-damageToPW);
      logCommander(`${opp.name.split(',')[0]} deals ${damageToPW} combat damage to ⬡ ${pw.name}. Loyalty → ${pw.loyalty}.`);
      if(pw.loyalty<=0){
        gameState.player.planeswalkers=gameState.player.planeswalkers.filter(p=>p.id!==pwTargetId);
        logCommander(`⬡ ${pw.name} has been destroyed!`);
      }
    }
  }

  // Update displays
  showCommanderGame();
  saveState();

  // Advance to next opponent
  advanceCpuQueue();
}

/* =====================================================================
   PLAYER PHASE — Step-by-step turn cycle
   Draw → Main Phase 1 (develop) → Combat (per-opponent) → End Turn
   Each phase is its own simple screen telling the player exactly
   what the program needs to move forward.
   ===================================================================== */
const PLAYER_STEPS = ["draw","main1","combat","end"];
let playerStep="draw";
let combatTargetQueue=[];  // opponents to resolve combat against
let combatResults={};      // accumulated combat results this turn

function startPlayerPhase(){
  gameState.phase="player";
  playerStep="draw";
  combatResults={};
  // Untap all opponent creatures — they attacked last turn, now reset
  gameState.opponents.forEach(opp=>{opp.tokens.forEach(t=>{t.attacking=false;});});
  hideLastTurnSection();
  showCommanderGame();
  showPlayerStep();
}

function showPlayerStep(){
  document.getElementById('phasePill').textContent="Your Turn";
  const decl=document.getElementById('declare');decl.className="declare player compact-declare";

  switch(playerStep){
    case "draw": showDrawStep(); break;
    case "main1": showMainStep(); break;
    case "combat": startCombatStep(); break;
    case "end": finishPlayerTurn(); break;
  }
}

/* --- DRAW STEP --- */
function showDrawStep(){
  setPlayerStepHeader("Draw Step","Untap your permanents, resolve upkeep triggers, then draw a card.","Upkeep & Draw");

  const panel=document.getElementById('respGrid');
  const recapHtml=recapEnabled()?buildRecapHtml():"";
  panel.innerHTML=`<div class="context-form commander-form">${recapHtml||`
    <div class="context-summary draw-summary"><span class="context-summary-icon">🃏</span><div><strong>Draw for the turn</strong><span>Continue once you have drawn.</span></div></div>`}
  </div>`;
  const openLogBtn=panel.querySelector('#recapOpenLog');
  if(openLogBtn&&typeof openLog==="function")openLogBtn.onclick=openLog;

  setConfirmButton("I Drew a Card ▸","",()=>{playerStep="main1";showPlayerStep();},true);
}
/* Shared header for every player step: panel title = whose turn, badge = step. */
function setPlayerStepHeader(stepLabel,instructions,responseTitle){
  document.getElementById('huntTitle').textContent="🗡️ Your Turn";
  document.getElementById('declareTitle').textContent=stepLabel;
  document.getElementById('declareFlavor').textContent=instructions;
  document.getElementById('declareMech').innerHTML='';
  document.getElementById('respTitle').textContent=responseTitle;
}

function commanderEffectDraftForPanel(panel){
  const played=parseInt(panel?.querySelector('input[data-key="creaturesPlayed"]')?.value)||0;
  const disclosure=panel?.querySelector('.player-action-disclosure');
  if(!commanderEffectDraft){
    commanderEffectDraft={scope:"target",action:"discard",count:1,all:false,cardType:"creature",targetId:null,choices:{},creaturesPlayed:played,actionOpen:false};
  }
  if(disclosure)commanderEffectDraft.actionOpen=disclosure.open;
  commanderEffectDraft.creaturesPlayed=played||commanderEffectDraft.creaturesPlayed||0;
  return commanderEffectDraft;
}
function playerEffectSummary(effect){
  if(effect.action==="exileGraveyards")return "Exile every card from every graveyard.";
  const scope={each:"Each player",eachOpponent:"Each opponent",target:"Target player"}[effect.scope];
  if(effect.action==="reanimate")return effect.all
    ?`Resurrect every eligible creature card from ${scope.toLowerCase()}'s graveyard onto your battlefield.`
    :`Resurrect up to ${effect.count} selected creature${effect.count===1?"":"s"} from ${scope.toLowerCase()}'s graveyard onto your battlefield.`;
  const action={discard:"discards",mill:"mills",draw:"draws",loseLife:"loses",gainLife:"gains",destroy:"destroys",sacrifice:"sacrifices",exile:"exiles"}[effect.action];
  if(effect.all){
    if(effect.action==="gainLife")return `${scope} gains life equal to its current life total.`;
    if(effect.action==="loseLife")return `${scope} loses all life.`;
    const subject=(effect.action==="destroy"||effect.action==="sacrifice"||effect.action==="exile")?`all ${effect.cardType}s`:"all cards";
    return `${scope} ${action} ${subject}.`;
  }
  const subject=(effect.action==="destroy"||effect.action==="sacrifice"||effect.action==="exile")?`${effect.count} ${effect.cardType}${effect.count===1?"":"s"}`:effect.action.includes("Life")?`${effect.count} life`:`${effect.count} card${effect.count===1?"":"s"}`;
  return `${scope} ${action} ${subject}.`;
}
function battlefieldRuleTypeOptions(selected){
  const groups={};
  BATTLEFIELD_RULE_TYPES.forEach(rule=>{(groups[rule.group]||=[]).push(rule);});
  return Object.entries(groups).map(([group,rules])=>`<optgroup label="${group}">${rules.map(rule=>`<option value="${rule.value}" ${rule.value===selected?"selected":""}>${rule.label}</option>`).join("")}</optgroup>`).join("");
}
function battlefieldRuleHelp(kind){
  const help={
    artifactCastBan:"Stops CPUs from casting equipment, fast mana, and modeled artifact spells.",
    noncreatureCastBan:"Stops CPUs from casting noncreature spells while this rule remains active.",
    cpuSpellLimit:"Each CPU can cast only one modeled spell on its turn. Land drops and activated abilities remain available.",
    cpuCreatureAttackBan:"CPU creatures remain unable to declare attacks while this rule remains active.",
    cpuCreatureBlockBan:"CPU creatures cannot be assigned as blockers in CPU-versus-CPU combat while this rule remains active.",
    noncreatureTax:"The added cost applies to every modeled CPU noncreature spell, but not activated abilities such as equip.",
    creatureTax:"The added cost applies to commanders and modeled CPU creature spells.",
    preventCpuDamage:"Consumes prevention automatically as CPUs deal damage anywhere on the Commander battlefield.",
    cpuGraveyardExile:"Modeled CPU cards that would enter a graveyard are sent to exile instead. The existing commander-zone handling remains unchanged.",
    cpuDamageReduction:"Reduces the modeled total of CPU combat damage before one-shot prevention is consumed.",
    cpuCreaturePT:"Changes every CPU creature's power and toughness while this rule remains active.",
    cpuCreatureMinusPT:"Reduces every CPU creature's power and toughness by the specified positive values while this rule remains active.",
    cpuCreaturePowerCap:"Caps every CPU creature's power after its other modeled power and toughness changes are applied.",
    cpuCreatureKeywordLoss:"Removes modeled combat keywords such as trample, deathtouch, indestructible, and first strike while this rule remains active."
  };
  return help[kind]||"";
}
function battlefieldRuleAmountLabel(kind){
  return {
    noncreatureTax:"Additional mana",
    creatureTax:"Additional mana",
    preventCpuDamage:"Damage to prevent",
    cpuDamageReduction:"Damage reduction",
    cpuCreaturePowerCap:"Maximum power"
  }[kind]||"Amount";
}
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
  // Collapsible like "Create Player Action" so the main phase stays short; the count shows at a glance
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
let battlefieldRulesOpen=false;
function wireBattlefieldRulesPanel(panel){
  const disclosure=panel.querySelector("#battlefieldRulesDisclosure");
  if(disclosure)disclosure.ontoggle=()=>{battlefieldRulesOpen=disclosure.open;};
  const updateDraft=()=>{
    battlefieldRuleDraft.kind=panel.querySelector("#battlefieldRuleType")?.value||battlefieldRuleDraft.kind;
    battlefieldRuleDraft.sourceName=panel.querySelector("#battlefieldRuleSource")?.value||"";
    battlefieldRuleDraft.sourceType=panel.querySelector("#battlefieldRuleSourceType")?.value||"Enchantment";
    const amountInput=panel.querySelector("#battlefieldRuleAmount");
    if(amountInput)battlefieldRuleDraft.amount=Math.max(parseInt(amountInput.value)||0,parseInt(amountInput.min)||0);
    const isReduction=battlefieldRuleDraft.kind==="cpuCreatureMinusPT";
    const power=Math.max(parseInt(panel.querySelector("#battlefieldRulePower")?.value)||0,isReduction?0:-20);
    const toughness=Math.max(parseInt(panel.querySelector("#battlefieldRuleToughness")?.value)||0,isReduction?0:-20);
    battlefieldRuleDraft.power=power;
    battlefieldRuleDraft.toughness=toughness;
  };
  panel.querySelector("#battlefieldRuleType")?.addEventListener("change",()=>{updateDraft();renderCommanderMainPhasePanel();});
  panel.querySelector("#addBattlefieldRule")?.addEventListener("click",()=>{
    updateDraft();cmdSnapshot();addBattlefieldRule(battlefieldRuleDraft);saveState();renderCommanderMainPhasePanel();
  });
  panel.querySelectorAll("[data-rule-remove-id]").forEach(button=>button.addEventListener("click",()=>{
    cmdSnapshot();removeBattlefieldRule(button.dataset.ruleRemoveId,"was removed manually");saveState();renderCommanderMainPhasePanel();
  }));
}
function renderCommanderMainPhasePanel(){
  const panel=document.getElementById('respGrid');if(!panel)return;
  const draft=commanderEffectDraftForPanel(panel),effect=createPlayerEffect(draft);
  const scopeOptions=PLAYER_ACTION_SCOPES.map(scope=>`<option value="${scope.value}" ${scope.value===draft.scope?"selected":""}>${scope.label}</option>`).join("");
  const actionOptions=PLAYER_ACTIONS.map(action=>`<option value="${action.value}" ${action.value===draft.action?"selected":""}>${action.label}</option>`).join("");
  const needsCardType=effect.action==="destroy"||effect.action==="sacrifice"||effect.action==="exile";
  const isGlobalGraveyardExile=effect.action==="exileGraveyards";
  const isAllAmount=!isGlobalGraveyardExile&&effect.all;
  const cardTypeOptions=PLAYER_ACTION_CARD_TYPES.map(type=>`<option value="${type}" ${type===draft.cardType?"selected":""}>${type[0].toUpperCase()+type.slice(1)}</option>`).join("");
  let actionHtml=`<details class="context-disclosure player-action-disclosure"${draft.actionOpen?" open":""}><summary><span>Create Player Action ${helpTip("Resolve a spell or ability you control that affects players: discard, mill, destroy, draw, or life changes. CPUs respond automatically.")}</span><small></small></summary><div class="context-disclosure-body"><div class="context-section player-effect-section">
    <div class="player-action-grid">
      ${isGlobalGraveyardExile?"":`<label>Scope<select id="playerActionScope">${scopeOptions}</select></label>`}
      <label>Action<select id="playerActionType">${actionOptions}</select></label>
      ${isGlobalGraveyardExile?"":`<label>Amount<div class="inline-stepper player-action-count-stepper${isAllAmount?" all-selected":""}"><button type="button" id="playerActionCountDown" ${isAllAmount?"disabled":""}>−</button><input type="number" min="1" max="99" value="${isAllAmount?"":effect.count}" id="playerActionCount" ${isAllAmount?"disabled":""}><button type="button" id="playerActionCountUp" ${isAllAmount?"disabled":""}>+</button></div><span class="player-action-all-toggle"><input type="checkbox" id="playerActionAll" ${isAllAmount?"checked":""}>All</span></label>`}
      ${needsCardType?`<label>Card type<select id="playerActionCardType">${cardTypeOptions}</select></label>`:""}
    </div>
    <span class="player-effect-help">${isGlobalGraveyardExile?"Moves every tracked graveyard card to its owner’s exile zone and clears all graveyard totals.":"All resolves to each target’s available modeled amount. Noncreature permanents you control remain a physical-table action."}</span>
    <div class="player-effect-preview"><strong>${playerEffectSummary(effect)}</strong></div>`;
  if(effect.scope==="target"){
    actionHtml+=`<div class="target-buttons player-effect-targets">${[gameState.player,...aliveOpponents(gameState)].map(target=>`<button type="button" class="target-btn ${draft.targetId===target.id?"active":""}" data-action-target-id="${target.id}">${target.id==="player"?"🗡️":target.ico} ${effectTargetName(target)}</button>`).join("")}</div>`;
  }
  const targets=effectTargets(gameState,effect,draft.targetId);
  if(effect.action==="reanimate"&&targets.length>0){
    actionHtml+=`<div class="player-effect-choices"><span>${effect.all?"Select every available creature card":`Select up to ${effect.count} creature card${effect.count===1?"":"s"}`}; every selected card is resurrected onto your battlefield.</span>`;
    targets.forEach(owner=>{
      const cards=graveyardCreatureCards(owner);
      actionHtml+=`<div class="player-effect-owner"><span>${owner.id==="player"?"🗡️":owner.ico} ${effectTargetName(owner)}'s graveyard</span>${cards.length?`<div class="kill-select">${cards.map(card=>`<button type="button" class="kill-btn card-choice ${(draft.choices[owner.id]||[]).includes(card.id)?"selected":""}" data-reanimate-owner="${owner.id}" data-reanimate-card="${card.id}" aria-label="Select ${card.name}">${cardReferenceHtml(card)}</button>`).join("")}</div>`:"<small>No materialized creature cards.</small>"}</div>`;
    });
    actionHtml+="</div>";
  }
  if(needsCardType&&targets.length>0){
    const cpuTargets=targets.filter(target=>target.id!=="player");
    actionHtml+='<div class="player-effect-choices">';
    if(cpuTargets.length)actionHtml+=`<span>Each affected CPU chooses its least valuable ${effect.cardType} automatically.</span>`;
    if(targets.some(target=>target.id==="player"))actionHtml+=`<div class="player-effect-manual">🗡️ Complete your own ${effect.all?`all ${effect.cardType}s`:`${effect.count} ${effect.cardType}${effect.count===1?"":"s"}`} selection at the table, then confirm resolution.</div>`;
    actionHtml+="</div>";
  }
  const ready=canResolvePlayerEffect(effect,draft);
  actionHtml+=`<button type="button" class="target-btn player-effect-resolve" id="resolvePlayerAction" ${ready?"":"disabled"}>Resolve action</button></div></div></details>`;
  const battlefieldRulesHtml=buildBattlefieldRulesPanel();
  panel.innerHTML=`<div class="context-form commander-form"><div class="context-section"><div class="commander-player-actions"><div class="inline-stepper"><label>Creatures you played</label><button type="button" data-key="creaturesPlayed" data-delta="-1">−</button><input type="number" min="0" value="${draft.creaturesPlayed}" data-key="creaturesPlayed"><button type="button" data-key="creaturesPlayed" data-delta="1">+</button></div></div></div>${battlefieldRulesHtml}${actionHtml}</div>`;
  const actionDisclosure=panel.querySelector(".player-action-disclosure");
  if(actionDisclosure)actionDisclosure.ontoggle=()=>{draft.actionOpen=actionDisclosure.open;};
  wireBattlefieldRulesPanel(panel);
  wireSteppers(panel);
  const updateAction=(field,value,resetTarget=false)=>{
    draft.creaturesPlayed=parseInt(panel.querySelector('input[data-key="creaturesPlayed"]')?.value)||0;
    draft[field]=value;
    if(field==="action"){draft.count=1;draft.all=false;}
    draft.choices={};if(resetTarget)draft.targetId=null;renderCommanderMainPhasePanel();
  };
  const scopeSelect=panel.querySelector('#playerActionScope');
  if(scopeSelect)scopeSelect.onchange=event=>updateAction("scope",event.target.value,true);
  panel.querySelector('#playerActionType').onchange=event=>updateAction("action",event.target.value);
  const countInput=panel.querySelector('#playerActionCount');
  if(countInput){
    countInput.onchange=()=>updateAction("count",Math.max(1,parseInt(countInput.value)||1));
    panel.querySelector('#playerActionCountDown').onclick=()=>{countInput.value=Math.max(1,(parseInt(countInput.value)||1)-1);updateAction("count",parseInt(countInput.value));};
    panel.querySelector('#playerActionCountUp').onclick=()=>{countInput.value=(parseInt(countInput.value)||1)+1;updateAction("count",parseInt(countInput.value));};
  }
  const allInput=panel.querySelector('#playerActionAll');
  if(allInput)allInput.onchange=()=>updateAction("all",allInput.checked);
  const cardType=panel.querySelector('#playerActionCardType');
  if(cardType)cardType.onchange=event=>updateAction("cardType",event.target.value);
  panel.querySelectorAll('[data-action-target-id]').forEach(button=>{button.onclick=()=>{draft.targetId=button.dataset.actionTargetId;draft.choices={};renderCommanderMainPhasePanel();};});
  panel.querySelectorAll('[data-reanimate-owner]').forEach(button=>{button.onclick=()=>{
    const owner=button.dataset.reanimateOwner,cardId=button.dataset.reanimateCard;
    const selected=draft.choices[owner]||[];
    draft.choices[owner]=selected.includes(cardId)?selected.filter(id=>id!==cardId):[...selected,cardId];
    renderCommanderMainPhasePanel();
  };});
  panel.querySelector('#resolvePlayerAction').onclick=async()=>{
    if(!canResolvePlayerEffect(effect,draft))return;
    const resolved=await confirmAndResolvePlayerEffect(effect,draft);
    if(resolved)renderCommanderMainPhasePanel();
  };
}

/* --- MAIN PHASE 1 (Develop) --- */
function showMainStep(){
  setPlayerStepHeader("Main Phase","Play lands, cast creatures, and resolve player-targeting effects.","Your Actions");
  commanderEffectDraft=null;
  renderCommanderMainPhasePanel();
  const panel=document.getElementById('respGrid');
  setConfirmButton("Go to Combat ▸","",()=>{
    cmdSnapshot();
    const played=inputValue(panel,'input[data-key="creaturesPlayed"]');
    if(played>0){gameState.player.creatures+=played;logCommander(`You play ${plural(played,"creature")}.`);}
    showCommanderGame();
    playerStep="combat";showPlayerStep();
  },true,()=>creaturesPlayedPreview(panel));
}

/* --- COMBAT — single unified screen showing all opponents --- */
function startCombatStep(){
  setPlayerStepHeader("Combat","Declare attackers, then enter the damage dealt and creatures removed.","Combat Results");

  const alive=aliveOpponents(gameState);
  const panel=document.getElementById('respGrid');

  // Build a unified combat form: damage per opponent + all creatures grouped by owner
  let html='<div class="context-form commander-form">';

  // Damage section per opponent
  alive.forEach(opp=>{
    html+=`<div class="context-section combat-opp-section" style="border-left:3px solid ${oppColor(opp)}">
      <div class="context-section-title">${opp.ico} ${opp.name.split(',')[0]} — ${opp.life} life</div>
      <div class="commander-player-actions">
        <div class="inline-stepper"><label>Damage dealt</label>
          <button type="button" data-opp="${opp.id}" data-key="damage" data-delta="-1">−</button>
          <input type="number" min="0" value="0" data-opp="${opp.id}" data-key="damage">
          <button type="button" data-opp="${opp.id}" data-key="damage" data-delta="1">+</button>
        </div>
        <div class="inline-stepper"><label>Commander damage dealt</label>
          <button type="button" data-opp="${opp.id}" data-key="cmdrDmg" data-delta="-1">−</button>
          <input type="number" min="0" value="0" data-opp="${opp.id}" data-key="cmdrDmg">
          <button type="button" data-opp="${opp.id}" data-key="cmdrDmg" data-delta="1">+</button>
        </div>
      </div>
    </div>`;
  });

  // Your losses (only if you have creatures to lose)
  if(gameState.player.creatures>0)html+=`<div class="context-section"><div class="context-section-title">Your losses</div>
    <div class="commander-player-actions">
      <div class="inline-stepper"><label>Your creatures that died</label>
        <button type="button" data-key="playerDeaths" data-delta="-1">−</button>
        <input type="number" min="0" max="${gameState.player.creatures}" value="0" data-key="playerDeaths">
        <button type="button" data-key="playerDeaths" data-delta="1">+</button>
      </div>
    </div></div>`;

  // Creatures killed — grouped by owner
  const anyCreatures=alive.some(o=>o.tokens.length>0);
  if(anyCreatures){
    html+=`<div class="context-section"><div class="context-section-title">Remove creatures (tap to select)</div>`;
    alive.forEach(opp=>{
      if(opp.tokens.length===0)return;
      const tappedCount=opp.tokens.filter(t=>t.attacking).length;
      html+=`<div class="kill-owner-group"><div class="kill-owner-label" style="border-left-color:${oppColor(opp)}">${opp.ico} ${opp.name.split(',')[0]}${tappedCount?` · ${tappedCount} tapped`:''}</div>
        <div class="kill-select">${opp.tokens.map((t,i)=>`<button type="button" class="kill-btn card-choice${t.attacking?' is-tapped':''}" data-opp="${opp.id}" data-idx="${i}" aria-label="Select ${t.name}"><span class="kill-btn-status">${t.attacking?'⚔':'⬡'}</span>${cardReferenceHtml(t)}</button>`).join('')}</div>
      </div>`;
    });
    html+=`</div>`;
  }

  html+='<div id="combatPlayerAction"></div></div>';
  panel.innerHTML=html;

  wireSteppers(panel);

  // Wire creature kill toggles — keyed by opp id + index
  const killMap={};  // {oppId: Set of indices}
  panel.querySelectorAll('.kill-btn').forEach(btn=>{
    btn.onclick=()=>{
      const oppId=btn.dataset.opp;
      const idx=parseInt(btn.dataset.idx);
      if(!killMap[oppId])killMap[oppId]=new Set();
      if(killMap[oppId].has(idx)){killMap[oppId].delete(idx);btn.classList.remove('selected');}
      else{killMap[oppId].add(idx);btn.classList.add('selected');}
    };
  });
  panel._killMap=killMap;
  renderCombatPlayerAction(panel);

  setConfirmButton("Finish Combat ▸","",()=>resolveFullCombat(panel,alive),true,()=>{
    const dealt=alive.reduce((sum,opp)=>sum+inputValue(panel,`input[data-opp="${opp.id}"][data-key="damage"]`),0);
    const removed=killCount(panel);
    const lost=inputValue(panel,'input[data-key="playerDeaths"]');
    return joinPreview([dealt>0&&`Deal ${dealt}`,removed>0&&`Remove ${removed}`,lost>0&&`Lose ${lost} creature${lost===1?"":"s"}`]);
  });
}

function resolveFullCombat(panel,alive){
  cmdSnapshot();
  const playerDeaths=parseInt(panel.querySelector('input[data-key="playerDeaths"]')?.value)||0;
  const killMap=panel._killMap||{};

  // Apply damage and kills per opponent
  alive.forEach(opp=>{
    const damage=parseInt(panel.querySelector(`input[data-opp="${opp.id}"][data-key="damage"]`)?.value)||0;
    const cmdrDmg=parseInt(panel.querySelector(`input[data-opp="${opp.id}"][data-key="cmdrDmg"]`)?.value)||0;

    if(damage>0){
      opp.life=Math.max(0,opp.life-damage);
      opp.damageLog["player"]=(opp.damageLog["player"]||0)+damage;
      opp.lastAttacker="player";
      logCommander(`You deal ${damage} to ${opp.name.split(',')[0]}. (Life → ${opp.life})`);
    }
    if(cmdrDmg>0){
      const applied=Math.min(cmdrDmg,damage||cmdrDmg);
      opp.commanderDamageReceived["player"]=(opp.commanderDamageReceived["player"]||0)+applied;
      gameState.player.commanderDamageDealt[opp.id]=(gameState.player.commanderDamageDealt[opp.id]||0)+applied;
      logCommander(`${applied} commander damage to ${opp.name.split(',')[0]} (${opp.commanderDamageReceived["player"]}/21).`);
    }

    // Remove killed creatures for this opponent
    const kills=killMap[opp.id];
    if(kills&&kills.size>0){
      const indices=Array.from(kills).sort((a,b)=>b-a);
      indices.forEach(idx=>{
        if(idx<opp.tokens.length){
          const moved=removeOpponentPermanent(opp,`token:${idx}`,"graveyard");
          if(moved)logCommander(`You destroy ${movementCardText(moved)} from ${opp.name.split(',')[0]}. Types: ${discardedTypeSummary([moved])}.`);
        }
      });
    }

    // Check elimination
    if(isOpponentDead(opp)&&!opp._eliminated){
      opp._eliminated=true;
      logCommander(`${opp.ico} ${opp.name.split(',')[0]} has been eliminated!`);
    }
  });

  // Your losses
  if(playerDeaths>0){
    gameState.player.creatures=Math.max(0,gameState.player.creatures-playerDeaths);
    logCommander(`${playerDeaths} of your creatures died in combat.`);
  }

  showCommanderGame();
  const end=checkCommanderBattleEnd(gameState);
  if(end.over){endCommanderGame(end.won,end.reason);return;}

  playerStep="end";showPlayerStep();
}

/* --- POST-COMBAT MAIN PHASE / END STEP --- */
function finishPlayerTurn(){
  setPlayerStepHeader("Main Phase 2","Cast spells, resolve player actions, then complete your end step.","Your Actions");

  // This phase has its own action draft, separate from actions and creatures tracked before combat.
  commanderEffectDraft=null;
  renderCommanderMainPhasePanel();

  const panel=document.getElementById('respGrid');
  setConfirmButton("End Turn ▸","",()=>{
    cmdSnapshot();
    const played=inputValue(panel,'input[data-key="creaturesPlayed"]');
    if(played>0){gameState.player.creatures+=played;logCommander(`You play ${plural(played,"creature")} after combat.`);}
    endPlayerTurn();
  },false,()=>creaturesPlayedPreview(panel));
}

/* --- Shared stepper wiring --- */
function wireSteppers(panel){
  panel.querySelectorAll('[data-delta]').forEach(btn=>{
    btn.onclick=()=>{const inp=btn.parentElement.querySelector('input');const mx=inp.max?parseInt(inp.max):999;inp.value=Math.max(0,Math.min(mx,(parseInt(inp.value)||0)+parseInt(btn.dataset.delta)));};
  });
}

function endCommanderGame(won,reason){
  gameState.gameOver=true;saveState();
  const modal=document.getElementById('modal'),overlay=document.getElementById('overlay');
  if(won){modal.className="modal";modal.innerHTML=`<div class="big-ico">🏆</div><h2>Victory!</h2><p>${reason}<br>Survived <b>${gameState.turn}</b> turns.</p><button class="cta" id="cmdRestartBtn">Choose Another Mode</button>`;}
  else{modal.className="modal lose";modal.innerHTML=`<div class="big-ico">💀</div><h2>Eliminated</h2><p>${reason}<br>Lasted <b>${gameState.turn}</b> turns.</p><button class="cta" id="cmdRestartBtn">Try Again</button>`;}
  overlay.classList.add("show");
  document.getElementById('cmdRestartBtn').onclick=restart;
}

function startCommanderBattle(numOpponents){
  console.log("[MNG] startCommanderBattle called with", numOpponents, "opponents");
  gameState=createCommanderBattle(numOpponents);
  console.log("[MNG] gameState created:", gameState ? "ok" : "FAILED");
  cmdUndoStack=[];
  document.getElementById('overlay').classList.remove("show");
  markRecapStart();
  saveState();showCommanderGame();runCpuPhase();
}

function startAdventure(mode){
  gameState=null;cleanupCommanderUI();
  if(window._adventureEngine)window._adventureEngine.start(mode);
}

function restart(){
  safeRemove(SAVE_KEY);safeRemove("magic_no_gathering_save_v1");safeRemove("garruk_slayer_save_v4");
  gameState=null;collectInputsFn=null;
  document.getElementById('overlay').classList.remove("show");
  document.getElementById('inputOverlay').classList.remove("show");
  document.getElementById('logOverlay').classList.remove("show");
  cleanupCommanderUI();showSetup();
}

function showSetup(){renderSetupScreen(startAdventure,startCommanderBattle);}

/* ---------- boot ---------- */
function boot(){
  console.log("[MNG boot] Starting boot sequence...");
  const raw=safeGet(SAVE_KEY);
  if(raw){
    try{
      const parsed=JSON.parse(raw);
      console.log("[MNG boot] Found commander save (v2), _type:", parsed._type);
      if(parsed._type==="commander"&&!parsed.gameOver){
        gameState=parsed;
        document.getElementById('overlay').classList.remove("show");
        showCommanderGame();
        if(gameState.phase==="player")startPlayerPhase();else runCpuPhase();
        return;
      }
    }catch(e){ console.log("[MNG boot] Commander save parse error:", e); }
  }
  // Check for adventure save (uses the v1 key from state.js)
  if(window._adventureEngine){
    const adventureSave=load();
    console.log("[MNG boot] Adventure save check:", adventureSave ? "found (mode: "+adventureSave.mode+")" : "none");
    if(adventureSave&&adventureSave.player&&adventureSave.player.life>0&&(adventureSave.mode==="horde"?(adventureSave.loyalty>0||adventureSave.tokens.length>0):adventureSave.loyalty>0)){
      console.log("[MNG boot] Resuming adventure save");
      window._adventureEngine.resume(adventureSave);
      return;
    }
  }
  console.log("[MNG boot] No valid save found — showing setup screen");
  showSetup();
}

// Adjust player stats from the HUD +/- buttons when in commander mode
function adjustPlayerStat(stat, d) {
  if(!gameState)return;
  if(stat==="life") gameState.player.life=Math.max(0,gameState.player.life+d);
  else if(stat==="creatures") gameState.player.creatures=Math.max(0,gameState.player.creatures+d);
  // Update the HUD display
  document.getElementById('pLife').textContent=gameState.player.life;
  document.getElementById('pCreatures').textContent=gameState.player.creatures;
  document.getElementById('lifeStat').classList.toggle('warn',gameState.player.life<=10);
  renderLifeHud(gameState);
}

// Expose for game.js integration
window._commanderMain={restart,showSetup,boot,adjust:adjustPlayerStat};
// Expose functions needed by ai-commander.js (global scope)
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

// Turn Recap setting (commander mode only). Re-renders the draw step if you're on it.
const recapToggle=document.getElementById('recapToggle');
if(recapToggle)recapToggle.onchange=()=>{
  setRecapEnabled(recapToggle.checked);
  if(gameState&&gameState.phase==="player"&&playerStep==="draw")showDrawStep();
};
updateRecapToggle();

// Boot is now called externally by bootGame() in the HTML after all scripts load

})();
