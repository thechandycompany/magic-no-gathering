/* =====================================================================
   COMMANDER BATTLE — Bundled as a single non-module script so the game
   can still be opened via file:// (double-clicking the HTML).
   ===================================================================== */
(function() {
"use strict";

/* =====================================================================
   UTILS
   ===================================================================== */
function fisherYatesShuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ===== THEME SYSTEM ===== */
const THEME_KEY="mng_theme";
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme',theme);
  try{localStorage.setItem(THEME_KEY,theme);}catch(e){}
}
function loadSavedTheme(){
  try{const t=localStorage.getItem(THEME_KEY);if(t)applyTheme(t);}catch(e){}
}
function wireThemePicker(){
  const current=(document.documentElement.getAttribute('data-theme'))||"classic";
  const btns=document.querySelectorAll('.theme-btn');
  btns.forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.theme===current);
    btn.onclick=()=>{
      applyTheme(btn.dataset.theme);
      btns.forEach(b=>b.classList.toggle('active',b.dataset.theme===btn.dataset.theme));
    };
  });
}
loadSavedTheme();

/* =====================================================================
   DATA — only what commander battle needs (modes list for the setup menu)
   ===================================================================== */
const MODES = {
  vanilla:{ id:"vanilla", name:"Easy Garruk", icon:"🐺", category:"adventure",
    summary:"The baseline hunt: 2/2 Wolves, steady +2 loyalty, and cautious removal after Garruk builds a pack." },
  hard:{ id:"hard", name:"Hard Garruk", icon:"😤", category:"adventure",
    summary:"Escalating hunt: Wolves become 4/4 on turn 5, loyalty income grows every two turns, and emergency removal punishes board deficits." },
  horde:{ id:"horde", name:"Horde Mode", icon:"🧟", category:"adventure",
    summary:"Survive automatic waves. Reveals and damage mill the Horde deck; win only when its deck and battlefield are empty." },
  conclave:{ id:"conclave", name:"Aether Conclave", icon:"🔮", category:"adventure",
    summary:"A replayable roster of uniquely named creatures shares auras, unlocks thresholds, restricts spells, and empowers its leader." },
  voltron:{ id:"voltron", name:"Gruul Voltron", icon:"🪓", category:"commander",
    summary:"A Commander-style rival ramps, casts Rukha from the command zone, suits her up, and threatens a 21 commander-damage defeat." }
};

const VOLTRON_CARDS = {
  creatures: [
    {name:"Llanowar Emissary",ico:"🌱",p:1,t:1,cost:1,kind:"dork",effect:"Taps for mana.",rampValue:1},
    {name:"Fyndhorn Scout",ico:"🌿",p:1,t:1,cost:1,kind:"dork",effect:"Taps for mana.",rampValue:1},
    {name:"Arbor Channeler",ico:"🌳",p:0,t:3,cost:2,kind:"dork",effect:"Taps for mana.",rampValue:1},
    {name:"Bloodfern Cultivator",ico:"🌺",p:1,t:3,cost:2,kind:"dork",effect:"Taps for mana.",rampValue:1},
    {name:"Sylvan Reclaimer",ico:"🍃",p:1,t:2,cost:2,kind:"utility",effect:"Enters: search a land."},
    {name:"Ironwood Shaman",ico:"🔨",p:1,t:3,cost:3,kind:"utility",effect:"Enters: tutor equipment."},
    {name:"Rootcoil Serpent",ico:"🐍",p:1,t:4,cost:3,kind:"utility",effect:"Hexproof.",kws:["Hexproof"]},
    {name:"Stampede Elder",ico:"🦬",p:2,t:3,cost:4,kind:"utility",effect:"Others get +1/+0."},
    {name:"Trailguide Ranger",ico:"🏹",p:2,t:1,cost:2,kind:"utility",effect:"Haste.",kws:["Haste"],haste:true},
    {name:"Wildspark Elemental",ico:"⚡",p:2,t:1,cost:2,kind:"utility",effect:"Haste.",kws:["Haste"],haste:true},
    {name:"Territorial Gorger",ico:"🐗",p:2,t:2,cost:3,kind:"utility",effect:"",kws:[]},
    {name:"Thornhide Brute",ico:"🦏",p:2,t:3,cost:3,kind:"utility",effect:"",kws:[]},
    {name:"Primal Hydra",ico:"🐉",p:2,t:2,cost:4,kind:"utility",effect:"Grows +1/+1 each upkeep.",kws:[]},
    {name:"Grove Guardian",ico:"🌲",p:1,t:5,cost:4,kind:"utility",effect:"Reach.",kws:["Reach"]}
  ],
  gear: [
    {name:"Bonesaw Cleaver",cost:2,equip:1,bonus:2,effect:"+2/+2",kw:null},
    {name:"Wildwood Mantle",cost:2,equip:2,bonus:2,effect:"+2/+2, trample",kw:"Trample"},
    {name:"Stonefist Gauntlet",cost:2,equip:1,bonus:2,effect:"+2/+1, first strike",kw:"First Strike"},
    {name:"Ironbark Shield",cost:3,equip:2,bonus:2,effect:"+1/+3, ward 2",kw:"Ward 2"},
    {name:"Fang of the Wilds",cost:3,equip:2,bonus:2,effect:"+2/+2",kw:null},
    {name:"Savagecrown Helm",cost:3,equip:3,bonus:3,effect:"+3/+3, trample",kw:"Trample"},
    {name:"Primal Aegis",cost:4,equip:3,bonus:2,effect:"+2/+2, hexproof",kw:"Hexproof"},
    {name:"Bloodforged Plate",cost:4,equip:2,bonus:3,effect:"+3/+3",kw:null},
    {name:"Runic Greatsword",cost:5,equip:3,bonus:3,effect:"+3/+2, trample",kw:"Trample"},
    {name:"Vanguard's Armor",cost:3,equip:2,bonus:2,effect:"+2/+2, indestructible",kw:"Indestructible"},
    {name:"Heartwood Cloak",cost:2,equip:2,bonus:2,effect:"+2/+2, hexproof",kw:"Hexproof"},
    {name:"Wraithbane Edge",cost:4,equip:3,bonus:2,effect:"+2/+1, deathtouch",kw:"Deathtouch"}
  ],
  protection: [
    {name:"Blossoming Defense",cost:1,effect:"Hexproof + pump."},
    {name:"Vines of Vastwood",cost:1,effect:"Shroud; kicked: +4/+4."},
    {name:"Heroic Intervention",cost:2,effect:"Hexproof + indestructible."},
    {name:"Tamiyo's Safekeeping",cost:1,effect:"Hexproof + indestructible."},
    {name:"Wild Ricochet",cost:4,effect:"Copy + redirect."},
    {name:"Beast Within",cost:3,effect:"Destroy permanent; 3/3 Beast."},
    {name:"Ram Through",cost:2,effect:"Fight spell."},
    {name:"Chaos Warp",cost:3,effect:"Tuck + reveal."},
    {name:"Return to Nature",cost:2,effect:"Destroy artifact/enchantment."},
    {name:"Bolt Bend",cost:4,effect:"Redirect spell."}
  ],
  draw: [
    {name:"Hunter's Insight",cost:3,effect:"Draw = combat damage."},
    {name:"Rishkar's Expertise",cost:6,effect:"Draw = greatest power + free cast."},
    {name:"Return of the Wildspeaker",cost:5,effect:"Draw or +3/+3."},
    {name:"Harmonize",cost:4,effect:"Draw three."},
    {name:"Greater Good",cost:4,effect:"Sac: draw = power, discard 3."}
  ],
  haymakers: [
    {name:"Overwhelming Stampede",cost:5,effect:"+X/+X and trample."},
    {name:"Blasphemous Act",cost:9,effect:"13 to all creatures.",scaleCost:true},
    {name:"Chain Reaction",cost:4,effect:"X to all creatures."},
    {name:"Chandra's Ignition",cost:5,effect:"Power to all others."}
  ],
  utility: [
    {name:"Eternal Witness",cost:3,effect:"Regrowth on a body.",isCreature:true,p:2,t:1},
    {name:"Regrowth",cost:2,effect:"Return from graveyard."},
    {name:"Reckless Impulse",cost:2,effect:"Exile top 2; play this turn."},
    {name:"Outpost Siege",cost:4,effect:"Exile top; play each upkeep."},
    {name:"Lifecrafter's Bestiary",cost:3,effect:"Scry 1; draw on creature cast."},
    {name:"Skullclamp",cost:1,effect:"+1/-1; draw 2 on death."}
  ]
};
const DECK_COMPOSITION = {creatures:14, gear:12, protection:10, draw:5, haymakers:4, utility:6};

const CPU_NAMES = [
  { name:"Rukha, Wildheart Vanguard", ico:"🪓", color:"#c0392b" },
  { name:"Kolvarn, Stonefist Chieftain", ico:"🪨", color:"#8e44ad" },
  { name:"Thyra, Ember Sovereign", ico:"🔥", color:"#d35400" },
  { name:"Grendol, Tuskbreaker", ico:"🐗", color:"#27ae60" },
];

const COMMANDER_BASE = { p:4, t:4, kws:["Trample"], cost:5 };
const MAX_CPU_HAND_SIZE = 7;

const STRATEGIES = {
  LAST_HITTER:"lastHitter", MOST_DAMAGE:"mostDamage", GRUDGE:"grudge",
  THREAT:"threat", VULNERABLE:"vulnerable", GANG_UP:"gangUp"
};
const STRATEGY_LABELS = {
  [STRATEGIES.LAST_HITTER]:"Who hit me last",
  [STRATEGIES.MOST_DAMAGE]:"Who hit me the most",
  [STRATEGIES.GRUDGE]:"Personal grudge",
  [STRATEGIES.THREAT]:"Biggest threat",
  [STRATEGIES.VULNERABLE]:"Most vulnerable",
  [STRATEGIES.GANG_UP]:"Gang up on weakest"
};

/* =====================================================================
   COMMANDER OPPONENT — AI factory
   ===================================================================== */
function generateOtherDeck() {
  const cards = [];
  for (const [cat, count] of Object.entries(DECK_COMPOSITION)) {
    const pool = VOLTRON_CARDS[cat];
    for (let i = 0; i < count; i++) cards.push({category:cat, index:i%pool.length});
  }
  return fisherYatesShuffle(cards);
}
function resolveCard(ref) { return VOLTRON_CARDS[ref.category][ref.index]; }

function drawCard(deck, hand) {
  const total = deck.lands+deck.ramp+deck.explosive+deck.other;
  if (total <= 0) return "none";
  let roll = Math.floor(Math.random()*total);
  for (const key of ["lands","ramp","explosive","other"]) {
    if (roll < deck[key]) { deck[key]--; hand[key]++; return key; }
    roll -= deck[key];
  }
  return "none";
}

function createOpponent(index) {
  const id = CPU_NAMES[index] || CPU_NAMES[0];
  const deck = {lands:37,ramp:10,explosive:1,other:51};
  const otherDeck = generateOtherDeck();
  const hand = {lands:0,ramp:0,explosive:0,other:0};
  for (let i=0;i<7;i++) drawCard(deck,hand);
  let mulligans=0;
  while(hand.lands<2&&mulligans<2){mulligans++;Object.keys(hand).forEach(k=>{hand[k]=0;});for(let i=0;i<7;i++)drawCard(deck,hand);}
  for(let i=0;i<mulligans;i++){const cat=["other","ramp","explosive","lands"].find(k=>hand[k]>0);if(cat)hand[cat]--;}

  return {
    id:`cpu_${index}`, index, name:id.name, ico:id.ico, color:id.color, archetype:"voltron",
    life:40, commanderDamageReceived:{}, commanderDamageDealt:{},
    commanderZone:true, commanderTax:0,
    deck, otherDeck, hand, typedHand:[], landsInPlay:0, rampInPlay:0, explosiveInPlay:0, gear:0, attachedGear:[], graveyardCount:0, graveyard:[], nextGraveyardCardId:0, discardHistory:[], exileCount:0,
    tokens:[], damageLog:{}, lastAttacker:null, grudge:null,
    currentStrategy:STRATEGIES.THREAT, actionSteps:[], attackTarget:null, attackPower:0,
  };
}

