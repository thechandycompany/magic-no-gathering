/* ===== THEME SYSTEM ===== */
var THEME_KEY="mng_theme";
var THEMES=[
  {id:"classic",name:"Classic"},
  {id:"light",name:"Light"},
  {id:"dark",name:"Dark"},
  {id:"purple",name:"Dark Purple"}
];
// Themes that were renamed/replaced keep working for anyone with an old saved choice
var THEME_MIGRATIONS={fantasy:"purple",poker:"dark"};
function normalizeTheme(theme){
  theme=THEME_MIGRATIONS[theme]||theme;
  return THEMES.some(t=>t.id===theme)?theme:"classic";
}
function currentTheme(){return normalizeTheme(document.documentElement.getAttribute('data-theme'));}
function applyTheme(theme){
  theme=normalizeTheme(theme);
  document.documentElement.setAttribute('data-theme',theme);
  safeSet(THEME_KEY,theme);
  // Every picker on the page (setup screen + settings) reflects the same choice
  document.querySelectorAll('.theme-btn').forEach(btn=>{
    const on=btn.dataset.theme===theme;
    btn.classList.toggle('active',on);
    btn.setAttribute('aria-pressed',on?"true":"false");
  });
  if(typeof window.onThemeChange==="function")window.onThemeChange();
}
/* Shared theme picker markup — used by the setup screen and the settings dialog */
function themePickerButtonsHtml(){
  const current=currentTheme();
  return THEMES.map(t=>`<button type="button" class="theme-btn${t.id===current?" active":""}" data-theme="${t.id}" aria-pressed="${t.id===current}"><span class="theme-swatch theme-swatch-${t.id}"></span>${t.name}</button>`).join("");
}

/* ===== UI SCALE =====
   The layout is designed at ~1280×800. On bigger screens everything (fonts, cards,
   spacing) scales up together via CSS zoom; height caps it so short-but-wide windows
   don't overflow. Below the design size the responsive breakpoints take over (scale 1). */
var UI_DESIGN_WIDTH=1280, UI_DESIGN_HEIGHT=800, UI_MAX_SCALE=1.75;
function applyUiScale(){
  var scale=Math.min(window.innerWidth/UI_DESIGN_WIDTH, window.innerHeight/UI_DESIGN_HEIGHT);
  scale=Math.max(1,Math.min(UI_MAX_SCALE,scale));
  document.documentElement.style.setProperty('--ui-scale',scale.toFixed(3));
}
applyUiScale();
window.addEventListener('resize',applyUiScale);
function loadSavedTheme(){
  applyTheme(safeGet(THEME_KEY)||"classic");
}
function wireThemePicker(){
  document.querySelectorAll('.theme-btn').forEach(btn=>{btn.onclick=()=>applyTheme(btn.dataset.theme);});
}

/* ===== SETTINGS DIALOG ===== */
var settingsReturnFocus=null;
function openSettings(){
  document.getElementById('settingsThemeBtns').innerHTML=themePickerButtonsHtml();
  wireThemePicker();
  settingsReturnFocus=document.getElementById('menuBtn');
  document.getElementById('settingsOverlay').classList.add('show');
  setTimeout(()=>document.getElementById('settingsClose').focus(),40);
}
function closeSettings(){
  const overlay=document.getElementById('settingsOverlay');
  if(!overlay.classList.contains('show'))return;
  overlay.classList.remove('show');
  if(settingsReturnFocus&&typeof settingsReturnFocus.focus==="function")settingsReturnFocus.focus();
  settingsReturnFocus=null;
}
loadSavedTheme();

