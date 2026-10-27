/* ===== THEME SYSTEM ===== */
var THEME_KEY="ratt_theme";
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
  // Commander mode fills in the read-only opponents/difficulty summary
  if(typeof window.renderOpponentSettingsSummary==="function")window.renderOpponentSettingsSummary();
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
      <label class="mode-option"><input type="radio" name="encounterMode" value="voltron"><div class="mode-card commander-mode"><div class="mode-title">🪓 ${modeDisplayName(MODES.voltron)}</div><div class="mode-desc">Stop a ramping commander before 21 commander damage gets through.</div><span class="mode-tag">Commander</span></div></label>
    </div>
    <button class="cta" onclick="beginGame()">Begin Encounter</button>`;
  o.classList.add("show");
}
function beginGame(){
  const chosen=document.querySelector('input[name="encounterMode"]:checked');
  const mode=chosen?chosen.value:"vanilla";
  S=freshState(mode);turnInput=null;gameOver=false;undoStack=[];updateUndoBtn();
  document.getElementById('overlay').classList.remove("show");
  logBig(`${modeDisplayName()} begins. ${enemyName()} enters with ${S.loyalty} ${modeConfig().resource.toLowerCase()}.`);
  logSys(`${modeConfig().summary} Starting life: ${S.player.life}.`);
  startEnemyTurn();
}
async function confirmRestart(){const ok=await askConfirm("Restart encounter?","This clears the current encounter and returns to mode selection. This cannot be undone.","Restart");if(ok)restart();}
function restart(){safeRemove(SAVE_KEY);S=null;turnInput=null;undoStack=[];gameOver=false;document.getElementById('overlay').classList.remove("show");document.getElementById('inputOverlay').classList.remove("show");document.getElementById('logOverlay').classList.remove("show");showSetup();}
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
    turnInput.allowEnemyDeaths=S.tokens.length>0&&(S.phase==="enemy"||timing.canCastInstant);
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
  document.getElementById('resetBtn').onclick=()=>{closeSettings();confirmRestart();};
  document.getElementById('rulesBtn').onclick=showModeRules;
  document.getElementById('graveyardBtn').onclick=showEnemyGraveyard;
  document.getElementById('exileBtn').onclick=showEnemyExile;
  document.getElementById('portrait').onclick=showModeRules;
  document.getElementById('portrait').onkeydown=event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();showModeRules();}};
  document.getElementById('infoClose').onclick=closeInfoModal;
  document.getElementById('logBtn').onclick=()=>{closeSettings();openLog();};
  document.getElementById('exportBackupBtn').onclick=exportBackup;
  const backupFile=document.getElementById('importBackupFile');
  document.getElementById('importBackupBtn').onclick=()=>{backupFile.value="";backupFile.click();};
  backupFile.onchange=()=>{closeSettings();readBackupFile(backupFile.files&&backupFile.files[0]);};
  document.getElementById('logClose').onclick=closeLog;
  // Click/tap on the dimmed backdrop closes the popup. The press must also START on the
  // backdrop, so dragging a text selection out of a dialog doesn't close it.
  let backdropPress=null;
  document.addEventListener('pointerdown',event=>{backdropPress=event.target.classList&&event.target.classList.contains('overlay')?event.target:null;});
  document.addEventListener('click',event=>{
    const target=event.target;
    if(target.classList&&target.classList.contains('overlay')&&target.classList.contains('show')&&target===backdropPress&&target===topOverlay())dismissOverlay(target);
    backdropPress=null;
  });
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
    dismissOverlay(topOverlay());
  });
}

/* ---------- adventure engine interface (for commander module integration) ---------- */
window._adventureEngine = {
  start: function(mode) {
    S=freshState(mode);turnInput=null;gameOver=false;undoStack=[];updateUndoBtn();
    document.getElementById('overlay').classList.remove("show");
    logBig(`${modeDisplayName()} begins. ${enemyName()} enters with ${S.loyalty} ${modeConfig().resource.toLowerCase()}.`);
    logSys(`${modeConfig().summary} Starting life: ${S.player.life}.`);
    startEnemyTurn();
  },
  resume: function(savedState) {
    S=normalizeState(savedState);gameOver=false;undoStack=[];
    turnInput=restoreTurnInput(S.pendingTurnInput);S.pendingTurnInput=null;
    render();renderLog();
    if(S.phase==="player")showPlayerTurn();
    else if(S.pendingDecl)showEnemyTurn();
    else startEnemyTurn();
    updateUndoBtn();logSys(`${modeDisplayName()} resumed from save.`);
  },
  isActive: function() { return S !== null && S.turn > 0 && !gameOver; }
};

/* ---------- boot ---------- */
/* Writes GAME_TITLE (js/data/modes.js) into the window title and header. */
function applyGameTitle(){
  document.title=`${GAME_TITLE}${GAME_STAGE?` (${GAME_STAGE})`:""} — ${GAME_TAGLINE}`;
  const h=document.getElementById('brandTitle');if(h)h.innerHTML=gameTitleHtml();
  const sub=document.getElementById('brandSub');if(sub)sub.textContent=GAME_TAGLINE;
  applyAboutInfo();
}

/* ===== ABOUT: fan-content notice + optional links (constants in js/data/modes.js) ===== */
function externalUrl(url){return typeof url==="string"&&/^https:\/\//.test(url)?url:"";}
function escapeText(v){return String(v).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));}
/* Title plus the release-stage badge (GAME_STAGE), used by the header and the title screen. */
function gameTitleHtml(){return `${escapeText(GAME_TITLE)}${GAME_STAGE?` <span class="stage-badge">${escapeText(GAME_STAGE)}</span>`:""}`;}
/* One quiet line of project links, shared by the title screen and Settings → About. */
function projectLinksHtml(){
  const mail=typeof FEEDBACK_EMAIL==="string"&&/^[^@\s]+@[^@\s]+$/.test(FEEDBACK_EMAIL)?`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(`${GAME_TITLE} ${GAME_STAGE} feedback`.replace(/\s+/g," ").trim())}`:"";
  const links=[[mail,"Feedback",`Email ${FEEDBACK_EMAIL}`],[externalUrl(SOURCE_URL),"Source code","View the source on GitHub"],[externalUrl(DONATION_URL),"Tip on Ko-fi","Optional — tips unlock nothing"]]
    .filter(([href])=>href).map(([href,label,title])=>`<a href="${escapeText(href)}" title="${escapeText(title)}"${href.startsWith("mailto:")?"":' target="_blank" rel="noopener noreferrer"'}>${label}</a>`);
  return links.join('<span aria-hidden="true">·</span>');
}
function applyAboutInfo(){
  const notice=document.getElementById('fanNotice');
  if(notice)notice.textContent=FAN_CONTENT_NOTICE;
  const title=document.getElementById('aboutTitle');
  if(title)title.textContent=`${GAME_TITLE} — a free fan project`;
  const links=document.getElementById('projectLinks');
  if(links){links.innerHTML=projectLinksHtml();links.hidden=!links.innerHTML;}
}

/* ===== BACKUP: export / import every ratt_* key (saves + settings) =====
   The web version keeps everything in this browser's localStorage, so clearing
   site data erases it. A backup file is the only way to move or restore a game. */
var BACKUP_APP_ID="magic-no-gathering";
var BACKUP_LEGACY_APP_IDS=["rivals-at-the-table"]; // backups exported under the earlier working title
var BACKUP_KEY_PREFIX="ratt_";
function exportBackup(){
  const data={};
  try{
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(key&&key.indexOf(BACKUP_KEY_PREFIX)===0)data[key]=localStorage.getItem(key);
    }
  }catch(e){toast("Backups need browser storage, which is unavailable here");return;}
  if(!Object.keys(data).length){toast("Nothing to back up yet");return;}
  const payload={app:BACKUP_APP_ID,format:1,exportedAt:new Date().toISOString(),data};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const link=document.createElement('a');
  link.href=URL.createObjectURL(blob);
  link.download=`${BACKUP_APP_ID}-backup-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  toast("Backup downloaded");
}
function readBackupFile(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=async()=>{
    let payload=null;
    try{payload=JSON.parse(reader.result);}catch(e){}
    const data=payload&&(payload.app===BACKUP_APP_ID||BACKUP_LEGACY_APP_IDS.indexOf(payload.app)>=0)&&payload.data&&typeof payload.data==="object"?payload.data:null;
    // Only this game's keys, only string values
    const entries=data?Object.entries(data).filter(([key,value])=>key.indexOf(BACKUP_KEY_PREFIX)===0&&typeof value==="string"):[];
    if(!entries.length){toast("That file is not a valid backup");return;}
    const when=payload.exportedAt?new Date(payload.exportedAt).toLocaleString():"an unknown date";
    const ok=await askConfirm("Restore backup?",`This replaces the saved game and settings on this device with the backup from <strong>${escapeHtmlText(when)}</strong>.`,"Restore","Cancel");
    if(!ok)return;
    try{
      Object.keys(localStorage).filter(key=>key.indexOf(BACKUP_KEY_PREFIX)===0).forEach(key=>localStorage.removeItem(key));
      entries.forEach(([key,value])=>localStorage.setItem(key,value));
    }catch(e){toast("Could not write to browser storage");return;}
    location.reload();
  };
  reader.readAsText(file);
}
function escapeHtmlText(text){return String(text).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function bootGame(){
  applyGameTitle();
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
    else if(S.pendingDecl)showEnemyTurn();
    else startEnemyTurn();
    updateUndoBtn();logSys(`${modeDisplayName()} resumed from save.`);
  }else{
    showSetup();
  }
}