function manaAvailable(opp) { return opp.landsInPlay+opp.rampInPlay+(opp.explosiveInPlay*2); }
function opponentHandSize(opp){return Object.values(opp.hand||{}).reduce((total,count)=>total+(count||0),0);}
function opponentDeckSize(opp){return Object.values(opp.deck||{}).reduce((total,count)=>total+(count||0),0);}
function commanderCost(opp) { return COMMANDER_BASE.cost+(opp.commanderTax||0); }
function commanderOnField(opp) { return opp.tokens.find(t=>t.kind==="commander")||null; }
function isOpponentDead(opp) {
  if(opp.life<=0)return true;
  for(const[,dmg]of Object.entries(opp.commanderDamageReceived)){if(dmg>=21)return true;}
  return false;
}

function deployCommander(opp) {
  const cost=commanderCost(opp), mana=manaAvailable(opp);
  if(mana<cost||commanderOnField(opp))return false;
  opp.commanderZone=false;
  opp.tokens.push({name:opp.name,ico:opp.ico,kind:"commander",type:"Legendary Creature",
    p:COMMANDER_BASE.p,t:COMMANDER_BASE.t,baseP:COMMANDER_BASE.p,baseT:COMMANDER_BASE.t,
    kws:[...COMMANDER_BASE.kws],effect:"Commander",summoningSick:true,owner:opp.id});
  return true;
}
function refreshCommanderGear(opp){
  const commander=commanderOnField(opp);
  opp.attachedGear=opp.attachedGear||[];
  opp.gear=opp.attachedGear.length;
  if(!commander)return;
  const bonus=opp.attachedGear.reduce((total,gear)=>total+(gear.bonus||0),0);
  commander.baseP=COMMANDER_BASE.p+bonus;
  commander.baseT=COMMANDER_BASE.t+bonus;
  commander.p=commander.baseP;commander.t=commander.baseT;
  commander.kws=[...new Set([...COMMANDER_BASE.kws,...opp.attachedGear.map(gear=>gear.kw).filter(Boolean)])];
  commander.effect=opp.gear?`Commander — ${opp.gear} gear.`:"Commander";
}
function returnCommanderToZone(opp){opp.tokens=opp.tokens.filter(t=>t.kind!=="commander");opp.commanderZone=true;opp.commanderTax+=2;opp.gear=0;opp.attachedGear=[];}

/* ---------- targeting ---------- */
function threatScore(p){
  const c=p.creatures!=null?p.creatures:(p.tokens?p.tokens.length:0);
  const cmd=p.tokens?p.tokens.some(t=>t.kind==="commander"):false;
  // Player always has high baseline threat — in real Commander, the human is
  // the most dangerous because they're unpredictable and may be sandbagging.
  // This ensures CPUs attack the player regularly, not just each other.
  const humanBonus=p.id==="player"?20:0;
  return c*3+(cmd?15:0)+(40-p.life)+humanBonus;
}

function evaluateStrategy(opp, alive) {
  const nearDeath=alive.find(p=>p.life<=10);
  if(nearDeath)return STRATEGIES.GANG_UP;
  if(opp.lastAttacker&&(opp.damageLog[opp.lastAttacker]||0)>=10)return STRATEGIES.LAST_HITTER;
  if(opp.grudge&&alive.find(p=>p.id===opp.grudge))return Math.random()<0.3?STRATEGIES.GRUDGE:STRATEGIES.THREAT;
  if(opp.life<=20)return STRATEGIES.VULNERABLE;
  return STRATEGIES.THREAT;
}

function chooseTarget(opp, allPlayers) {
  const alive=allPlayers.filter(p=>p.id!==opp.id&&p.life>0&&!(p.commanderDamageReceived&&Object.values(p.commanderDamageReceived).some(d=>d>=21)));
  if(alive.length===0)return null;
  if(alive.length===1)return alive[0].id;
  const strategy=evaluateStrategy(opp,alive);
  opp.currentStrategy=strategy;

  let chosen=null;
  switch(strategy){
    case STRATEGIES.LAST_HITTER:if(opp.lastAttacker&&alive.find(p=>p.id===opp.lastAttacker))chosen=opp.lastAttacker;break;
    case STRATEGIES.MOST_DAMAGE:{const s=[...alive].sort((a,b)=>(opp.damageLog[b.id]||0)-(opp.damageLog[a.id]||0));if((opp.damageLog[s[0].id]||0)>0)chosen=s[0].id;break;}
    case STRATEGIES.GRUDGE:if(opp.grudge&&alive.find(p=>p.id===opp.grudge))chosen=opp.grudge;break;
    case STRATEGIES.VULNERABLE:{chosen=[...alive].sort((a,b)=>a.life-b.life)[0].id;break;}
    case STRATEGIES.GANG_UP:{const bl=[...alive].sort((a,b)=>a.life-b.life);if(bl[0].life<=15)chosen=bl[0].id;break;}
  }
  if(chosen)return chosen;

  // Default: threat-weighted random — higher threat = more likely to be targeted,
  // but not guaranteed. This spreads damage naturally across the table.
  const scored=[...alive].map(p=>({id:p.id,score:threatScore(p)}));
  const totalScore=scored.reduce((s,p)=>s+p.score,0);
  if(totalScore<=0)return alive[Math.floor(Math.random()*alive.length)].id;
  let roll=Math.random()*totalScore;
  for(const p of scored){roll-=p.score;if(roll<=0)return p.id;}
  return scored[scored.length-1].id;
}

/* ---------- turn execution ---------- */
function executeOpponentTurn(opp, allPlayers) {
  const actions=[];
  let commander=commanderOnField(opp);

  // Draw. A CPU that cannot complete its required draw loses the game.
  if(opponentDeckSize(opp)===0){
    opp.life=0;
    actions.push({label:"Decked out",detail:"Cannot draw from an empty deck. Life → 0.",deckOut:true});
    opp.actionSteps=actions;
    return {target:null,attackPower:0,commanderAttacking:false,actions};
  }
  const drawn=drawCard(opp.deck,opp.hand);
  if(drawn==="other"&&opp.otherDeck.length>0){const ref=opp.otherDeck.pop();opp.typedHand.push({...resolveCard(ref),ref});}
  if(drawn!=="none")actions.push({label:"Draw",detail:"Draws a card."});

  // Land drop
  if(opp.hand.lands>0){opp.hand.lands--;opp.landsInPlay++;actions.push({label:"Land drop",detail:`${opp.landsInPlay} lands in play.`});}

  let mana=manaAvailable(opp);

  // Primary action
  if(!commander){
    const cost=commanderCost(opp);
    if(mana>=cost&&deployCommander(opp)){mana-=cost;actions.push({label:`Cast ${opp.name}`,detail:"Commander enters."});commander=commanderOnField(opp);}
    else if(opp.hand.explosive>0&&mana>=1){opp.hand.explosive--;opp.explosiveInPlay++;mana--;actions.push({label:"Fast mana",detail:"+2 mana next turn."});}
    else if(opp.hand.ramp>0&&mana>=2){opp.hand.ramp--;opp.rampInPlay++;mana-=2;actions.push({label:"Ramp",detail:"+1 mana next turn."});}
  } else {
    const gearInHand=opp.typedHand.filter(c=>c.ref?.category==="gear");
    const best=gearInHand.filter(c=>(c.cost+(c.equip||0))<=mana).sort((a,b)=>(b.bonus/(b.cost+(b.equip||0)))-(a.bonus/(a.cost+(a.equip||0))))[0];
    if(best){
      mana-=best.cost+(best.equip||0);
      opp.attachedGear=(opp.attachedGear||[]).concat({name:best.name,bonus:best.bonus||0,kw:best.kw||null});
      refreshCommanderGear(opp);
      opp.typedHand=opp.typedHand.filter(c=>c!==best);opp.hand.other=Math.max(0,opp.hand.other-1);
      actions.push({label:`Equip ${best.name}`,detail:`${best.effect}. Now ${commander.p}/${commander.t}.`});
    }
  }

  // Secondary: cast creatures with remaining mana (multiple if possible)
  let castCount=0;
  while(mana>=1&&castCount<3){
    const castable=opp.typedHand.filter(c=>(c.ref?.category==="creatures"||c.rampValue)&&c.cost<=mana).sort((a,b)=>b.cost-a.cost);
    const toCast=castable[0];
    if(!toCast)break;
    mana-=toCast.cost;
    const p=toCast.p||1,t=toCast.t||1;
    opp.tokens.push({name:toCast.name,ico:toCast.ico||"🐾",kind:toCast.rampValue?"voltron-support":"voltron-creature",
      type:"Creature",p,t,baseP:p,baseT:t,kws:toCast.kws?[...toCast.kws]:[],effect:toCast.effect||"",summoningSick:!toCast.haste,owner:opp.id});
    if(toCast.rampValue)opp.rampInPlay+=toCast.rampValue;
    opp.typedHand=opp.typedHand.filter(c=>c!==toCast);opp.hand.other=Math.max(0,opp.hand.other-1);
    actions.push({label:`Cast ${toCast.name}`,detail:`${p}/${t} enters.`});
    castCount++;
  }
  // Fallback: spend remaining ramp hand slots as generic creatures if hand has them
  if(castCount===0&&mana>=2&&opp.hand.ramp>0&&!commander){
    opp.hand.ramp--;opp.rampInPlay++;
    opp.tokens.push({name:"Wilds Guide",ico:"🌿",kind:"voltron-support",type:"Creature — Shaman",p:2,t:2,baseP:2,baseT:2,kws:[],effect:"Taps for mana.",summoningSick:true,owner:opp.id});
    mana-=2;
    actions.push({label:"Cast Wilds Guide",detail:"2/2 ramp creature enters."});
  }

  // Choose target & declare attackers
  const target=chooseTarget(opp,allPlayers);
  opp.attackTarget=target;
  let attackPower=0; let commanderAttacking=false;
  opp.tokens.forEach(t=>{
    t.attacking=false;
    if(t.summoningSick)return;
    if(t.kind==="commander"){t.attacking=true;commanderAttacking=true;attackPower+=t.p;return;}
    if(t.kind==="voltron-support"&&t.effect&&t.effect.includes("mana"))return;
    if(t.p>=2){t.attacking=true;attackPower+=t.p;}
  });
  opp.attackPower=attackPower;

  if(attackPower>0&&target){
    const tn=allPlayers.find(p=>p.id===target);
    actions.push({label:`Attack ${tn?tn.name.split(',')[0]:"?"} for ${attackPower}`,detail:`${opp.tokens.filter(t=>t.attacking).length} attacker(s). Strategy: ${STRATEGY_LABELS[opp.currentStrategy]}.`});
  }

  // End step: CPU cannot retain more than seven cards. It keeps the most useful cards.
  const excessCards=Math.max(0,opponentHandSize(opp)-MAX_CPU_HAND_SIZE);
  if(excessCards>0){
    const discarded=discardFromOpponent(opp,excessCards);
    const details=discarded.map(discardedCardText).join(", ");
    const typeSummary=discardedTypeSummary(discarded);
    actions.push({label:"Discard to hand size",detail:`Discards ${details}. Types: ${typeSummary}. Keeps ${opponentHandSize(opp)} card${opponentHandSize(opp)===1?"":"s"}.`,discarded});
  }

  opp.tokens.forEach(t=>{t.summoningSick=false;});
  opp.actionSteps=actions;
  return {target,attackPower,commanderAttacking,actions};
}

/* =====================================================================
   COMMANDER BATTLE — Game state & orchestration
   ===================================================================== */
function createCommanderBattle(numOpponents) {
  const opponents=[];
  for(let i=0;i<Math.min(4,Math.max(1,numOpponents));i++) opponents.push(createOpponent(i));
  return {
    gameMode:"commanderBattle", turn:1, phase:"cpu", cpuTurnIndex:0,
    opponents, player:{id:"player",name:"You",life:40,creatures:0,handSize:7,librarySize:92,graveyardCount:0,graveyard:[],nextGraveyardCardId:0,discardHistory:[],exileCount:0,commanderDamageReceived:{},commanderDamageDealt:{},tokens:[]},
    discardHistory:[], log:[], viewMode:"single", viewTarget:0, gameOver:false, winner:null,
  };
}

function playerAsTarget(state){return {id:"player",name:"You",life:state.player.life,creatures:state.player.creatures,tokens:state.player.tokens||[]};}
function allPlayersForTargeting(state){const all=[playerAsTarget(state)];state.opponents.forEach(o=>{if(!isOpponentDead(o))all.push(o);});return all;}
function aliveOpponents(state){return state.opponents.filter(o=>!isOpponentDead(o));}
function isPlayerDead(state){
  if(state.player.life<=0)return true;
  for(const[,dmg]of Object.entries(state.player.commanderDamageReceived)){if(dmg>=21)return true;}
  return false;
}