function showSetup(){
  // If the commander module is loaded, it provides the split menu
  if(window._commanderMain){
    window._commanderMain.showSetup();
    return;
  }
  // Fallback: original setup (should not normally be reached)
  const m=document.getElementById('modal'),o=document.getElementById('overlay');
  m.className="modal setup-modal";
  m.innerHTML=`
    <div class="big-ico">🎴</div><h2>Choose an encounter</h2>
    <p>Five solo modes. You start at 40 life.</p>
    <div class="mode-grid" role="radiogroup" aria-label="Encounter mode">
      <label class="mode-option"><input type="radio" name="encounterMode" value="vanilla" checked><div class="mode-card"><div class="mode-title">🐺 Easy Garruk</div><div class="mode-desc">Steady Wolves and cautious removal.</div><span class="mode-tag">Baseline</span></div></label>
      <label class="mode-option"><input type="radio" name="encounterMode" value="hard"><div class="mode-card"><div class="mode-title">🔥 Hard Garruk</div><div class="mode-desc">Scaling Wolves and aggressive removal.</div><span class="mode-tag">Escalating</span></div></label>
      <label class="mode-option"><input type="radio" name="encounterMode" value="horde"><div class="mode-card"><div class="mode-title">🧟 Horde Mode</div><div class="mode-desc">Survive growing waves and empty the deck.</div><span class="mode-tag">Survival</span></div></label>
      <label class="mode-option"><input type="radio" name="encounterMode" value="conclave"><div class="mode-card"><div class="mode-title">✦ Aether Conclave</div><div class="mode-desc">Break a randomized network of synergies.</div><span class="mode-tag">Puzzle</span></div></label>
      <label class="mode-option"><input type="radio" name="encounterMode" value="voltron"><div class="mode-card commander-mode"><div class="mode-title">🪓 Commander Rival: Gruul Voltron</div><div class="mode-desc">Stop a ramping commander before 21 commander damage gets through.</div><span class="mode-tag">Commander</span></div></label>
    </div>
    <button class="cta" onclick="beginGame()">Begin Encounter</button>`;
  o.classList.add("show");
}
function beginGame(){
  const chosen=document.querySelector('input[name="encounterMode"]:checked');
  const mode=chosen?chosen.value:"vanilla";
  S=freshState(mode);turnInput=null;gameOver=false;undoStack=[];updateUndoBtn();
  document.getElementById('overlay').classList.remove("show");
  logBig(`${modeConfig().name} begins. ${enemyName()} enters with ${S.loyalty} ${modeConfig().resource.toLowerCase()}.`);
  logSys(`${modeConfig().summary} Starting life: ${S.player.life}.`);
  startGarrukTurn();
}
async function confirmRestart(){const ok=await askConfirm("Restart encounter?","This clears the current encounter and returns to mode selection. This cannot be undone.","Restart");if(ok)restart();}
function restart(){safeRemove(SAVE_KEY);safeRemove(LEGACY_SAVE_KEY);S=null;turnInput=null;undoStack=[];gameOver=false;document.getElementById('overlay').classList.remove("show");document.getElementById('inputOverlay').classList.remove("show");document.getElementById('logOverlay').classList.remove("show");showSetup();}
function manualAddEnemy(){
  if(!S||gameOver)return;
  snapshot();
  let added=true;
  if(S.mode==="horde")addHordeUnit();
  else if(S.mode==="conclave")nextConclaveUnit();
  else if(S.mode==="voltron")added=addVoltronSupport();
  else addWolf();
  if(!added){undoStack.pop();updateUndoBtn();toast("No drawn ramp source is available");return;}
  logSys(`Creature added manually to ${enemyName()}'s battlefield.`);render();
  if(turnInput){
    const timing=S.phase==="player"?currentTimingInfo():null;
    turnInput.allowEnemyDeaths=S.tokens.length>0&&(S.phase==="garruk"||timing.canCastInstant);
    syncIncomingDamageToAttack();
    renderContextualInputs();
  }
}