function executeCpuTurnCycle(state) {
  const results=[], allPlayers=allPlayersForTargeting(state);
  for(const opp of state.opponents){
    if(isOpponentDead(opp))continue;
    const result=executeOpponentTurn(opp,allPlayers);
    results.push({opponent:opp,...result});
    if(result.attackPower>0&&result.target){
      const cmdDmg=result.commanderAttacking?(opp.tokens.find(t=>t.kind==="commander")?.p||0):0;
      if(result.target==="player"){
        opp._pendingPlayerAttack={totalPower:result.attackPower,commanderDamage:cmdDmg,
          attackers:opp.tokens.filter(t=>t.attacking).map(t=>({name:t.name,ico:t.ico,p:t.p,t:t.t,kind:t.kind}))};
      } else {
        const tgt=state.opponents.find(p=>p.id===result.target);
        if(tgt&&!isOpponentDead(tgt)){
          tgt.life=Math.max(0,tgt.life-result.attackPower);
          tgt.damageLog[opp.id]=(tgt.damageLog[opp.id]||0)+result.attackPower;
          tgt.lastAttacker=opp.id;
          if(cmdDmg>0)tgt.commanderDamageReceived[opp.id]=(tgt.commanderDamageReceived[opp.id]||0)+cmdDmg;
          if(result.attackPower>=5&&tgt.tokens.length>0&&Math.random()<0.4){
            const vi=Math.floor(Math.random()*tgt.tokens.length);
            const moved=removeOpponentPermanent(tgt,`token:${vi}`,"graveyard");
            if(moved)logCommander(`${opp.name.split(',')[0]}'s attack destroys ${movementCardText(moved)} from ${tgt.name.split(',')[0]}. Types: ${discardedTypeSummary([moved])}.`);
          }
        }
      }
    }
  }
  return results;
}

function getPendingPlayerAttacks(state){
  const pending=[];
  for(const opp of state.opponents){if(opp._pendingPlayerAttack)pending.push({opponent:opp,attack:opp._pendingPlayerAttack});}
  return pending;
}

function checkCommanderBattleEnd(state){
  if(isPlayerDead(state))return {over:true,won:false,reason:"You were eliminated."};
  if(aliveOpponents(state).length===0)return {over:true,won:true,reason:"All opponents eliminated!"};
  return {over:false};
}

/* =====================================================================
   PLAYER ACTIONS — direct instantiation against Commander Battle state
   ===================================================================== */
const PLAYER_ACTION_SCOPES=[
  {value:"target",label:"Target player"},
  {value:"each",label:"Each player"},
  {value:"eachOpponent",label:"Each opponent"}
];
const PLAYER_ACTIONS=[
  {value:"discard",label:"Discard cards"},
  {value:"mill",label:"Mill cards"},
  {value:"destroy",label:"Destroy permanents"},
  {value:"sacrifice",label:"Sacrifice permanents"},
  {value:"exile",label:"Exile permanents"},
  {value:"reanimate",label:"Reanimate creature"},
  {value:"draw",label:"Draw cards"},
  {value:"loseLife",label:"Lose life"},
  {value:"gainLife",label:"Gain life"}
];
const PLAYER_ACTION_CARD_TYPES=["creature","artifact","land","permanent"];
let commanderEffectDraft=null;

function ensureCommanderEffectState(state){
  if(!state||!state.player)return;
  const player=state.player;
  if(player.handSize==null)player.handSize=7;
  if(player.librarySize==null)player.librarySize=92;
  if(player.graveyardCount==null)player.graveyardCount=0;
  player.graveyard=player.graveyard||[];
  player.nextGraveyardCardId=player.nextGraveyardCardId||player.graveyard.length;
  player.discardHistory=player.discardHistory||[];
  if(player.exileCount==null)player.exileCount=0;
  state.discardHistory=state.discardHistory||[];
  (state.opponents||[]).forEach(opp=>{
    opp.typedHand=opp.typedHand||[];
    opp.graveyardCount=opp.graveyardCount||0;
    opp.graveyard=opp.graveyard||[];
    opp.nextGraveyardCardId=opp.nextGraveyardCardId||opp.graveyard.length;
    opp.discardHistory=opp.discardHistory||[];
    opp.exileCount=opp.exileCount||0;
    opp.attachedGear=opp.attachedGear||[];
    if(opp.attachedGear.length===0&&opp.gear>0){
      opp.attachedGear=Array.from({length:opp.gear},(_,index)=>({name:`Equipment ${index+1}`,bonus:0,kw:null}));
    }
    opp.gear=opp.attachedGear.length;
  });
}

function createPlayerEffect(draft){
  return {
    scope:draft.scope,
    action:draft.action,
    count:Math.max(1,parseInt(draft.count)||1),
    cardType:(draft.action==="destroy"||draft.action==="sacrifice"||draft.action==="exile")?draft.cardType:draft.action==="reanimate"?"creature":null
  };
}

function effectTargets(state,effect,targetId){
  const all=[state.player,...aliveOpponents(state)];
  if(effect.scope==="each")return all;
  if(effect.scope==="eachOpponent")return aliveOpponents(state);
  return all.filter(player=>player.id===targetId);
}
function effectTargetName(target){return target.id==="player"?"You":target.name.split(",")[0];}
function drawForOpponent(opp){
  const drawn=drawCard(opp.deck,opp.hand);
  if(drawn==="other"&&opp.otherDeck.length>0){const ref=opp.otherDeck.pop();opp.typedHand.push({...resolveCard(ref),ref});}
  return drawn;
}
function typedCardTypes(card){
  const category=card.ref?.category;
  if(category==="creatures"||card.isCreature||card.rampValue)return ["Creature"];
  if(category==="gear")return ["Artifact","Equipment"];
  if(category==="protection")return ["Instant"];
  if(category==="utility")return ["Enchantment"];
  return ["Sorcery"];
}
function virtualGraveyardCard(category){
  const cards={
    lands:{name:"Basic Land",ico:"🌲",types:["Land"]},
    ramp:{name:"Ramp spell",ico:"🌱",types:["Sorcery"]},
    explosive:{name:"Fast mana",ico:"⚙",types:["Artifact"]},
    other:{name:"Unknown spell",ico:"🃏",types:["Sorcery"]}
  };
  return {...(cards[category]||cards.other),virtual:true};
}
function typedGraveyardCard(card){
  return {name:card.name,ico:card.ico||"🃏",types:typedCardTypes(card),p:card.p,t:card.t,kws:card.kws?[...card.kws]:[],effect:card.effect||"",ref:card.ref||null,virtual:false};
}
function battlefieldGraveyardCard(token){
  return {name:token.name,ico:token.ico||"🐾",types:(token.type||"Creature").includes("Creature")?["Creature"]:[token.type||"Permanent"],p:token.p,t:token.t,kws:token.kws?[...token.kws]:[],effect:token.effect||"",virtual:false,isToken:!!token.isToken};
}
function addOpponentGraveyardCard(opp,card){
  if(card.isToken)return null;
  opp.graveyard=opp.graveyard||[];
  opp.nextGraveyardCardId=(opp.nextGraveyardCardId||0)+1;
  const entry={id:`${opp.id}:gy:${opp.nextGraveyardCardId}`,ownerId:opp.id,...card};
  opp.graveyard.push(entry);opp.graveyardCount++;
  return entry;
}
function addPlayerGraveyardCard(player,card){
  if(card.isToken)return null;
  player.graveyard=player.graveyard||[];
  player.nextGraveyardCardId=(player.nextGraveyardCardId||0)+1;
  const entry={id:`${player.id}:gy:${player.nextGraveyardCardId}`,ownerId:player.id,...card};
  player.graveyard.push(entry);player.graveyardCount++;
  return entry;
}
function cardTypeText(card){return card.types&&card.types.length?card.types.join(" · "):"Unknown";}
function discardedCardText(card){return `${card.ico||"🃏"} ${card.name} (${cardTypeText(card)})`;}
function discardedTypeSummary(cards){
  const counts={};
  cards.forEach(card=>(card.types||["Unknown"]).forEach(type=>{counts[type]=(counts[type]||0)+1;}));
  return Object.entries(counts).map(([type,count])=>`${type} ${count}`).join(" · ");
}
function movementCardText(card){return `${discardedCardText(card)} → ${card.destination||"graveyard"}`;}
function recordDiscardedCards(owner,cards){
  const entries=cards.filter(Boolean);
  if(entries.length===0)return entries;
  const turn=typeof gameState!=="undefined"&&gameState?gameState.turn:null;
  const records=entries.map(card=>({id:card.id,name:card.name,ico:card.ico||"🃏",types:[...(card.types||["Unknown"])],ownerId:owner.id,turn}));
  owner.discardHistory=(owner.discardHistory||[]).concat(records).slice(-100);
  if(typeof gameState!=="undefined"&&gameState)gameState.discardHistory=(gameState.discardHistory||[]).concat(records).slice(-250);
  return entries;
}
function unmaterializedGraveyardCount(owner){return Math.max(0,(owner.graveyardCount||0)-(owner.graveyard||[]).length);}
function graveyardCreatureCards(player){return (player.graveyard||[]).filter(card=>!card.isToken&&card.types?.includes("Creature"));}
function reanimateGraveyardCard(owner,cardId){
  const index=(owner.graveyard||[]).findIndex(card=>card.id===cardId&&card.types?.includes("Creature")&&!card.isToken);
  if(index<0)return null;
  const [card]=owner.graveyard.splice(index,1);
  owner.graveyardCount=Math.max(0,(owner.graveyardCount||0)-1);
  const player=gameState.player;
  player.tokens=player.tokens||[];
  player.tokens.push({name:card.name,ico:card.ico||"🐾",kind:"reanimated-creature",type:"Creature",p:card.p||1,t:card.t||1,baseP:card.p||1,baseT:card.t||1,kws:card.kws?[...card.kws]:[],effect:card.effect||`Reanimated from ${effectTargetName(owner)}'s graveyard.`,summoningSick:true,owner:card.ownerId||owner.id,controller:"player",isToken:false});
  player.creatures++;
  return card;
}
function cpuDiscardPriority(opp,option){
  if(option.kind==="hand"){
    if(option.category==="lands")return opp.landsInPlay<3?80:10;
    if(option.category==="ramp")return commanderOnField(opp)?35:75;
    return 55; // Explosive mana stays useful but is less critical than development.
  }
  const card=option.card,category=card.ref?.category;
  if(category==="gear")return commanderOnField(opp)?85:15;
  if(category==="protection")return 80;
  if(category==="creatures")return (card.p||1)+(card.t||1)+(card.rampValue?30:0);
  if(category==="draw")return 45;
  if(category==="haymakers")return 60;
  return card.rampValue?70:30;
}
function discardFromOpponent(opp,count){
  const discarded=[];
  for(let i=0;i<count;i++){
    const options=[];
    ["lands","ramp","explosive"].forEach(category=>{for(let index=0;index<opp.hand[category];index++)options.push({kind:"hand",category});});
    const genericOtherCards=Math.max(0,opp.hand.other-opp.typedHand.length);
    for(let index=0;index<genericOtherCards;index++)options.push({kind:"hand",category:"other"});
    opp.typedHand.forEach((card,index)=>options.push({kind:"typed",index,card}));
    if(options.length===0)break;
    const choice=options.sort((left,right)=>cpuDiscardPriority(opp,left)-cpuDiscardPriority(opp,right))[0];
    if(choice.kind==="hand"){
      opp.hand[choice.category]--;
      const entry=addOpponentGraveyardCard(opp,virtualGraveyardCard(choice.category));if(entry)discarded.push(entry);
    }else{
      const [card]=opp.typedHand.splice(choice.index,1);opp.hand.other=Math.max(0,opp.hand.other-1);
      const entry=addOpponentGraveyardCard(opp,typedGraveyardCard(card));if(entry)discarded.push(entry);
    }
  }
  return recordDiscardedCards(opp,discarded);
}
function millOpponent(opp,count){
  const milled=[];
  for(let i=0;i<count;i++){
    const entries=Object.entries(opp.deck).filter(([,remaining])=>remaining>0);
    const total=entries.reduce((sum,[,remaining])=>sum+remaining,0);
    if(total===0)break;
    let roll=Math.floor(Math.random()*total),category=entries[0][0];
    for(const [name,remaining] of entries){roll-=remaining;if(roll<0){category=name;break;}}
    opp.deck[category]--;
    let card=virtualGraveyardCard(category);
    if(category==="other"&&opp.otherDeck.length>0){const ref=opp.otherDeck.pop();card=typedGraveyardCard({...resolveCard(ref),ref});}
    const entry=addOpponentGraveyardCard(opp,card);if(entry)milled.push(entry);
  }
  return milled;
}
function opponentPermanentOptions(opp,type){
  const options=[];
  const includes=kind=>type==="permanent"||type===kind;
  if(includes("creature"))opp.tokens.forEach((token,index)=>options.push({key:`token:${index}`,label:`${token.ico} ${token.name}`,type:"creature"}));
  if(includes("artifact")){
    (opp.attachedGear||[]).forEach((gear,index)=>options.push({key:`gear:${index}`,label:`⚙ ${gear.name}`,type:"artifact"}));
    for(let index=0;index<opp.explosiveInPlay;index++)options.push({key:`fastMana:${index}`,label:"⚙ Fast mana",type:"artifact"});
  }
  if(includes("land"))for(let index=0;index<opp.landsInPlay;index++)options.push({key:`land:${index}`,label:"🌲 Land",type:"land"});
  return options;
}
function cpuPermanentPriority(opp,option){
  const [kind,indexText]=option.key.split(":"),index=parseInt(indexText);
  if(kind==="token"){
    const token=opp.tokens[index];
    if(!token)return Infinity;
    if(token.kind==="commander")return 10000;
    return (token.p||0)+(token.t||0)+(token.kind==="voltron-support"&&token.effect?.includes("mana")?30:0);
  }
  if(kind==="gear"){
    const gear=opp.attachedGear[index];
    return (gear?.bonus||0)+(gear?.kw?8:0)+20;
  }
  if(kind==="fastMana")return 40;
  if(kind==="land")return opp.landsInPlay<=3?70:5;
  return Infinity;
}
function chooseCpuPermanents(opp,type,count){
  return opponentPermanentOptions(opp,type)
    .sort((left,right)=>cpuPermanentPriority(opp,left)-cpuPermanentPriority(opp,right))
    .slice(0,count)
    .map(option=>option.key);
}
function recordOpponentPermanentZone(opp,destination,card){
  if(destination==="exile"){
    opp.exileCount=(opp.exileCount||0)+1;
    return {...card,destination:"exile"};
  }
  const entry=card&&addOpponentGraveyardCard(opp,card);
  return entry?{...entry,destination:"graveyard"}:null;
}
function removeOpponentPermanent(opp,key,destination="graveyard"){
  const [kind,indexText]=key.split(":"),index=parseInt(indexText);
  if(kind==="token"&&opp.tokens[index]){
    const [token]=opp.tokens.splice(index,1);
    if(token.kind==="commander"){
      returnCommanderToZone(opp);
      return {name:token.name,ico:token.ico||opp.ico,types:["Legendary","Creature"],destination:"command zone"};
    }
    if(token.kind==="voltron-support"&&token.effect?.includes("mana"))opp.rampInPlay=Math.max(0,opp.rampInPlay-1);
    return recordOpponentPermanentZone(opp,destination,battlefieldGraveyardCard(token));
  }
  if(kind==="gear"&&opp.attachedGear[index]){
    const [gear]=opp.attachedGear.splice(index,1);refreshCommanderGear(opp);
    return recordOpponentPermanentZone(opp,destination,{name:gear.name,ico:"⚙",types:["Artifact","Equipment"],effect:gear.kw||""});
  }
  if(kind==="fastMana"&&opp.explosiveInPlay>0){opp.explosiveInPlay--;return recordOpponentPermanentZone(opp,destination,virtualGraveyardCard("explosive"));}
  if(kind==="land"&&opp.landsInPlay>0){opp.landsInPlay--;return recordOpponentPermanentZone(opp,destination,virtualGraveyardCard("lands"));}
  return null;
}
function canResolvePlayerEffect(effect,draft){
  if(effect.scope==="target"&&!draft.targetId)return false;
  if(effect.action!=="reanimate")return true;
  return effectTargets(gameState,effect,draft.targetId).every(owner=>{
    const cards=graveyardCreatureCards(owner);
    const selected=draft.choices[owner.id]||[];
    return cards.length===0||selected.length>=Math.min(effect.count,cards.length);
  });
}
function resolvePlayerEffect(effect,draft){
  const targets=effectTargets(gameState,effect,draft.targetId);
  if(targets.length===0)return;
  cmdSnapshot();
  targets.forEach(target=>{
    const name=effectTargetName(target);
    if(effect.action==="reanimate"){
      const cardIds=(draft.choices[target.id]||[]).slice(0,effect.count);
      const reanimated=cardIds.map(cardId=>reanimateGraveyardCard(target,cardId)).filter(Boolean);
      if(reanimated.length)logCommander(`You reanimate ${reanimated.map(discardedCardText).join(", ")} from ${name}'s graveyard.`);
      else logCommander(`${name}'s graveyard has no selected creature to reanimate.`);
    }else if(effect.action==="discard"){
      if(target.id==="player"){
        const amount=Math.min(effect.count,target.handSize);target.handSize-=amount;
        const discarded=Array.from({length:amount},()=>addPlayerGraveyardCard(target,{name:"Unrevealed discarded card",ico:"🃏",types:["Unknown"],virtual:true})).filter(Boolean);
        recordDiscardedCards(target,discarded);
        logCommander(`${name} discards ${discarded.length?discarded.map(discardedCardText).join(", "):"no cards"}. Types: ${discardedTypeSummary(discarded)}. The physical-hand model does not reveal their actual identities.`);
      }else{
        const discarded=discardFromOpponent(target,effect.count);
        logCommander(`${name} chooses to discard ${discarded.length?discarded.map(discardedCardText).join(", "):"no cards"}.${discarded.length?` Types: ${discardedTypeSummary(discarded)}.`:""}`);
      }
    }else if(effect.action==="mill"){
      if(target.id==="player"){
        const amount=Math.min(effect.count,target.librarySize);target.librarySize-=amount;
        const milled=Array.from({length:amount},()=>addPlayerGraveyardCard(target,{name:"Unrevealed milled card",ico:"📚",types:["Unknown"],virtual:true})).filter(Boolean);
        logCommander(`${name} mills ${milled.length?milled.map(discardedCardText).join(", "):"no cards"}. Types: ${discardedTypeSummary(milled)}. The physical-library model does not reveal their actual identities.`);
      }else{
        const milled=millOpponent(target,effect.count);
        logCommander(`${name} mills ${milled.length?milled.map(discardedCardText).join(", "):"no cards"}.${milled.length?` Types: ${discardedTypeSummary(milled)}.`:""}`);
      }
    }else if(effect.action==="draw"){
      if(target.id==="player"){
        const amount=Math.min(effect.count,target.librarySize);target.librarySize-=amount;target.handSize+=amount;
        logCommander(`${name} draws ${amount} card${amount===1?"":"s"}.`);
      }else{
        let drawn=0;for(let i=0;i<effect.count;i++)if(drawForOpponent(target)!=="none")drawn++;
        logCommander(`${name} draws ${drawn} card${drawn===1?"":"s"}.`);
      }
    }else if(effect.action==="loseLife"||effect.action==="gainLife"){
      const direction=effect.action==="loseLife"?-1:1;target.life=Math.max(0,target.life+(direction*effect.count));
      logCommander(`${name} ${effect.action==="loseLife"?"loses":"gains"} ${effect.count} life. (Life → ${target.life})`);
    }else if(target.id==="player"){
      if(effect.action==="exile")target.exileCount+=effect.count;
      logCommander(`${effect.action==="exile"?"Exile":"Resolve"} ${effect.count} ${effect.cardType} card${effect.count===1?"":"s"} you control.`);
    }else{
      const selections=chooseCpuPermanents(target,effect.cardType,effect.count).sort((left,right)=>{
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
  commanderEffectDraft={scope:draft.scope,action:draft.action,count:draft.count,cardType:draft.cardType,targetId:null,choices:{},creaturesPlayed:draft.creaturesPlayed||0};
  ensureCommanderEffectState(gameState);saveState();showCommanderGame();
}
function isPermanentPlayerAction(effect){return effect.action==="destroy"||effect.action==="sacrifice"||effect.action==="exile";}
async function confirmAndResolvePlayerEffect(effect,draft){
  const targets=effectTargets(gameState,effect,draft.targetId);
  const affectsPlayer=effect.action==="reanimate"?false:targets.some(target=>target.id==="player");
  const cpuTargets=targets.filter(target=>target.id!=="player");
  const playerInstruction=affectsPlayer
    ?`Complete your physical action now, then confirm it: ${playerEffectSummary(effect)}`
    :`No physical action is required from you.`;
  const cpuInstruction=effect.action==="reanimate"
    ?"Selected creature cards will enter your battlefield under your control."
    :cpuTargets.length
    ?isPermanentPlayerAction(effect)
      ?"Each affected CPU will automatically choose its least valuable eligible permanent."
      :effect.action==="discard"
        ?"Each affected CPU will automatically discard its least valuable card."
        :"CPU state will resolve automatically."
    :"";
  const message=`<strong>${playerEffectSummary(effect)}</strong><br><br>${playerInstruction}${cpuInstruction?`<br><br>${cpuInstruction}`:""}`;
  const confirmed=typeof askConfirm==="function"
    ?await askConfirm("Confirm action resolution",message,affectsPlayer?"I completed my action":"Resolve action")
    :window.confirm(`${playerEffectSummary(effect)}\n\n${playerInstruction}\n${cpuInstruction}`);
  if(!confirmed)return false;
  resolvePlayerEffect(effect,draft);
  logCommander("Action confirmed and resolved.");
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
        <p class="setup-col-desc">Face 1–4 CPU commanders with your own deck. They fight each other too.</p>
        <div class="opponent-count">
          <label>Opponents</label>
          <div class="count-row">
            <button type="button" class="count-btn" data-count="1">1</button>
            <button type="button" class="count-btn active" data-count="2">2</button>
            <button type="button" class="count-btn" data-count="3">3</button>
            <button type="button" class="count-btn" data-count="4">4</button>
          </div>
        </div>
        <button class="setup-col-cta commander-cta" id="startCommanderBtn">Begin Commander Battle</button>
      </div>
      <div class="setup-col setup-col-adventure">
        <h3 class="setup-col-h">🌲 Solo Adventures</h3>
        <p class="setup-col-desc">Scripted 1v1 encounters — you vs. a single CPU opponent.</p>
        <button class="setup-col-cta adventure-cta" id="showAdventuresBtn">Choose Adventure</button>
      </div>
    </div>
    <div class="theme-picker">
      <label>Theme</label>
      <div class="theme-btns" id="themeBtns">
        <button type="button" class="theme-btn" data-theme="classic"><span class="theme-swatch theme-swatch-classic"></span>Classic</button>
        <button type="button" class="theme-btn" data-theme="fantasy"><span class="theme-swatch theme-swatch-fantasy"></span>Dark Fantasy</button>
        <button type="button" class="theme-btn" data-theme="poker"><span class="theme-swatch theme-swatch-poker"></span>Poker</button>
      </div>
    </div>`;
  overlay.classList.add("show");

  let selectedCount=2;
  modal.querySelectorAll('.count-btn').forEach(btn=>{
    btn.onclick=()=>{modal.querySelectorAll('.count-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');selectedCount=parseInt(btn.dataset.count,10);};
  });
  document.getElementById('startCommanderBtn').onclick=()=>{overlay.classList.remove("show");onStartCommander(selectedCount);};
  document.getElementById('showAdventuresBtn').onclick=()=>renderAdventureSelectScreen(adventureModes,onStartAdventure);
  wireThemePicker();
}

function renderAdventureSelectScreen(adventureModes, onStartAdventure){
  const modal=document.getElementById('modal');
  modal.innerHTML=`
    <button type="button" class="setup-back-btn" id="adventureBackBtn">← Back</button>
    <h2 class="adventure-select-h">🌲 Solo Adventures</h2>
    <p class="setup-sub">You vs. CPU — choose your opponent.</p>
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
  const cards=owner.graveyard||[];
  const unmaterialized=unmaterializedGraveyardCount(owner);
  const ownerName=owner.id==="player"?"Your":`${owner.name.split(",")[0]}'s`;
  const cardsHtml=cards.length?cards.map(card=>`<li class="graveyard-card ${card.virtual?"virtual":""}">
    <span class="graveyard-card-icon">${escapeHtml(card.ico||"🃏")}</span><div class="graveyard-card-info"><strong>${escapeHtml(card.name)}</strong><span>${escapeHtml(cardTypeText(card))}${card.p!=null&&card.t!=null?` · ${card.p}/${card.t}`:""}</span>${card.effect?`<small>${escapeHtml(card.effect)}</small>`:""}</div>
  </li>`).join(""):"<li class=\"graveyard-empty\">No materialized cards yet.</li>";
  const historicalNote=unmaterialized?`<p class="graveyard-untracked">${unmaterialized} earlier card${unmaterialized===1?" was":"s were"} counted but not materialized, so ${unmaterialized===1?"it":"their identities"} cannot be shown.</p>`:"";
  modal.className="modal graveyard-modal";
  modal.innerHTML=`<div class="graveyard-modal-head"><div><span class="big-ico">⚰</span><h2>${escapeHtml(ownerName)} Graveyard</h2></div><button type="button" class="graveyard-close" aria-label="Close graveyard">×</button></div><p class="graveyard-summary">${owner.graveyardCount||0} card${owner.graveyardCount===1?"":"s"} · ${cards.length} materialized</p><ul class="graveyard-card-list">${cardsHtml}</ul>${historicalNote}<button type="button" class="cta ghost" id="closeGraveyardViewer">Close</button>`;
  overlay.classList.add("show");
  const close=()=>{overlay.classList.remove("show");modal.innerHTML="";};
  document.getElementById("closeGraveyardViewer").onclick=close;
  modal.querySelector(".graveyard-close").onclick=close;
}
function wireGraveyardViewerControls(root,state){
  root.querySelectorAll("[data-graveyard-owner]").forEach(control=>{
    const open=event=>{event.preventDefault();event.stopPropagation();showGraveyardViewer(state,control.dataset.graveyardOwner);};
    control.onclick=open;
    control.onkeydown=event=>{if(event.key==="Enter"||event.key===" ")open(event);};
  });
}

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
    html+=`<button type="button" class="life-pip life-pip-btn ${dead?'dead':''} ${active?'active-opp':''}" data-view="${opp.index}" style="border-color:${opp.color}"><span class="life-ico">${opp.ico}</span><span class="life-name">${opp.name.split(',')[0]}</span><span class="life-val ${opp.life<=10?'warn':''}">${dead?'☠':opp.life}</span><span class="life-creatures">🃏 ${opponentHandSize(opp)} · 📚 ${opponentDeckSize(opp)} · <span class="life-graveyard" role="button" tabindex="0" data-graveyard-owner="${opp.id}">⚰ ${opp.graveyardCount}</span></span>${cd>0?`<span class="life-cmdr-dmg">⚜${cd}</span>`:''}</button>`;
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
  const canRemove=state.phase==="player";

  if(isPlayerView){
    renderPlayerBoardView(state,board,totalViews);
    return;
  }

  const opp=state.opponents[viewIdx];if(!opp)return;
  const dead=isOpponentDead(opp);
  board.className=`board ${dead?'defeated':''}`;board.style.borderColor=dead?'var(--blood)':opp.color;
  const tokensHtml=opp.tokens.length===0?'<div class="empty-field">No creatures</div>':
    opp.tokens.map((t,i)=>{
      const kws=t.kws&&t.kws.length?t.kws.join(' · '):'';
      const tooltip=`${t.name} — ${t.p}/${t.t}${t.kws&&t.kws.length?' · '+t.kws.join(', '):''}${t.effect?' — '+t.effect:''}`;
      return `<div class="card ${t.kind==='commander'?'commander':''} ${t.summoningSick?'sick':''} ${t.attacking?'tapped':''}" title="${tooltip.replace(/"/g,'&quot;')}">
      ${canRemove?`<button type="button" class="c-x" data-opp="${opp.id}" data-rm-idx="${i}" title="Remove ${t.name}" aria-label="Remove ${t.name}">×</button>`:''}
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
    <div class="view-controls"><button class="btn-ghost view-btn" id="prevOppBtn">◂</button><span class="view-counter">${viewLabel}</span><button class="btn-ghost view-btn" id="nextOppBtn">▸</button><button class="btn-ghost view-btn" id="allViewBtn">⊞</button></div>
  </div><div class="board-inner commander-board-inner"><div class="garruk-col">
    <div class="commander-board-stats">
      <div class="cbs-item"><span class="cbs-label">Life</span><div class="cbs-adj"><button type="button" class="cbs-btn" data-opp-stat="life" data-opp-id="${opp.id}" data-d="-1">−</button><span class="cbs-val ${opp.life<=10?'warn':''}">${opp.life}</span><button type="button" class="cbs-btn" data-opp-stat="life" data-opp-id="${opp.id}" data-d="1">+</button></div></div>
      <div class="cbs-item cbs-cmdr-dmg"><span class="cbs-label">⚜ Cmdr dmg taken</span><div class="cbs-adj"><button type="button" class="cbs-btn" data-cmdr-from="${opp.id}" data-d="-1">−</button><span class="cbs-val ${cdFromOpp>=14?'warn':''}">${cdFromOpp}/21</span><button type="button" class="cbs-btn" data-cmdr-from="${opp.id}" data-d="1">+</button></div></div>
      <div class="cbs-item"><span class="cbs-label">Mana</span><span class="cbs-val">${manaAvailable(opp)}</span></div>
      <div class="cbs-item"><span class="cbs-label">Hand</span><span class="cbs-val">🃏 ${opponentHandSize(opp)}/${MAX_CPU_HAND_SIZE}</span></div>
      <div class="cbs-item"><span class="cbs-label">Deck</span><span class="cbs-val">📚 ${opponentDeckSize(opp)}</span></div>
      <div class="cbs-item"><span class="cbs-label">Commander</span><span class="cbs-val">${opp.commanderZone?'Zone (+'+opp.commanderTax+')':'Field'}</span></div>
      <div class="cbs-item"><span class="cbs-label">Artifact — Equipment</span><span class="cbs-val">${opp.gear}</span></div>
      <div class="cbs-item"><span class="cbs-label">Graveyard</span><button type="button" class="cbs-zone-btn" data-graveyard-owner="${opp.id}">⚰ ${opp.graveyardCount}</button></div>
      <div class="cbs-item"><span class="cbs-label">Exile</span><span class="cbs-val">🌀 ${opp.exileCount}</span></div>
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
    board.querySelectorAll('.c-x[data-rm-idx]').forEach(btn=>{
      btn.onclick=(e)=>{
        e.stopPropagation();
        const targetOpp=state.opponents.find(o=>o.id===btn.dataset.opp);
        const idx=parseInt(btn.dataset.rmIdx);
        if(!targetOpp||idx>=targetOpp.tokens.length)return;
        const moved=removeOpponentPermanent(targetOpp,`token:${idx}`,"graveyard");
        if(moved)logCommander(`You destroy ${movementCardText(moved)} from ${targetOpp.name.split(',')[0]}. Types: ${discardedTypeSummary([moved])}.`);
        renderBoardView(state);renderLifeHud(state);saveState();
      };
    });
  }
}

function renderPlayerBoardView(state,board,totalViews){
  board.className='board';board.style.borderColor='var(--gold-dim)';
  const p=state.player;
  const cmdrDmgEntries=Object.entries(p.commanderDamageReceived||{}).filter(([,v])=>v>0);
  let cmdrDmgHtml='';
  if(cmdrDmgEntries.length>0){
    cmdrDmgHtml=cmdrDmgEntries.map(([oppId,dmg])=>{
      const src=state.opponents.find(o=>o.id===oppId);
      return `<div class="cbs-item cbs-cmdr-dmg"><span class="cbs-label">${src?src.ico:'⚜'} Cmdr dmg from ${src?src.name.split(',')[0]:'?'}</span><div class="cbs-adj"><button type="button" class="cbs-btn" data-cmdr-from="${oppId}" data-d="-1">−</button><span class="cbs-val ${dmg>=14?'warn':''}">${dmg}/21</span><button type="button" class="cbs-btn" data-cmdr-from="${oppId}" data-d="1">+</button></div></div>`;
    }).join('');
  }

  const playerCreatureCards=(p.tokens||[]).filter(token=>token.kind==="reanimated-creature");
  const playerTokensHtml=playerCreatureCards.length?playerCreatureCards.map(token=>`<div class="card voltron-creature reanimated" title="Reanimated from ${token.owner}"><span class="c-name"><span>${token.name}</span><span class="mana">↩</span></span><span class="c-art">${token.ico}</span>${token.kws?.length?`<span class="c-kw">${token.kws.join(" · ")}</span>`:""}${token.effect?`<span class="c-effect">${token.effect}</span>`:""}<span class="c-pt">${token.p}/${token.t}</span>${token.summoningSick?'<div class="c-sick">💤</div>':''}</div>`).join(""):`<div class="empty-field">${p.creatures} creature${p.creatures!==1?'s':''} on your battlefield</div>`;

  board.innerHTML=`<div class="board-h"><span class="ico">🗡️</span><span>You</span>
    <span class="atk-note"></span>
    <div class="view-controls"><button class="btn-ghost view-btn" id="prevOppBtn">◂</button><span class="view-counter">1/${totalViews}</span><button class="btn-ghost view-btn" id="nextOppBtn">▸</button><button class="btn-ghost view-btn" id="allViewBtn">⊞</button></div>
  </div><div class="board-inner commander-board-inner"><div class="garruk-col">
    <div class="commander-board-stats">
      <div class="cbs-item"><span class="cbs-label">Life</span><div class="cbs-adj"><button type="button" class="cbs-btn" data-player-stat="life" data-d="-1">−</button><span class="cbs-val ${p.life<=10?'warn':''}">${p.life}</span><button type="button" class="cbs-btn" data-player-stat="life" data-d="1">+</button></div></div>
      ${cmdrDmgHtml}
      <div class="cbs-item"><span class="cbs-label">Creatures</span><div class="cbs-adj"><button type="button" class="cbs-btn" data-player-stat="creatures" data-d="-1">−</button><span class="cbs-val">${p.creatures}</span><button type="button" class="cbs-btn" data-player-stat="creatures" data-d="1">+</button></div></div>
      <div class="cbs-item"><span class="cbs-label">Graveyard</span><button type="button" class="cbs-zone-btn" data-graveyard-owner="player">⚰ ${p.graveyardCount}</button></div>
      <div class="cbs-item"><span class="cbs-label">Exile</span><span class="cbs-val">🌀 ${p.exileCount}</span></div>
    </div></div>
    <div class="field-col"><div class="field-h"><span class="lbl">Your board state</span></div><div class="tokens">${playerTokensHtml}</div></div></div></div>`;

  document.getElementById('prevOppBtn').onclick=()=>{state.viewTarget=state.opponents.length-1;renderBoardView(state);};
  document.getElementById('nextOppBtn').onclick=()=>{state.viewTarget=0;renderBoardView(state);};
  document.getElementById('allViewBtn').onclick=()=>{state.viewMode="all";renderBoardView(state);};
  wireGraveyardViewerControls(board,state);

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
  let html=`<div class="board-h"><span class="ico">⊞</span><span>All Opponents</span><div class="view-controls"><button class="btn-ghost view-btn" id="singleViewBtn">◻</button></div></div><div class="all-opponents-grid">`;
  html+=`<div class="all-opp-card player-card" data-idx="-1" style="border-color:var(--gold-dim)">
    <div class="all-opp-header"><span>🗡️</span><span class="all-opp-name">You</span><span class="all-opp-life">${state.player.life}</span></div>
    <div class="all-opp-body"><span>${state.player.creatures} creature${state.player.creatures!==1?'s':''}</span></div>
  </div>`;
  state.opponents.forEach((opp,i)=>{
    const dead=isOpponentDead(opp);const commander=commanderOnField(opp);
    html+=`<div class="all-opp-card ${dead?'dead':''}" data-idx="${i}" style="border-color:${opp.color}">
      <div class="all-opp-header"><span>${opp.ico}</span><span class="all-opp-name">${opp.name.split(',')[0]}</span><span class="all-opp-life">${dead?'☠':opp.life}</span></div>
      <div class="all-opp-body"><span>${opp.tokens.length} creature${opp.tokens.length!==1?'s':''}</span>${commander?`<span>⚔ ${commander.p}/${commander.t}</span>`:'<span>Cmdr in zone</span>'}<span>${opp.landsInPlay+opp.rampInPlay} mana</span><span>📚 ${opponentDeckSize(opp)}</span></div>
      ${opp.attackTarget?`<div class="all-opp-target">→ ${getTargetName(state,opp.attackTarget)}</div>`:''}
    </div>`;
  });
  html+='</div>';board.innerHTML=html;
  document.getElementById('singleViewBtn').onclick=()=>{state.viewMode="single";if(state._activeOppIndex!=null)state.viewTarget=state._activeOppIndex;renderBoardView(state);};
  board.querySelectorAll('.all-opp-card').forEach(card=>{card.onclick=()=>{state.viewTarget=parseInt(card.dataset.idx);state.viewMode="single";renderBoardView(state);};});
}

function renderCpuTurnSummary(state,turnResults){
  const panel=document.getElementById('respGrid');if(!panel)return;
  let html=`<div class="cpu-turn-summary"><div class="cts-header">Opponents' Turn ${state.turn}</div>`;
  turnResults.forEach(r=>{
    const opp=r.opponent;if(isOpponentDead(opp))return;
    html+=`<div class="cts-opponent" style="border-left-color:${opp.color}"><div class="cts-name">${opp.ico} ${opp.name.split(',')[0]}</div><div class="cts-actions">${r.actions.map(a=>`<div class="cts-action"><span>${a.label}</span></div>`).join('')}</div>${r.attackPower>0?`<div class="cts-attack">→ Attacks ${getTargetName(state,r.target)} for ${r.attackPower}</div>`:''}</div>`;
  });
  html+='</div>';panel.innerHTML=html;
}

function renderCommanderPlayerInputs(state, pendingAttacks){
  const panel=document.getElementById('respGrid');if(!panel)return null;
  let html='<div class="context-form commander-form">';
  if(pendingAttacks.length>0){
    html+='<div class="context-section"><div class="context-section-title">Incoming Attacks</div>';
    pendingAttacks.forEach(({opponent:opp,attack})=>{
      html+=`<div class="commander-attack-block" data-opp="${opp.id}" style="border-left-color:${opp.color}">
        <div class="cab-header">${opp.ico} ${opp.name.split(',')[0]} attacks you for ${attack.totalPower}</div>
        <div class="cab-attackers">${attack.attackers.map(a=>`${a.ico} ${a.name} (${a.p}/${a.t})`).join(', ')}</div>
        <div class="cab-inputs">
          <div class="inline-stepper"><label>Damage through</label><button type="button" data-opp="${opp.id}" data-key="damage" data-delta="-1">−</button><input type="number" min="0" max="${attack.totalPower}" value="${attack.totalPower}" data-opp="${opp.id}" data-key="damage"><button type="button" data-opp="${opp.id}" data-key="damage" data-delta="1">+</button></div>
          ${attack.commanderDamage>0?`<div class="inline-stepper"><label>Commander dmg</label><button type="button" data-opp="${opp.id}" data-key="cmdrDmg" data-delta="-1">−</button><input type="number" min="0" max="${attack.commanderDamage}" value="${attack.commanderDamage}" data-opp="${opp.id}" data-key="cmdrDmg"><button type="button" data-opp="${opp.id}" data-key="cmdrDmg" data-delta="1">+</button></div>`:''}
          <div class="inline-stepper"><label>Your creatures lost</label><button type="button" data-opp="${opp.id}" data-key="deaths" data-delta="-1">−</button><input type="number" min="0" value="0" data-opp="${opp.id}" data-key="deaths"><button type="button" data-opp="${opp.id}" data-key="deaths" data-delta="1">+</button></div>
        </div></div>`;
    });
    html+='</div>';
  } else {
    html+='<div class="context-summary"><span class="context-summary-icon">✓</span><div><strong>No attacks targeting you this turn</strong></div></div>';
  }
  html+=`<div class="context-section"><div class="context-section-title">Your Turn</div><div class="commander-player-actions">
    <div class="inline-stepper"><label>Creatures added</label><button type="button" data-key="creaturesPlayed" data-delta="-1">−</button><input type="number" min="0" value="0" data-key="creaturesPlayed"><button type="button" data-key="creaturesPlayed" data-delta="1">+</button></div>
    <div class="attack-target-section"><label>Attack target</label><div class="target-buttons" id="attackTargetBtns">
      ${state.opponents.map((opp,i)=>{const dead=isOpponentDead(opp);return `<button type="button" class="target-btn ${dead?'dead':''}" data-target="${i}" ${dead?'disabled':''}>${opp.ico} ${opp.name.split(',')[0]} (${opp.life})</button>`;}).join('')}
    </div></div>
    <div class="inline-stepper" id="damageToEnemyRow" style="display:none"><label>Damage dealt</label><button type="button" data-key="damageToEnemy" data-delta="-1">−</button><input type="number" min="0" value="0" data-key="damageToEnemy"><button type="button" data-key="damageToEnemy" data-delta="1">+</button></div>
    <div class="inline-stepper" id="cmdrDmgToEnemyRow" style="display:none"><label>Commander damage dealt</label><button type="button" data-key="cmdrDmgToEnemy" data-delta="-1">−</button><input type="number" min="0" value="0" data-key="cmdrDmgToEnemy"><button type="button" data-key="cmdrDmgToEnemy" data-delta="1">+</button></div>
  </div></div></div>`;
  panel.innerHTML=html;

  // Wire steppers
  panel.querySelectorAll('[data-delta]').forEach(btn=>{
    btn.onclick=()=>{const inp=btn.parentElement.querySelector('input');const mx=inp.max?parseInt(inp.max):999;inp.value=Math.max(0,Math.min(mx,(parseInt(inp.value)||0)+parseInt(btn.dataset.delta)));};
  });
  // Wire target selection
  let selectedTarget=null;
  panel.querySelectorAll('.target-btn').forEach(btn=>{
    btn.onclick=()=>{if(btn.disabled)return;panel.querySelectorAll('.target-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');selectedTarget=parseInt(btn.dataset.target);document.getElementById('damageToEnemyRow').style.display='';document.getElementById('cmdrDmgToEnemyRow').style.display='';};
  });
  return function(){
    const result={incomingDamage:[],creaturesPlayed:parseInt(panel.querySelector('input[data-key="creaturesPlayed"]')?.value)||0,attackTarget:selectedTarget,damageToEnemy:parseInt(panel.querySelector('input[data-key="damageToEnemy"]')?.value)||0,cmdrDmgToEnemy:parseInt(panel.querySelector('input[data-key="cmdrDmgToEnemy"]')?.value)||0};
    pendingAttacks.forEach(({opponent:opp})=>{
      result.incomingDamage.push({oppId:opp.id,damage:parseInt(panel.querySelector(`input[data-opp="${opp.id}"][data-key="damage"]`)?.value)||0,commanderDamage:parseInt(panel.querySelector(`input[data-opp="${opp.id}"][data-key="cmdrDmg"]`)?.value)||0,playerDeaths:parseInt(panel.querySelector(`input[data-opp="${opp.id}"][data-key="deaths"]`)?.value)||0});
    });
    return result;
  };
}

/* =====================================================================
   GAME LOOP
   ===================================================================== */
let gameState=null, collectInputsFn=null;
let cmdUndoStack=[];
function cmdSnapshot(){cmdUndoStack.push(JSON.stringify(gameState));if(cmdUndoStack.length>15)cmdUndoStack.shift();updateCmdUndoBtn();}
function updateCmdUndoBtn(){const b=document.getElementById('undoBtn');if(b)b.disabled=cmdUndoStack.length===0;}
function cmdUndo(){
  if(cmdUndoStack.length===0)return;
  gameState=JSON.parse(cmdUndoStack.pop());
  updateCmdUndoBtn();showCommanderGame();
  if(gameState.phase==="player")startPlayerPhase();else runCpuPhase();
  logCommander("↶ Reverted to previous state.");
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
}

function saveState(){safeSet(SAVE_KEY,JSON.stringify({...gameState,_type:"commander"}));}

function showCommanderGame(){
  ensureCommanderEffectState(gameState);
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
    if(main)main.parentNode.insertBefore(bar,main);
  }
  // Hide the original turn-actions since we use the fixed confirm bar
  const oldActions=document.querySelector('.turn-actions');
  if(oldActions)oldActions.style.display='none';
  return bar;
}

function setConfirmButton(text,className,onclick,showEndTurn){
  const bar=ensureConfirmBar();
  let html=`<button class="cmd-confirm-btn ${className}" id="cmdConfirmBtn">${text}</button>`;
  if(showEndTurn){
    html+=`<button class="cmd-confirm-btn cmd-end-turn-btn ${className}" id="cmdEndTurnBtn">End Turn</button>`;
  }
  bar.innerHTML=html;
  document.getElementById('cmdConfirmBtn').onclick=onclick;
  if(showEndTurn){
    document.getElementById('cmdEndTurnBtn').onclick=()=>{
      // Resolve current step inputs before ending
      resolveCurrentStepInputs();
      const end=checkCommanderBattleEnd(gameState);
      if(end.over){endCommanderGame(end.won,end.reason);return;}
      gameState.turn++;collectInputsFn=null;saveState();runCpuPhase();
    };
  }
}

function resolveCurrentStepInputs(){
  const panel=document.getElementById('respGrid');
  if(!panel)return;
  if(playerStep==="main1"){
    const played=parseInt(panel.querySelector('input[data-key="creaturesPlayed"]')?.value)||0;
    if(played>0){gameState.player.creatures+=played;logCommander(`You play ${played} creature(s).`);}
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
      logCommander(`${playerDeaths} of your creature(s) died in combat.`);
    }
  }
  showCommanderGame();
}

function ensureLastTurnSection(){
  let el=document.getElementById('cmdLastTurn');
  if(!el){
    el=document.createElement('div');el.id='cmdLastTurn';el.className='cmd-last-turn';
    const bar=ensureConfirmBar();
    if(bar.nextSibling)bar.parentNode.insertBefore(el,bar.nextSibling);
    else bar.parentNode.appendChild(el);
  }
  return el;
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
    return `<button type="button" class="lt-step${canCounter?' lt-counterable':''}" data-step-idx="${i}"${!canCounter?' disabled':''}><strong>${a.label}</strong><span>${a.detail}</span>${canCounter?'<span class="lt-counter-hint">tap to counter</span>':''}</button>`;
  }).join('');
  el.innerHTML=`<div class="lt-header"><span class="lt-ico">${opp.ico}</span><span class="lt-title">${opp.name.split(',')[0]}'s Actions</span><span class="lt-turn">Turn ${gameState.turn}</span></div><div class="lt-steps">${stepsHtml}</div>`;
  // Wire counter toggles
  el.querySelectorAll('.lt-counterable').forEach(btn=>{
    btn.onclick=()=>{
      const idx=parseInt(btn.dataset.stepIdx);
      if(el._counteredSet.has(idx)){el._counteredSet.delete(idx);btn.classList.remove('lt-countered');}
      else{el._counteredSet.add(idx);btn.classList.add('lt-countered');}
    };
  });
}
function hideLastTurnSection(){
  const el=document.getElementById('cmdLastTurn');if(el)el.style.display='none';
}

function logCommander(msg){
  gameState.log.unshift({cls:"sys",who:"",msg,turn:gameState.turn});
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

  // Auto-resolve CPU-on-CPU damage (player doesn't interact with these)
  if(result.attackPower>0&&result.target&&result.target!=="player"){
    const tgt=gameState.opponents.find(p=>p.id===result.target);
    if(tgt&&!isOpponentDead(tgt)){
      const cmdDmg=result.commanderAttacking?(opp.tokens.find(t=>t.kind==="commander")?.p||0):0;
      tgt.life=Math.max(0,tgt.life-result.attackPower);
      tgt.damageLog[opp.id]=(tgt.damageLog[opp.id]||0)+result.attackPower;
      tgt.lastAttacker=opp.id;
      if(cmdDmg>0)tgt.commanderDamageReceived[opp.id]=(tgt.commanderDamageReceived[opp.id]||0)+cmdDmg;
      if(result.attackPower>=5&&tgt.tokens.length>0&&Math.random()<0.4){
        const vi=Math.floor(Math.random()*tgt.tokens.length);
        const moved=removeOpponentPermanent(tgt,`token:${vi}`,"graveyard");
        if(moved)logCommander(`${opp.name.split(',')[0]}'s attack destroys ${movementCardText(moved)} from ${tgt.name.split(',')[0]}. Types: ${discardedTypeSummary([moved])}.`);
      }
    }
  }

  // Show this opponent's actions and give the player a response window
  showOpponentTurnResponse(opp,result);
}

// Flavor lines per action type to bring AI to life
const CPU_FLAVOR = {
  draw:["draws for turn.","considers their options.","studies the battlefield."],
  land:["plays a land.","develops their mana base.","taps a fresh land."],
  ramp:["accelerates their mana.","ramps ahead of the table.","invests in the future."],
  commander:["calls their commander to battle!","slams their general onto the field!","the command zone opens."],
  equip:["arms their commander.","straps on another weapon.","the commander grows stronger."],
  creature:["deploys reinforcements.","summons an ally.","adds to the board."],
  attack:["turns sideways aggressively.","sends the team in.","declares attackers with confidence."],
};
function pickFlavor(type){const pool=CPU_FLAVOR[type]||CPU_FLAVOR.draw;return pool[Math.floor(Math.random()*pool.length)];}

function showOpponentTurnResponse(opp,result){
  showCommanderGame();
  result.actions.filter(action=>(action.discarded&&action.discarded.length)||action.deckOut).forEach(action=>{
    logCommander(`${opp.name.split(',')[0]} ${action.detail}`);
  });
  gameState._activeOppIndex=opp.index;
  if(gameState.viewMode==="single")gameState.viewTarget=opp.index;
  renderBoardView(gameState);

  document.getElementById('phasePill').textContent=`${opp.name.split(',')[0]}'s Turn`;
  document.getElementById('huntTitle').textContent=`${opp.ico} ${opp.name.split(',')[0]}'s Turn`;

  const decl=document.getElementById('declare');decl.className="declare garruk compact-declare";
  document.getElementById('declareTitle').textContent=`${opp.name.split(',')[0]}'s Turn`;

  // Simplified top summary — just the flavor line
  const attacksPlayer=result.target==="player"&&result.attackPower>0;
  let flavorType=result.actions.some(a=>a.label.includes("Attack"))?"attack":result.actions.some(a=>a.label.includes("Cast "+opp.name.split(',')[0]))?"commander":result.actions.some(a=>a.label.includes("Equip"))?"equip":result.actions.some(a=>a.label.includes("Cast"))?"creature":"draw";
  let topSummary=`${opp.name.split(',')[0]} ${pickFlavor(flavorType)}`;
  if(attacksPlayer)topSummary+=` · Attacks you for ${result.attackPower}`;
  else if(result.attackPower>0)topSummary+=` · Attacks ${getTargetName(gameState,result.target)} for ${result.attackPower}`;
  document.getElementById('declareFlavor').textContent=topSummary;
  document.getElementById('declareMech').innerHTML='';

  // Show full action breakdown in the Last Turn section (below confirm bar)
  renderLastTurnSection(opp);

  // Render the response form
  const panel=document.getElementById('respGrid');
  const isIntervention=!attacksPlayer&&result.attackPower>0;
  document.getElementById('respTitle').textContent=attacksPlayer?"Your Response":isIntervention?"Intervene?":"Your Response";
  renderResponseForm(panel,opp,result,attacksPlayer);
}

function renderResponseForm(panel,opp,result,attacksPlayer){
  const hasCreatures=opp.tokens.length>0;
  const defenderOpp=(!attacksPlayer&&result.target)?gameState.opponents.find(o=>o.id===result.target):null;
  const defenderHasCreatures=defenderOpp&&defenderOpp.tokens.length>0;

  let html='<div class="context-form commander-form">';

  // Creature removal section — grouped by owner (attacker and defender)
  const isIntervention=!attacksPlayer&&result.attackPower>0;
  const showDefender=isIntervention&&defenderHasCreatures;
  if(hasCreatures||showDefender){
    if(isIntervention){
      html+=`<div class="context-summary intervene-summary"><span class="context-summary-icon">⚡</span><div><strong>Do you wish to intervene?</strong><span>You may use instant-speed removal on any creature involved in this combat.</span></div></div>`;
    }
    const sectionTitle="Remove creatures (tap to select)";
    html+=`<div class="context-section"><div class="context-section-title">${sectionTitle}</div>`;

    // Active opponent's creatures
    if(hasCreatures){
      const tappedCount=opp.tokens.filter(t=>t.attacking).length;
      const roleLabel=isIntervention?" (attacker)":"";
      html+=`<div class="kill-owner-group"><div class="kill-owner-label" style="border-left-color:${opp.color}">${opp.ico} ${opp.name.split(',')[0]}${roleLabel}${tappedCount?` · ${tappedCount} tapped`:''}</div>
        <div class="kill-select">${opp.tokens.map((t,i)=>{
          const isAttacking=!!t.attacking;
          return `<button type="button" class="kill-btn${isAttacking?' is-tapped':''}" data-opp="${opp.id}" data-idx="${i}"><span class="kill-btn-status">${isAttacking?'⚔':'⬡'}</span> ${t.ico} ${t.name} (${t.p}/${t.t})${isAttacking?' <span class="tapped-label">attacking</span>':''}</button>`;
        }).join('')}</div></div>`;
    }

    // Defender's creatures (only when there's actual combat between CPUs)
    if(showDefender){
      html+=`<div class="kill-owner-group"><div class="kill-owner-label" style="border-left-color:${defenderOpp.color}">${defenderOpp.ico} ${defenderOpp.name.split(',')[0]} (defender)</div>
        <div class="kill-select">${defenderOpp.tokens.map((t,i)=>{
          return `<button type="button" class="kill-btn" data-opp="${defenderOpp.id}" data-idx="${i}"><span class="kill-btn-status">⬡</span> ${t.ico} ${t.name} (${t.p}/${t.t})</button>`;
        }).join('')}</div></div>`;
    }

    html+=`</div>`;
  }

  // Combat damage inputs (if attacking the player)
  if(attacksPlayer){
    const cmdDmg=result.commanderAttacking?(opp.tokens.find(t=>t.kind==="commander")?.p||0):0;
    const attackers=opp.tokens.filter(t=>t.attacking);
    const attackerList=attackers.map(t=>`${t.ico} ${t.name} (${t.p}/${t.t})`).join(', ');
    html+=`<div class="context-section"><div class="context-section-title">Combat — ${opp.name.split(',')[0]} attacks you for ${result.attackPower}</div>
      <div class="cab-attackers">${attackerList}</div>
      <div class="commander-player-actions">
        <div class="inline-stepper"><label>Damage getting through</label>
          <button type="button" data-key="damageThrough" data-delta="-1">−</button>
          <input type="number" min="0" max="${result.attackPower}" value="${result.attackPower}" data-key="damageThrough">
          <button type="button" data-key="damageThrough" data-delta="1">+</button>
        </div>
        ${cmdDmg>0?`<div class="inline-stepper"><label>Commander damage</label>
          <button type="button" data-key="cmdrDmgThrough" data-delta="-1">−</button>
          <input type="number" min="0" max="${cmdDmg}" value="${cmdDmg}" data-key="cmdrDmgThrough">
          <button type="button" data-key="cmdrDmgThrough" data-delta="1">+</button>
        </div>`:''}
        <div class="inline-stepper"><label>Your creatures that died</label>
          <button type="button" data-key="playerDeaths" data-delta="-1">−</button>
          <input type="number" min="0" value="0" data-key="playerDeaths">
          <button type="button" data-key="playerDeaths" data-delta="1">+</button>
        </div>
      </div>
    </div>`;
  }

  // No interaction needed
  if(!hasCreatures&&!defenderHasCreatures&&!attacksPlayer){
    html+=`<div class="context-summary"><span class="context-summary-icon">✓</span><div><strong>No response needed</strong><span>${opp.name.split(',')[0]} didn't threaten you this turn.</span></div></div>`;
  }

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

  // Wire kill-select buttons — keyed by opp id + index
  const killMap={};  // {oppId: Set of indices}
  function updateDamageFromKills(){
    if(!attacksPlayer)return;
    const attackers=opp.tokens.filter(t=>t.attacking);
    const attackerKills=killMap[opp.id]||new Set();
    let remaining=0; let cmdAlive=false;
    attackers.forEach((t)=>{
      const realIdx=opp.tokens.indexOf(t);
      if(!attackerKills.has(realIdx)){remaining+=t.p; if(t.kind==="commander")cmdAlive=true;}
    });
    const dmgInput=panel.querySelector('input[data-key="damageThrough"]');
    if(dmgInput){ dmgInput.value=remaining; dmgInput.max=remaining; }
    const cmdrInput=panel.querySelector('input[data-key="cmdrDmgThrough"]');
    if(cmdrInput){
      if(!cmdAlive){cmdrInput.value=0;cmdrInput.max=0;}
      else{const cmdPower=opp.tokens.find(t=>t.kind==="commander")?.p||0;cmdrInput.max=Math.min(cmdPower,remaining);cmdrInput.value=Math.min(parseInt(cmdrInput.value)||0,cmdrInput.max);}
    }
  }
  panel.querySelectorAll('.kill-btn').forEach(btn=>{
    btn.onclick=()=>{
      const oppId=btn.dataset.opp;
      const idx=parseInt(btn.dataset.idx);
      if(!killMap[oppId])killMap[oppId]=new Set();
      if(killMap[oppId].has(idx)){killMap[oppId].delete(idx);btn.classList.remove('selected');}
      else{killMap[oppId].add(idx);btn.classList.add('selected');}
      updateDamageFromKills();
    };
  });
  panel._killMap=killMap;

  // Wire the continue button (fixed position above panel)
  const remaining=cpuQueue.length;
  setConfirmButton(
    remaining>0?`Next Opponent (${remaining} left) ▸`:"Continue to Your Turn ▸",
    "garruk",
    ()=>resolveResponseAndContinue(opp,result,attacksPlayer,panel)
  );
}

function resolveResponseAndContinue(opp,result,attacksPlayer,panel){
  cmdSnapshot();
  // Read player's responses
  const ltEl=document.getElementById('cmdLastTurn');
  const counteredSet=ltEl?._counteredSet||new Set();
  const damageThrough=parseInt(panel.querySelector('input[data-key="damageThrough"]')?.value)||0;
  const cmdrDmgThrough=parseInt(panel.querySelector('input[data-key="cmdrDmgThrough"]')?.value)||0;
  const playerDeaths=parseInt(panel.querySelector('input[data-key="playerDeaths"]')?.value)||0;

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
    const finalDamage=Math.min(damageThrough,actualPower);

    if(finalDamage>0){
      gameState.player.life=Math.max(0,gameState.player.life-finalDamage);
      opp.damageLog["player"]=(opp.damageLog["player"]||0)+finalDamage;
      logCommander(`${opp.name.split(',')[0]} hits you for ${finalDamage}. Life → ${gameState.player.life}.`);
    } else {
      logCommander(`You prevent all damage from ${opp.name.split(',')[0]}.`);
    }

    if(cmdrDmgThrough>0){
      const finalCmdr=Math.min(cmdrDmgThrough,finalDamage);
      gameState.player.commanderDamageReceived[opp.id]=(gameState.player.commanderDamageReceived[opp.id]||0)+finalCmdr;
      logCommander(`${finalCmdr} commander damage from ${opp.name.split(',')[0]} (${gameState.player.commanderDamageReceived[opp.id]}/21).`);
    }

    if(playerDeaths>0){
      gameState.player.creatures=Math.max(0,gameState.player.creatures-playerDeaths);
      logCommander(`${playerDeaths} of your creature(s) died blocking.`);
    }
  }

  // Clear summoning sickness for this opponent's creatures
  opp.tokens.forEach(t=>{t.summoningSick=false;});

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
  document.getElementById('huntTitle').textContent="Your Turn · Draw";
  document.getElementById('declareTitle').textContent="Draw Phase";
  document.getElementById('declareFlavor').textContent="Untap your permanents, then draw a card.";
  document.getElementById('declareMech').innerHTML='';
  document.getElementById('respTitle').textContent="";

  const panel=document.getElementById('respGrid');
  panel.innerHTML=`<div class="context-form commander-form">
    <div class="context-summary draw-summary"><span class="context-summary-icon">🃏</span><div><strong>Draw for turn</strong><span>Untap, upkeep triggers, then draw. Confirm when ready.</span></div></div>
  </div>`;

  setConfirmButton("I Drew a Card ▸","",()=>{playerStep="main1";showPlayerStep();},true);
}

function commanderEffectDraftForPanel(panel){
  const played=parseInt(panel?.querySelector('input[data-key="creaturesPlayed"]')?.value)||0;
  if(!commanderEffectDraft){
    commanderEffectDraft={scope:"target",action:"discard",count:1,cardType:"creature",targetId:null,choices:{},creaturesPlayed:played};
  }
  commanderEffectDraft.creaturesPlayed=played||commanderEffectDraft.creaturesPlayed||0;
  return commanderEffectDraft;
}
function playerEffectSummary(effect){
  const scope={each:"Each player",eachOpponent:"Each opponent",target:"Target player"}[effect.scope];
  if(effect.action==="reanimate")return `Reanimate ${effect.count} creature${effect.count===1?"":"s"} from ${scope.toLowerCase()}'s graveyard under your control.`;
  const action={discard:"discards",mill:"mills",draw:"draws",loseLife:"loses",gainLife:"gains",destroy:"destroys",sacrifice:"sacrifices",exile:"exiles"}[effect.action];
  const subject=(effect.action==="destroy"||effect.action==="sacrifice"||effect.action==="exile")?`${effect.count} ${effect.cardType}${effect.count===1?"":"s"}`:effect.action.includes("Life")?`${effect.count} life`:`${effect.count} card${effect.count===1?"":"s"}`;
  return `${scope} ${action} ${subject}.`;
}
function renderCommanderMainPhasePanel(){
  const panel=document.getElementById('respGrid');if(!panel)return;
  const draft=commanderEffectDraftForPanel(panel),effect=createPlayerEffect(draft);
  const scopeOptions=PLAYER_ACTION_SCOPES.map(scope=>`<option value="${scope.value}" ${scope.value===draft.scope?"selected":""}>${scope.label}</option>`).join("");
  const actionOptions=PLAYER_ACTIONS.map(action=>`<option value="${action.value}" ${action.value===draft.action?"selected":""}>${action.label}</option>`).join("");
  const countOptions=[1,2,3,4,5].map(count=>`<option value="${count}" ${count===effect.count?"selected":""}>${count}</option>`).join("");
  const needsCardType=effect.action==="destroy"||effect.action==="sacrifice"||effect.action==="exile";
  const cardTypeOptions=PLAYER_ACTION_CARD_TYPES.map(type=>`<option value="${type}" ${type===draft.cardType?"selected":""}>${type[0].toUpperCase()+type.slice(1)}</option>`).join("");
  let actionHtml=`<div class="context-section player-effect-section"><div class="context-section-title">Create player action</div>
    <div class="player-action-grid">
      <label>Scope<select id="playerActionScope">${scopeOptions}</select></label>
      <label>Action<select id="playerActionType">${actionOptions}</select></label>
      <label>Amount<select id="playerActionCount">${countOptions}</select></label>
      ${needsCardType?`<label>Card type<select id="playerActionCardType">${cardTypeOptions}</select></label>`:""}
    </div>
    <span class="player-effect-help">Uses the existing CPU hand, library, battlefield, and permanent-removal simulation.</span>
    <div class="player-effect-preview"><strong>${playerEffectSummary(effect)}</strong></div>`;
  if(effect.scope==="target"){
    actionHtml+=`<div class="target-buttons player-effect-targets">${[gameState.player,...aliveOpponents(gameState)].map(target=>`<button type="button" class="target-btn ${draft.targetId===target.id?"active":""}" data-action-target-id="${target.id}">${target.id==="player"?"🗡️":target.ico} ${effectTargetName(target)}</button>`).join("")}</div>`;
  }
  const targets=effectTargets(gameState,effect,draft.targetId);
  if(effect.action==="reanimate"&&targets.length>0){
    actionHtml+='<div class="player-effect-choices"><span>Select creature cards from the chosen graveyard.</span>';
    targets.forEach(owner=>{
      const cards=graveyardCreatureCards(owner);
      actionHtml+=`<div class="player-effect-owner"><span>${owner.id==="player"?"🗡️":owner.ico} ${effectTargetName(owner)}'s graveyard</span>${cards.length?`<div class="kill-select">${cards.map(card=>`<button type="button" class="kill-btn ${(draft.choices[owner.id]||[]).includes(card.id)?"selected":""}" data-reanimate-owner="${owner.id}" data-reanimate-card="${card.id}">${card.ico||"🐾"} ${card.name} (${card.p||1}/${card.t||1})</button>`).join("")}</div>`:"<small>No materialized creature cards.</small>"}</div>`;
    });
    actionHtml+="</div>";
  }
  if(needsCardType&&targets.length>0){
    const cpuTargets=targets.filter(target=>target.id!=="player");
    actionHtml+='<div class="player-effect-choices">';
    if(cpuTargets.length)actionHtml+=`<span>Each affected CPU chooses its least valuable ${effect.cardType} automatically.</span>`;
    if(targets.some(target=>target.id==="player"))actionHtml+=`<div class="player-effect-manual">🗡️ Complete your own ${effect.cardType} selection at the table, then confirm resolution.</div>`;
    actionHtml+="</div>";
  }
  const ready=canResolvePlayerEffect(effect,draft);
  actionHtml+=`<button type="button" class="target-btn player-effect-resolve" id="resolvePlayerAction" ${ready?"":"disabled"}>Resolve action</button></div>`;
  panel.innerHTML=`<div class="context-form commander-form"><div class="context-section"><div class="commander-player-actions"><div class="inline-stepper"><label>Creatures I played</label><button type="button" data-key="creaturesPlayed" data-delta="-1">−</button><input type="number" min="0" value="${draft.creaturesPlayed}" data-key="creaturesPlayed"><button type="button" data-key="creaturesPlayed" data-delta="1">+</button></div></div></div>${actionHtml}</div>`;
  wireSteppers(panel);
  const updateAction=(field,value,resetTarget=false)=>{
    draft.creaturesPlayed=parseInt(panel.querySelector('input[data-key="creaturesPlayed"]')?.value)||0;
    draft[field]=value;draft.choices={};if(resetTarget)draft.targetId=null;renderCommanderMainPhasePanel();
  };
  panel.querySelector('#playerActionScope').onchange=event=>updateAction("scope",event.target.value,true);
  panel.querySelector('#playerActionType').onchange=event=>updateAction("action",event.target.value);
  panel.querySelector('#playerActionCount').onchange=event=>updateAction("count",parseInt(event.target.value));
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
  document.getElementById('huntTitle').textContent="Your Turn · Main Phase";
  document.getElementById('declareTitle').textContent="Main Phase";
  document.getElementById('declareFlavor').textContent="Play lands, cast creatures, and resolve player-targeting effects.";
  document.getElementById('declareMech').innerHTML='';
  document.getElementById('respTitle').textContent="Develop Your Board";
  commanderEffectDraft=null;
  renderCommanderMainPhasePanel();
  setConfirmButton("Go to Combat ▸","",()=>{
    cmdSnapshot();
    const panel=document.getElementById('respGrid');
    const played=parseInt(panel.querySelector('input[data-key="creaturesPlayed"]')?.value)||0;
    if(played>0){gameState.player.creatures+=played;logCommander(`You play ${played} creature(s).`);}
    showCommanderGame();
    playerStep="combat";showPlayerStep();
  },true);
}

/* --- COMBAT — single unified screen showing all opponents --- */
function startCombatStep(){
  document.getElementById('huntTitle').textContent="Your Turn · Combat";
  document.getElementById('declareTitle').textContent="Combat Phase";
  document.getElementById('declareFlavor').textContent="Declare attackers, resolve damage, remove creatures.";
  document.getElementById('declareMech').innerHTML='';
  document.getElementById('respTitle').textContent="Combat";

  const alive=aliveOpponents(gameState);
  const panel=document.getElementById('respGrid');

  // Build a unified combat form: damage per opponent + all creatures grouped by owner
  let html='<div class="context-form commander-form">';

  // Damage section per opponent
  alive.forEach(opp=>{
    html+=`<div class="context-section combat-opp-section" style="border-left:3px solid ${opp.color}">
      <div class="context-section-title">${opp.ico} ${opp.name.split(',')[0]} — ${opp.life} life</div>
      <div class="commander-player-actions">
        <div class="inline-stepper"><label>Damage dealt</label>
          <button type="button" data-opp="${opp.id}" data-key="damage" data-delta="-1">−</button>
          <input type="number" min="0" value="0" data-opp="${opp.id}" data-key="damage">
          <button type="button" data-opp="${opp.id}" data-key="damage" data-delta="1">+</button>
        </div>
        <div class="inline-stepper"><label>Commander damage</label>
          <button type="button" data-opp="${opp.id}" data-key="cmdrDmg" data-delta="-1">−</button>
          <input type="number" min="0" value="0" data-opp="${opp.id}" data-key="cmdrDmg">
          <button type="button" data-opp="${opp.id}" data-key="cmdrDmg" data-delta="1">+</button>
        </div>
      </div>
    </div>`;
  });

  // Your losses
  html+=`<div class="context-section"><div class="context-section-title">Your losses</div>
    <div class="commander-player-actions">
      <div class="inline-stepper"><label>Your creatures that died</label>
        <button type="button" data-key="playerDeaths" data-delta="-1">−</button>
        <input type="number" min="0" value="0" data-key="playerDeaths">
        <button type="button" data-key="playerDeaths" data-delta="1">+</button>
      </div>
    </div></div>`;

  // Creatures killed — grouped by owner
  const anyCreatures=alive.some(o=>o.tokens.length>0);
  if(anyCreatures){
    html+=`<div class="context-section"><div class="context-section-title">Creatures killed (tap to select)</div>`;
    alive.forEach(opp=>{
      if(opp.tokens.length===0)return;
      const tappedCount=opp.tokens.filter(t=>t.attacking).length;
      html+=`<div class="kill-owner-group"><div class="kill-owner-label" style="border-left-color:${opp.color}">${opp.ico} ${opp.name.split(',')[0]}${tappedCount?` · ${tappedCount} tapped`:''}</div>
        <div class="kill-select">${opp.tokens.map((t,i)=>`<button type="button" class="kill-btn ${t.attacking?'is-tapped':''}" data-opp="${opp.id}" data-idx="${i}"><span class="kill-btn-status">${t.attacking?'⟳':'⬡'}</span> ${t.ico} ${t.name} (${t.p}/${t.t})${t.attacking?' <span class="tapped-label">tapped</span>':''}</button>`).join('')}</div>
      </div>`;
    });
    html+=`</div>`;
  }

  html+='</div>';
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

  setConfirmButton("Finish Combat ▸","",()=>resolveFullCombat(panel,alive),true);
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
    logCommander(`${playerDeaths} of your creature(s) died in combat.`);
  }

  showCommanderGame();
  const end=checkCommanderBattleEnd(gameState);
  if(end.over){endCommanderGame(end.won,end.reason);return;}

  playerStep="end";showPlayerStep();
}