/* ---------- wire ---------- */
function wire(){
  document.querySelectorAll('.adj button').forEach(b=>{
    b.onclick=()=>b.dataset.stat==="commanderLife"?adjustCommanderLife(parseInt(b.dataset.d,10)):adjust(b.dataset.stat, parseInt(b.dataset.d,10));
  });
  document.getElementById('addWolfBtn').onclick=manualAddEnemy;
  document.getElementById('endTurnBtn').onclick=resolveTurn;
  document.getElementById('quickEndBtn').onclick=endPlayerTurnNow;
  document.getElementById('undoBtn').onclick=undo;
  // Settings dialog (commander-ui.js re-binds resetBtn for commander mode)
  document.getElementById('menuBtn').onclick=openSettings;
  document.getElementById('settingsClose').onclick=closeSettings;
  document.getElementById('settingsOverlay').onclick=event=>{if(event.target.id==='settingsOverlay')closeSettings();};
  document.getElementById('resetBtn').onclick=()=>{closeSettings();confirmRestart();};
  document.getElementById('rulesBtn').onclick=showModeRules;
  document.getElementById('graveyardBtn').onclick=showEnemyGraveyard;
  document.getElementById('exileBtn').onclick=showEnemyExile;
  document.getElementById('portrait').onclick=showModeRules;
  document.getElementById('portrait').onkeydown=event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();showModeRules();}};
  document.getElementById('infoClose').onclick=closeInfoModal;
  document.getElementById('infoOverlay').onclick=event=>{if(event.target.id==='infoOverlay')closeInfoModal();};
  document.getElementById('logBtn').onclick=()=>{closeSettings();openLog();};
  document.getElementById('logClose').onclick=closeLog;
  document.getElementById('logOverlay').onclick=event=>{if(event.target.id==='logOverlay')closeLog();};
  document.addEventListener('keydown',event=>{
    const infoOverlay=document.getElementById('infoOverlay');
    const logOverlay=document.getElementById('logOverlay');
    const settingsOverlay=document.getElementById('settingsOverlay');
    if(event.key==="Tab"){
      if(infoOverlay.classList.contains('show'))trapDialogFocus(event,infoOverlay);
      else if(logOverlay.classList.contains('show'))trapDialogFocus(event,logOverlay);
      else if(settingsOverlay.classList.contains('show'))trapDialogFocus(event,settingsOverlay);
      return;
    }
    if(event.key!=="Escape")return;
    if(document.getElementById('inputOverlay').classList.contains('show'))document.getElementById('inputCancel').click();
    else if(infoOverlay.classList.contains('show'))closeInfoModal();
    else if(logOverlay.classList.contains('show'))closeLog();
    else if(settingsOverlay.classList.contains('show'))closeSettings();
  });
}

/* ---------- adventure engine interface (for commander module integration) ---------- */
window._adventureEngine = {
  start: function(mode) {
    S=freshState(mode);turnInput=null;gameOver=false;undoStack=[];updateUndoBtn();
    document.getElementById('overlay').classList.remove("show");
    logBig(`${modeConfig().name} begins. ${enemyName()} enters with ${S.loyalty} ${modeConfig().resource.toLowerCase()}.`);
    logSys(`${modeConfig().summary} Starting life: ${S.player.life}.`);
    startGarrukTurn();
  },
  resume: function(savedState) {
    S=normalizeState(savedState);gameOver=false;undoStack=[];
    turnInput=restoreTurnInput(S.pendingTurnInput);S.pendingTurnInput=null;
    render();renderLog();
    if(S.phase==="player")showPlayerTurn();
    else if(S.pendingDecl)showGarrukTurn();
    else startGarrukTurn();
    updateUndoBtn();logSys(`${modeConfig().name} resumed from save.`);
  },
  isActive: function() { return S !== null && S.turn > 0 && !gameOver; }
};

/* ---------- boot ---------- */
function bootGame(){
  console.log("[BOOT] bootGame called. _commanderMain:", !!window._commanderMain);
  wire();
  // Let the commander module handle boot — it checks for commander saves,
  // resumes adventure saves via _adventureEngine, or shows the setup screen.
  if(window._commanderMain){
    window._commanderMain.boot();
    return;
  }
  // Fallback if commander module didn't load
  var saved=load();
  var commanderDamageDefeat=saved&&saved.mode==="voltron"&&saved.commanderDamage>=21;
  var resumable=!commanderDamageDefeat&&saved&&saved.player&&saved.player.life>0&&(saved.mode==="horde"?(saved.loyalty>0||saved.tokens.length>0):saved.loyalty>0);
  if(commanderDamageDefeat){
    S=normalizeState(saved);gameOver=false;undoStack=[];render();renderLog();
    endGame(false,`${enemyName()} dealt 21 commander damage.`);
  }else if(resumable){
    S=normalizeState(saved);gameOver=false;undoStack=[];
    turnInput=restoreTurnInput(S.pendingTurnInput);S.pendingTurnInput=null;
    render();renderLog();
    if(S.phase==="player")showPlayerTurn();
    else if(S.pendingDecl)showGarrukTurn();
    else startGarrukTurn();
    updateUndoBtn();logSys(`${modeConfig().name} resumed from save.`);
  }else{
    showSetup();
  }
}