/* --- POST-COMBAT MAIN PHASE / END STEP --- */
function finishPlayerTurn(){
  document.getElementById('huntTitle').textContent="Your Turn · Main Phase 2";
  document.getElementById('declareTitle').textContent="Post-combat Main Phase";
  document.getElementById('declareFlavor').textContent="Cast spells, resolve player actions, then complete your end step.";
  document.getElementById('declareMech').innerHTML='';
  document.getElementById('respTitle').textContent="Post-combat Actions";

  // This phase has its own action draft, separate from actions and creatures tracked before combat.
  commanderEffectDraft=null;
  renderCommanderMainPhasePanel();

  setConfirmButton("End Turn ▸","",()=>{
    cmdSnapshot();
    const panel=document.getElementById('respGrid');
    const played=parseInt(panel.querySelector('input[data-key="creaturesPlayed"]')?.value)||0;
    if(played>0){gameState.player.creatures+=played;logCommander(`You play ${played} creature(s) after combat.`);}
    const end=checkCommanderBattleEnd(gameState);
    if(end.over){endCommanderGame(end.won,end.reason);return;}
    gameState.turn++;collectInputsFn=null;saveState();runCpuPhase();
  });
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
  gameState=createCommanderBattle(numOpponents);
  cmdUndoStack=[];
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
  const raw=safeGet(SAVE_KEY);
  if(raw){
    try{
      const parsed=JSON.parse(raw);
      if(parsed._type==="commander"&&!parsed.gameOver){
        gameState=parsed;
        document.getElementById('overlay').classList.remove("show");
        showCommanderGame();
        if(gameState.phase==="player")startPlayerPhase();else runCpuPhase();
        return;
      }
    }catch(e){}
  }
  if(window._adventureEngine&&window._adventureEngine.isActive())return;
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

// Wire reset button (overrides game.js's binding)
const resetBtn=document.getElementById('resetBtn');
if(resetBtn)resetBtn.onclick=()=>{document.getElementById('utilityMenu').classList.remove('show');restart();};

boot();

})();
