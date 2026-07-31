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
  ],
  boardwipes: [
    {name:"Wrath of the Wilds",cost:6,effect:"Destroy all creatures. They can't be regenerated.",wipeType:"symmetric"},
    {name:"Savage Decree",cost:8,effect:"Destroy all creatures target player controls.",wipeType:"targeted"}
  ]
};
const DECK_COMPOSITION = {creatures:14, gear:12, protection:10, draw:5, haymakers:4, utility:6, boardwipes:2};

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
  const deck = {lands:37,ramp:10,explosive:1,other:53};
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
    deck, otherDeck, hand, typedHand:[], landsInPlay:0, rampInPlay:0, explosiveInPlay:0, gear:0, attachedGear:[], graveyardCount:0, graveyard:[], nextGraveyardCardId:0, discardHistory:[], exileCount:0, exile:[], nextExileCardId:0,
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
    kws:[...COMMANDER_BASE.kws],baseKws:[...COMMANDER_BASE.kws],effect:"Commander",summoningSick:true,owner:opp.id});
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
  commander.baseKws=[...new Set([...COMMANDER_BASE.kws,...opp.attachedGear.map(gear=>gear.kw).filter(Boolean)])];
  commander.kws=[...commander.baseKws];
  commander.effect=opp.gear?`Commander — ${opp.gear} gear.`:"Commander";
  if(typeof gameState!=="undefined"&&gameState)applyBattlefieldRuleModifiers();
}
function returnCommanderToZone(opp){opp.tokens=opp.tokens.filter(t=>t.kind!=="commander");opp.commanderZone=true;opp.commanderTax+=2;opp.gear=0;opp.attachedGear=[];}

/* ---------- targeting ---------- */
function threatScore(p){
  const c=p.creatures!=null?p.creatures:(p.tokens?p.tokens.length:0);
  const cmd=p.tokens?p.tokens.some(t=>t.kind==="commander"):false;
  const pwCount=(p.planeswalkers||[]).length;
  // Player always has high baseline threat — in real Commander, the human is
  // the most dangerous because they're unpredictable and may be sandbagging.
  // This ensures CPUs attack the player regularly, not just each other.
  // Planeswalkers significantly increase threat since they generate value every turn.
  const humanBonus=p.id==="player"?20:0;
  return c*3+(cmd?15:0)+(40-p.life)+humanBonus+(pwCount*12);
}

/**
 * Decides whether a CPU should redirect its attack to one of the player's
 * planeswalkers instead of the player's life total. In real MTG, attackers
 * can target planeswalkers. CPUs do this when:
 * - The player has a planeswalker with meaningful loyalty
 * - The planeswalker hasn't already been reduced to low loyalty
 * - Random chance (not every turn — sometimes face is still better)
 * Returns the planeswalker object to target, or null (attack life).
 */
function choosePlaneswalkerTarget(opp, playerState){
  const pws=playerState.planeswalkers||[];
  if(pws.length===0)return null;
  // Higher-loyalty planeswalkers are higher priority targets
  const viable=pws.filter(pw=>pw.loyalty>0).sort((a,b)=>b.loyalty-a.loyalty);
  if(viable.length===0)return null;
  // CPUs prioritize killing planeswalkers ~60% of the time when they exist
  // — they're value engines that must be answered, especially if loyalty is high
  const targetChance=viable[0].loyalty>=5?0.7:viable[0].loyalty>=3?0.55:0.35;
  if(Math.random()<targetChance)return viable[0];
  return null;
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

/* ---------- board wipe strategy ---------- */
/**
 * Evaluates whether the CPU should cast a board wipe this turn.
 * Strategy:
 * - Symmetric (Wrath of the Wilds): Cast when opponents collectively have 4+ more
 *   creatures than you, OR you're about to die and they have a wide board.
 *   Never cast if you have more creatures than all opponents combined.
 * - Targeted (Savage Decree): Cast when a single opponent has 3+ creatures and is
 *   the biggest threat. Prefer targeting whoever has the most board presence.
 *
 * Returns { cast: boolean, manaRemaining: number }
 */
function evaluateAndCastBoardWipe(opp, mana, allPlayers, actions, turnSpellState){
  const wipesInHand=opp.typedHand.filter(c=>c.ref?.category==="boardwipes");
  if(wipesInHand.length===0)return {cast:false,manaRemaining:mana};

  const myCreatureCount=opp.tokens.length;
  const opponents=allPlayers.filter(p=>p.id!==opp.id&&p.life>0);
  const totalEnemyCreatures=opponents.reduce((sum,p)=>{
    const count=p.creatures!=null?p.creatures:(p.tokens?p.tokens.length:0);
    return sum+count;
  },0);

  // Find the most threatening opponent by creature count
  let biggestThreat=null, biggestThreatCount=0;
  opponents.forEach(p=>{
    const count=p.creatures!=null?p.creatures:(p.tokens?p.tokens.length:0);
    if(count>biggestThreatCount){biggestThreatCount=count;biggestThreat=p;}
  });

  // --- Symmetric wipe decision ---
  const symmetricWipe=wipesInHand.find(c=>c.wipeType==="symmetric");
  if(symmetricWipe){
    const casting=cpuCanCast(symmetricWipe,symmetricWipe.cost,mana,"haymakers",turnSpellState);
    if(casting.canCast){
      const boardDeficit=totalEnemyCreatures-myCreatureCount;
      // Cast if enemies have 4+ more creatures, OR life is critical and they have 3+
      const desperate=opp.life<=15&&totalEnemyCreatures>=3;
      if(boardDeficit>=4||desperate){
        mana-=casting.cost;
        opp.typedHand=opp.typedHand.filter(c=>c!==symmetricWipe);
        opp.hand.other=Math.max(0,opp.hand.other-1);
        recordCpuSpellCast(turnSpellState);

        // Remove all of THIS CPU's non-commander creatures
        const myDead=opp.tokens.filter(t=>t.kind!=="commander");
        for(let i=opp.tokens.length-1;i>=0;i--){
          if(opp.tokens[i]&&opp.tokens[i].kind!=="commander")removeOpponentPermanent(opp,`token:${i}`,"graveyard");
        }

        // Remove all OTHER CPU's creatures
        const otherCpus=allPlayers.filter(p=>p.id!==opp.id&&p.id!=="player"&&p.tokens);
        otherCpus.forEach(cpu=>{
          const cpuOpp=(typeof gameState!=="undefined"&&gameState)?gameState.opponents.find(o=>o.id===cpu.id):null;
          if(cpuOpp){
            for(let i=cpuOpp.tokens.length-1;i>=0;i--){
              if(cpuOpp.tokens[i]&&cpuOpp.tokens[i].kind!=="commander")removeOpponentPermanent(cpuOpp,`token:${i}`,"graveyard");
            }
          }
        });

        actions.push({
          label:`⚡ Cast ${symmetricWipe.name}`,
          detail:`${symmetricWipe.effect} All non-commander creatures on every battlefield are destroyed.`,
          boardWipe:"symmetric",
          wipeName:symmetricWipe.name
        });
        return {cast:true,manaRemaining:mana};
      }
    }
  }

  // --- Targeted wipe decision ---
  const targetedWipe=wipesInHand.find(c=>c.wipeType==="targeted");
  if(targetedWipe&&biggestThreat&&biggestThreatCount>=3){
    const casting=cpuCanCast(targetedWipe,targetedWipe.cost,mana,"haymakers",turnSpellState);
    if(casting.canCast){
      // Cast if the biggest threat has 3+ creatures and more than us
      if(biggestThreatCount>myCreatureCount||(biggestThreatCount>=3&&opp.life<=25)){
        mana-=casting.cost;
        opp.typedHand=opp.typedHand.filter(c=>c!==targetedWipe);
        opp.hand.other=Math.max(0,opp.hand.other-1);
        recordCpuSpellCast(turnSpellState);

        // If targeting another CPU, destroy their creatures immediately
        if(biggestThreat.id!=="player"){
          const cpuOpp=(typeof gameState!=="undefined"&&gameState)?gameState.opponents.find(o=>o.id===biggestThreat.id):null;
          if(cpuOpp){
            for(let i=cpuOpp.tokens.length-1;i>=0;i--){
              if(cpuOpp.tokens[i]&&cpuOpp.tokens[i].kind!=="commander")removeOpponentPermanent(cpuOpp,`token:${i}`,"graveyard");
            }
          }
        }
        // If targeting the player, creatures are NOT removed here — the player gets
        // a popup/response window to protect before resolution.

        const targetName=biggestThreat.id==="player"?"You":biggestThreat.name.split(',')[0];
        actions.push({
          label:`⚡ Cast ${targetedWipe.name} targeting ${targetName}`,
          detail:`${targetedWipe.effect} ${targetName}'s creatures are destroyed.`,
          boardWipe:"targeted",
          wipeTarget:biggestThreat.id,
          wipeTargetName:targetName,
          wipeName:targetedWipe.name
        });
        return {cast:true,manaRemaining:mana};
      }
    }
  }

  return {cast:false,manaRemaining:mana};
}

/* ---------- turn execution ---------- */
function executeOpponentTurn(opp, allPlayers) {
  const actions=[];
  const turnSpellState={spellsCast:0};
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
  applyBattlefieldRuleModifiers();
  mana=tryCpuRemoveBattlefieldRule(opp,mana,actions,turnSpellState);

  // Primary action
  if(!commander){
    const cost=commanderCost(opp);
    const commanderCasting=cpuCanCast(null,cost,mana,"commander",turnSpellState);
    const explosiveCasting=cpuCanCast(null,1,mana,"explosive",turnSpellState);
    const rampCasting=cpuCanCast(null,2,mana,"ramp",turnSpellState);
    if(commanderCasting.canCast&&deployCommander(opp)){
      mana-=commanderCasting.cost;
      recordCpuSpellCast(turnSpellState);
      actions.push({label:`Cast ${opp.name}`,detail:"Commander enters."+(commanderCasting.additional?" Creature tax paid: "+commanderCasting.additional+".":"")});
      commander=commanderOnField(opp);
    }else if(opp.hand.explosive>0&&explosiveCasting.canCast){
      opp.hand.explosive--;opp.explosiveInPlay++;mana-=explosiveCasting.cost;
      recordCpuSpellCast(turnSpellState);
      actions.push({label:"Fast mana",detail:"+2 mana next turn."+(explosiveCasting.additional?" Noncreature tax paid: "+explosiveCasting.additional+".":"")});
    }else if(opp.hand.ramp>0&&rampCasting.canCast){
      opp.hand.ramp--;opp.rampInPlay++;mana-=rampCasting.cost;
      recordCpuSpellCast(turnSpellState);
      actions.push({label:"Ramp",detail:"+1 mana next turn."+(rampCasting.additional?" Noncreature tax paid: "+rampCasting.additional+".":"")});
    }
  } else {
    const gearInHand=opp.typedHand.filter(c=>c.ref?.category==="gear");
    const best=gearInHand
      .map(card=>({card,casting:cpuCanCast(card,card.cost,mana,"gear",turnSpellState)}))
      .filter(({card,casting})=>casting.canCast&&casting.cost+(card.equip||0)<=mana)
      .sort((left,right)=>(right.card.bonus/(right.casting.cost+(right.card.equip||0)))-(left.card.bonus/(left.casting.cost+(left.card.equip||0))))[0];
    if(best){
      const gear=best.card;
      mana-=best.casting.cost+(gear.equip||0);
      opp.attachedGear=(opp.attachedGear||[]).concat({name:gear.name,bonus:gear.bonus||0,kw:gear.kw||null});
      refreshCommanderGear(opp);
      opp.typedHand=opp.typedHand.filter(c=>c!==gear);opp.hand.other=Math.max(0,opp.hand.other-1);
      recordCpuSpellCast(turnSpellState);
      actions.push({label:`Equip ${gear.name}`,detail:gear.effect+". Now "+commander.p+"/"+commander.t+"."+(best.casting.additional?" Noncreature tax paid: "+best.casting.additional+".":"")});
    }
  }

  // Board wipe evaluation — cast BEFORE deploying more creatures
  const boardWipeCast=evaluateAndCastBoardWipe(opp,mana,allPlayers,actions,turnSpellState);
  if(boardWipeCast.cast)mana=boardWipeCast.manaRemaining;

  // Secondary: cast creatures with remaining mana (multiple if possible).
  // AI aggressiveness: the more cards and mana available, the more casts allowed.
  // Prevents situations where CPUs sit on 7 cards and 12 mana doing nothing.
  const handTotal=opponentHandSize(opp);
  const maxCreatureCasts=handTotal>=6?5:handTotal>=4?4:3;
  let castCount=0;
  while(mana>=1&&castCount<maxCreatureCasts){
    const castable=opp.typedHand
      .filter(card=>card.ref?.category==="creatures"||card.rampValue)
      .map(card=>({card,casting:cpuCanCast(card,card.cost,mana,"creatures",turnSpellState)}))
      .filter(({casting})=>casting.canCast)
      .sort((left,right)=>right.card.cost-left.card.cost);
    const selected=castable[0];
    if(!selected)break;
    const toCast=selected.card;
    mana-=selected.casting.cost;
    const p=toCast.p||1,t=toCast.t||1;
    const baseKws=toCast.kws?[...toCast.kws]:[];
    opp.tokens.push({name:toCast.name,ico:toCast.ico||"🐾",kind:toCast.rampValue?"voltron-support":"voltron-creature",
      type:"Creature",p,t,baseP:p,baseT:t,kws:[...baseKws],baseKws,effect:toCast.effect||"",summoningSick:!toCast.haste,owner:opp.id});
    if(toCast.rampValue)opp.rampInPlay+=toCast.rampValue;
    opp.typedHand=opp.typedHand.filter(c=>c!==toCast);opp.hand.other=Math.max(0,opp.hand.other-1);
    recordCpuSpellCast(turnSpellState);
    actions.push({label:`Cast ${toCast.name}`,detail:`${p}/${t} enters.`+(selected.casting.additional?" Creature tax paid: "+selected.casting.additional+".":"")});
    castCount++;
  }
  // Fallback: spend remaining ramp hand slots as a modeled creature if hand has them.
  const fallbackRampCasting=cpuCanCast(null,2,mana,"creatures",turnSpellState);
  if(castCount===0&&opp.hand.ramp>0&&!commander&&fallbackRampCasting.canCast){
    opp.hand.ramp--;opp.rampInPlay++;
    opp.tokens.push({name:"Wilds Guide",ico:"🌿",kind:"voltron-support",type:"Creature — Shaman",p:2,t:2,baseP:2,baseT:2,kws:[],baseKws:[],effect:"Taps for mana.",summoningSick:true,owner:opp.id});
    mana-=fallbackRampCasting.cost;
    recordCpuSpellCast(turnSpellState);
    actions.push({label:"Cast Wilds Guide",detail:"2/2 ramp creature enters."+(fallbackRampCasting.additional?" Creature tax paid: "+fallbackRampCasting.additional+".":"")});
  }

  // Tertiary: with remaining mana, cast non-creature spells (draw, utility, haymakers)
  // to develop the board instead of passing with a full hand.
  if(mana>=2&&opp.typedHand.length>0){
    const nonCreatureSpells=opp.typedHand
      .filter(card=>!card.rampValue&&card.ref?.category!=="creatures"&&card.ref?.category!=="gear"&&card.ref?.category!=="protection"&&card.ref?.category!=="boardwipes")
      .map(card=>({card,casting:cpuCanCast(card,card.cost,mana,card.ref?.category,turnSpellState)}))
      .filter(({casting})=>casting.canCast)
      .sort((left,right)=>left.card.cost-right.card.cost);
    let spellsCast=0;
    for(const entry of nonCreatureSpells){
      if(spellsCast>=2)break;
      if(mana<entry.casting.cost)continue;
      mana-=entry.casting.cost;
      const card=entry.card;
      opp.typedHand=opp.typedHand.filter(c=>c!==card);opp.hand.other=Math.max(0,opp.hand.other-1);
      recordCpuSpellCast(turnSpellState);
      if(card.ref?.category==="draw"){
        const extraDraws=Math.min(3,opp.otherDeck?.length||0);
        for(let i=0;i<extraDraws;i++){if(opp.otherDeck.length>0){const ref=opp.otherDeck.pop();opp.typedHand.push({...resolveCard(ref),ref});opp.hand.other++;}}
        actions.push({label:`Cast ${card.name}`,detail:`${card.effect} Draws ${extraDraws} card${extraDraws===1?"":"s"}.`});
      }else{
        addOpponentGraveyardCard(opp,typedGraveyardCard(card));
        actions.push({label:`Cast ${card.name}`,detail:card.effect||"Resolves a spell."});
      }
      spellsCast++;
    }
  }
  applyBattlefieldRuleModifiers();

  // Choose target & declare attackers
  const target=chooseTarget(opp,allPlayers);
  opp.attackTarget=target;
  let attackPower=0; let commanderAttacking=false;

  // Get defender's tokens for smart attack evaluation (only for CPU targets)
  const defenderOpp=target&&target!=="player"?allPlayers.find(p=>p.id===target):null;
  const defenderTokens=defenderOpp&&defenderOpp.tokens?defenderOpp.tokens:[];

  if(cpuCreaturesCannotAttack()){
    opp.tokens.forEach(token=>{token.attacking=false;});
    const restriction=activeBattlefieldRules("cpuCreatureAttackBan")[0];
    actions.push({label:"Combat restricted",detail:`${restriction.sourceName||"A battlefield rule"} prevents CPU creatures from attacking.`});
  }else if(target==="player"||defenderTokens.length===0){
    // Attacking player or an opponent with no blockers: be aggressive
    opp.tokens.forEach(t=>{
      t.attacking=false;
      if(t.summoningSick)return;
      if(t.kind==="commander"){t.attacking=true;commanderAttacking=true;attackPower+=t.p;return;}
      if(t.kind==="voltron-support"&&t.effect&&t.effect.includes("mana"))return;
      if(t.p>=2){t.attacking=true;attackPower+=t.p;}
    });
  }else{
    // Attacking another CPU: evaluate each creature's profitability
    opp.tokens.forEach(t=>{t.attacking=false;});
    const smartAttackers=smartDeclareAttackers(opp, defenderTokens);
    smartAttackers.forEach(t=>{
      t.attacking=true;
      attackPower+=t.p;
      if(t.kind==="commander")commanderAttacking=true;
    });
  }
  opp.attackPower=attackPower;

  // When attacking the player, decide if some/all attackers should target a planeswalker
  let planeswalkerTarget=null;
  if(attackPower>0&&target==="player"&&typeof gameState!=="undefined"&&gameState){
    planeswalkerTarget=choosePlaneswalkerTarget(opp,gameState.player);
  }
  opp._planeswalkerTarget=planeswalkerTarget;

  if(attackPower>0&&target){
    const tn=allPlayers.find(p=>p.id===target);
    let attackLabel=`Attack ${tn?tn.name.split(',')[0]:"?"} for ${attackPower}`;
    let attackDetail=`${opp.tokens.filter(t=>t.attacking).length} attacker(s). Strategy: ${STRATEGY_LABELS[opp.currentStrategy]}.`;
    if(planeswalkerTarget){
      attackLabel=`Attack ${planeswalkerTarget.name} (⬡ ${planeswalkerTarget.loyalty}) for ${attackPower}`;
      attackDetail=`Targeting your planeswalker. ${opp.tokens.filter(t=>t.attacking).length} attacker(s). Strategy: ${STRATEGY_LABELS[opp.currentStrategy]}.`;
    }
    actions.push({label:attackLabel,detail:attackDetail});
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
  return {target,attackPower,commanderAttacking,actions,planeswalkerTarget};
}

/* =====================================================================
   COMMANDER BATTLE — Game state & orchestration
   ===================================================================== */
function createCommanderBattle(numOpponents) {
  const opponents=[];
  for(let i=0;i<Math.min(4,Math.max(1,numOpponents));i++) opponents.push(createOpponent(i));
  return {
    gameMode:"commanderBattle", turn:1, phase:"cpu", cpuTurnIndex:0,
    opponents, player:{id:"player",name:"You",life:40,creatures:0,handSize:7,librarySize:92,graveyardCount:0,graveyard:[],nextGraveyardCardId:0,discardHistory:[],exileCount:0,exile:[],nextExileCardId:0,commanderDamageReceived:{},commanderDamageDealt:{},tokens:[],planeswalkers:[]},
    battlefieldRules:[], nextBattlefieldRuleId:0,
    discardHistory:[], log:[], viewMode:"all", viewTarget:0, gameOver:false, winner:null,
  };
}

function playerAsTarget(state){return {id:"player",name:"You",life:state.player.life,creatures:state.player.creatures,tokens:state.player.tokens||[],planeswalkers:state.player.planeswalkers||[]};}
function allPlayersForTargeting(state){const all=[playerAsTarget(state)];state.opponents.forEach(o=>{if(!isOpponentDead(o))all.push(o);});return all;}
function aliveOpponents(state){return state.opponents.filter(o=>!isOpponentDead(o));}
function isPlayerDead(state){
  if(state.player.life<=0)return true;
  for(const[,dmg]of Object.entries(state.player.commanderDamageReceived)){if(dmg>=21)return true;}
  return false;
}

/* =====================================================================
   CPU-vs-CPU COMBAT SYSTEM
   Strategic attack decisions and blocking logic.
   ===================================================================== */

function hasKeyword(creature,keyword){
  return (creature.kws||[]).some(value=>String(value).toLowerCase()===keyword.toLowerCase());
}
function creatureCombatValue(creature){
  return (creature.p||0)+(creature.t||0)+(hasKeyword(creature,"Deathtouch")?3:0)+(hasKeyword(creature,"Trample")?2:0);
}
function combatDamageKills(source,target){
  if(hasKeyword(target,"Indestructible"))return false;
  if(hasKeyword(source,"Deathtouch"))return (source.p||0)>0;
  return (source.p||0)>=(target.t||0);
}
function creatureSurvivesCombat(creature,opponent){return !combatDamageKills(opponent,creature);}
function trampleOverflow(attacker,blocker){
  if(!hasKeyword(attacker,"Trample"))return 0;
  const lethal=hasKeyword(attacker,"Deathtouch")?1:Math.max(0,blocker.t||0);
  return Math.max(0,(attacker.p||0)-lethal);
}
function resolveSingleBlock(attacker,blocker){
  const attackerStrikesFirst=hasKeyword(attacker,"First Strike")||hasKeyword(attacker,"Double Strike");
  const blockerStrikesFirst=hasKeyword(blocker,"First Strike")||hasKeyword(blocker,"Double Strike");
  let attackerDies=false,blockerDies=false;
  if(attackerStrikesFirst&&!blockerStrikesFirst){
    blockerDies=combatDamageKills(attacker,blocker);
    if(!blockerDies)attackerDies=combatDamageKills(blocker,attacker);
  }else if(blockerStrikesFirst&&!attackerStrikesFirst){
    attackerDies=combatDamageKills(blocker,attacker);
    if(!attackerDies)blockerDies=combatDamageKills(attacker,blocker);
  }else{
    attackerDies=combatDamageKills(blocker,attacker);
    blockerDies=combatDamageKills(attacker,blocker);
  }
  return {attackerDies,blockerDies,trampleDamage:trampleOverflow(attacker,blocker)};
}

/**
 * Evaluate if an attacker would survive or trade favorably against the
 * defender's available blockers. Returns a score:
 *  > 0  = profitable (attacker likely gets through or wins the trade)
 *  <= 0 = bad trade (attacker would die to a cheaper/equal blocker)
 */
function evaluateAttackProfitability(attacker, defenderTokens){
  // No blockers = free damage
  if(defenderTokens.length===0)return 10;

  // Find the best blocker the defender could assign (highest power that survives or trades)
  const possibleBlockers=defenderTokens.filter(t=>!t.summoningSick);
  if(possibleBlockers.length===0)return 10;

  const killsAttacker=possibleBlockers.filter(b=>combatDamageKills(b,attacker));
  // Check if attacker can kill the blocker it fights
  const attackerKills=possibleBlockers.filter(b=>combatDamageKills(attacker,b));

  // Commander always attacks — voltron pressure is worth the risk
  if(attacker.kind==="commander")return 8;

  // Attacker has trample — even if blocked, damage gets through
  if(attacker.kws&&attacker.kws.includes("Trample"))return 5;

  // If nobody can kill the attacker, it's always profitable
  if(killsAttacker.length===0)return 7;

  // If attacker would die but can't kill anything back — terrible trade
  if(killsAttacker.length>0&&attackerKills.length===0)return -5;

  // Mutual trade: evaluate if the trade is worth it
  // Attacker is worth more if it has higher power (it threatens more)
  // Blocker assigned will be the smallest that can kill the attacker
  const cheapestKiller=killsAttacker.sort((a,b)=>(a.p+a.t)-(b.p+b.t))[0];

  // If attacker can kill the blocker that would kill it — mutual trade
  if(combatDamageKills(attacker,cheapestKiller)){
    // Trade up: our creature is smaller/equal → good trade if their creature is bigger
    const attackerValue=creatureCombatValue(attacker);
    const blockerValue=creatureCombatValue(cheapestKiller);
    if(blockerValue>attackerValue)return 3; // we trade a smaller creature for a bigger one
    if(blockerValue===attackerValue)return 1; // even trade, slightly positive (pressure)
    return -2; // we lose a bigger creature for their smaller one
  }

  // Attacker dies, can't kill the blocker — bad
  return -4;
}

/**
 * Smart attack declaration for CPU-vs-CPU.
 * Evaluates each creature's profitability against the defender's board.
 * Returns array of tokens that should attack.
 */
function smartDeclareAttackers(opp, defenderTokens){
  const candidates=opp.tokens.filter(t=>!t.summoningSick);
  const attackers=[];

  for(const t of candidates){
    // Mana dorks never attack — their ramp value exceeds combat value
    if(t.kind==="voltron-support"&&t.effect&&t.effect.includes("mana"))continue;

    // Commander always attacks
    if(t.kind==="commander"){attackers.push(t);continue;}

    // Evaluate profitability
    const score=evaluateAttackProfitability(t, defenderTokens);

    // Only attack if the trade is at least neutral
    if(score>0){
      attackers.push(t);
    }
  }

  return attackers;
}

/**
 * CPU blocking logic: defender assigns blockers strategically.
 * Returns an array of {attacker, blocker} pairs and unblocked attackers.
 *
 * Strategy:
 * - Block lethal threats (commander, big hitters) if we can trade favorably
 * - Chump-block (sacrifice a small creature) if life is critical
 * - Let small damage through to preserve board if life is healthy
 * - Never block if the blocker would die without killing the attacker AND life is safe
 */
function cpuAssignBlockers(defender, attackers){
  if(cpuCreaturesCannotBlock())return {assignments:[],unblocked:[...attackers]};
  const available=defender.tokens.filter(t=>!t.summoningSick&&!t.attacking);
  const assignments=[]; // {attacker, blocker}
  const used=new Set();
  const defenderLife=defender.life;

  // Total incoming if we block nothing
  const totalIncoming=attackers.reduce((s,a)=>s+a.p,0);

  // Sort attackers by threat: commander first, then by power descending
  const sorted=[...attackers].sort((a,b)=>{
    if(a.kind==="commander"&&b.kind!=="commander")return -1;
    if(b.kind==="commander"&&a.kind!=="commander")return 1;
    return b.p-a.p;
  });

  for(const attacker of sorted){
    // Find blockers that can kill this attacker, survive it, or do both.
    const canKill=available.filter(b=>!used.has(b)&&combatDamageKills(b,attacker));
    const survives=available.filter(b=>!used.has(b)&&creatureSurvivesCombat(b,attacker));
    const perfectBlocks=available.filter(b=>!used.has(b)&&combatDamageKills(b,attacker)&&creatureSurvivesCombat(b,attacker));

    // Priority 1: Perfect block (we kill their creature, ours lives)
    if(perfectBlocks.length>0){
      // Use the smallest perfect blocker (preserve big creatures for later)
      const best=perfectBlocks.sort((a,b)=>(a.p+a.t)-(b.p+b.t))[0];
      assignments.push({attacker,blocker:best});
      used.add(best);
      continue;
    }

    // Priority 2: Favorable trade (we both die, but their creature is more valuable)
    const favorableTrades=canKill.filter(b=>creatureCombatValue(attacker)>creatureCombatValue(b));
    if(favorableTrades.length>0){
      const best=favorableTrades.sort((a,b)=>(a.p+a.t)-(b.p+b.t))[0];
      assignments.push({attacker,blocker:best});
      used.add(best);
      continue;
    }

    // Priority 3: Even trade — block commander or big threats to prevent damage
    if(attacker.kind==="commander"||attacker.p>=5){
      const evenTrades=canKill.filter(b=>creatureCombatValue(attacker)>=creatureCombatValue(b));
      if(evenTrades.length>0){
        const best=evenTrades.sort((a,b)=>(a.p+a.t)-(b.p+b.t))[0];
        assignments.push({attacker,blocker:best});
        used.add(best);
        continue;
      }
    }

    // Priority 4: Chump block if life is critical (<=15) and attacker is big
    if(defenderLife<=15&&attacker.p>=4){
      const chumps=available.filter(b=>!used.has(b)&&b.kind!=="commander").sort((a,b)=>(a.p+a.t)-(b.p+b.t));
      if(chumps.length>0){
        assignments.push({attacker,blocker:chumps[0]});
        used.add(chumps[0]);
        continue;
      }
    }

    // Priority 5: Block with a surviving creature to prevent damage (no trade)
    // Only if this attacker's damage is significant relative to our life
    if(attacker.p>=3&&defenderLife<=25&&survives.length>0){
      const best=survives.filter(b=>!used.has(b)).sort((a,b)=>(a.p+a.t)-(b.p+b.t))[0];
      if(best){
        assignments.push({attacker,blocker:best});
        used.add(best);
        continue;
      }
    }

    // Otherwise: let it through — we'd rather preserve our board than chump
  }

  // Determine unblocked attackers
  const blockedSet=new Set(assignments.map(a=>a.attacker));
  const unblocked=attackers.filter(a=>!blockedSet.has(a));

  return {assignments, unblocked};
}

/**
 * Resolve combat between CPU attacker and CPU defender.
 * Returns { damageToDefender, defenderCreaturesKilled[], attackerCreaturesKilled[], blocked[] }
 */
function resolveCpuCombat(attackerOpp, defenderOpp, attackers){
  const {assignments,unblocked}=cpuAssignBlockers(defenderOpp,attackers);
  const defenderCreaturesKilled=[];
  const attackerCreaturesKilled=[];
  const blockedDescriptions=[];
  let trampleDamage=0;
  let commanderDamage=0;

  for(const {attacker,blocker} of assignments){
    const outcome=resolveSingleBlock(attacker,blocker);
    if(outcome.blockerDies)defenderCreaturesKilled.push(blocker);
    if(outcome.attackerDies)attackerCreaturesKilled.push(attacker);
    trampleDamage+=outcome.trampleDamage;
    if(attacker.kind==="commander")commanderDamage+=outcome.trampleDamage;
    blockedDescriptions.push({
      attacker:attacker.name,
      blocker:blocker.name,
      attackerDies:outcome.attackerDies,
      blockerDies:outcome.blockerDies,
      trampleDamage:outcome.trampleDamage
    });
  }

  const unblockedDamage=unblocked.reduce((sum,attacker)=>sum+(attacker.p||0),0);
  const unblockedCommanderDamage=unblocked
    .filter(attacker=>attacker.kind==="commander")
    .reduce((sum,attacker)=>sum+(attacker.p||0),0);
  commanderDamage+=unblockedCommanderDamage;

  return {
    damageToDefender:unblockedDamage+trampleDamage,
    commanderDamage,
    defenderCreaturesKilled,
    attackerCreaturesKilled,
    blockedDescriptions,
    unblocked
  };
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
          // Full combat resolution with blocking
          const attackers=opp.tokens.filter(t=>t.attacking);
          const combat=resolveCpuCombat(opp, tgt, attackers);
          const prevention=applyCpuDamagePrevention(combat.damageToDefender,combat.commanderDamage);

          // Apply life damage
          if(prevention.damage>0){
            tgt.life=Math.max(0,tgt.life-prevention.damage);
            tgt.damageLog[opp.id]=(tgt.damageLog[opp.id]||0)+prevention.damage;
            tgt.lastAttacker=opp.id;
          }
          // Commander damage
          if(prevention.commanderDamage>0){
            tgt.commanderDamageReceived[opp.id]=(tgt.commanderDamageReceived[opp.id]||0)+prevention.commanderDamage;
          }
          if(prevention.reduced)logCommander(`Battlefield damage reduction lowers ${opp.name.split(',')[0]}'s combat damage by ${prevention.reduced}.`);
          if(prevention.prevented)logCommander(`Battlefield prevention stops ${prevention.prevented} damage from ${opp.name.split(',')[0]}.`);

          // Remove killed defender creatures
          for(const dead of combat.defenderCreaturesKilled){
            const idx=tgt.tokens.indexOf(dead);
            if(idx>=0){
              const moved=removeOpponentPermanent(tgt,`token:${idx}`,"graveyard");
              if(moved)logCommander(`${dead.name} (${tgt.name.split(',')[0]}) dies blocking → ${moved.destination}.`);
            }
          }
          // Remove killed attacker creatures
          for(const dead of combat.attackerCreaturesKilled){
            const idx=opp.tokens.indexOf(dead);
            if(idx>=0){
              const moved=removeOpponentPermanent(opp,`token:${idx}`,"graveyard");
              if(moved)logCommander(`${dead.name} (${opp.name.split(',')[0]}) dies in combat → ${moved.destination}.`);
            }
          }

          // Log combat summary
          if(combat.blockedDescriptions.length>0){
            const blockSummary=combat.blockedDescriptions.map(b=>{
              if(b.attackerDies&&b.blockerDies)return `${b.attacker} trades with ${b.blocker}`;
              if(b.attackerDies)return `${b.blocker} kills ${b.attacker}`;
              if(b.blockerDies)return `${b.attacker} kills ${b.blocker}`;
              return `${b.blocker} blocks ${b.attacker}`;
            }).join("; ");
            logCommander(`Combat: ${blockSummary}.`);
          }
          if(prevention.damage>0){
            logCommander(`${combat.unblocked.length} unblocked → ${prevention.damage} damage to ${tgt.name.split(',')[0]}. Life → ${tgt.life}.`);
          }else if(attackers.length>0&&(combat.blockedDescriptions.length>0||prevention.prevented||prevention.reduced)){
            logCommander(`${tgt.name.split(',')[0]} takes no combat damage from ${opp.name.split(',')[0]}.`);
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
  {value:"exileGraveyards",label:"Exile all graveyards"},
  {value:"reanimate",label:"Resurrect selected creatures to your battlefield"},
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
  player.exile=player.exile||[];
  player.nextExileCardId=player.nextExileCardId||player.exile.length;
  player.planeswalkers=player.planeswalkers||[];
  state.discardHistory=state.discardHistory||[];
  state.battlefieldRules=state.battlefieldRules||[];
  state.nextBattlefieldRuleId=state.nextBattlefieldRuleId||state.battlefieldRules.length;
  (state.opponents||[]).forEach(opp=>{
    opp.typedHand=opp.typedHand||[];
    opp.graveyardCount=opp.graveyardCount||0;
    opp.graveyard=opp.graveyard||[];
    opp.nextGraveyardCardId=opp.nextGraveyardCardId||opp.graveyard.length;
    opp.discardHistory=opp.discardHistory||[];
    opp.exileCount=opp.exileCount||0;
    opp.exile=opp.exile||[];
    opp.nextExileCardId=opp.nextExileCardId||opp.exile.length;
    opp.attachedGear=opp.attachedGear||[];
    if(opp.attachedGear.length===0&&opp.gear>0){
      opp.attachedGear=Array.from({length:opp.gear},(_,index)=>({name:`Equipment ${index+1}`,bonus:0,kw:null}));
    }
    opp.gear=opp.attachedGear.length;
  });
}

const BATTLEFIELD_RULE_TYPES=[
  {value:"artifactCastBan",group:"Can / can't rules",label:"CPU artifacts can't be cast"},
  {value:"noncreatureCastBan",group:"Can / can't rules",label:"CPU noncreature spells can't be cast"},
  {value:"cpuSpellLimit",group:"Can / can't rules",label:"CPU can cast only one spell per turn"},
  {value:"cpuCreatureAttackBan",group:"Can / can't rules",label:"CPU creatures can't attack"},
  {value:"cpuCreatureBlockBan",group:"Can / can't rules",label:"CPU creatures can't block"},
  {value:"noncreatureTax",group:"Cost",label:"CPU noncreature spells cost more"},
  {value:"creatureTax",group:"Cost",label:"CPU creature spells cost more"},
  {value:"preventCpuDamage",group:"Replacement / prevention",label:"Prevent the next CPU damage"},
  {value:"cpuGraveyardExile",group:"Replacement / prevention",label:"CPU cards going to graveyards are exiled instead"},
  {value:"cpuDamageReduction",group:"Replacement / prevention",label:"CPU combat damage is reduced"},
  {value:"cpuCreaturePT",group:"Continuous effects & layers",label:"CPU creatures get +X/+Y"},
  {value:"cpuCreatureMinusPT",group:"Continuous effects & layers",label:"CPU creatures get -X/-Y"},
  {value:"cpuCreaturePowerCap",group:"Continuous effects & layers",label:"CPU creature power can't exceed X"},
  {value:"cpuCreatureKeywordLoss",group:"Continuous effects & layers",label:"CPU creatures lose modeled keywords"}
];
let battlefieldRuleDraft={kind:"artifactCastBan",sourceName:"",sourceType:"Enchantment",amount:2,power:1,toughness:1};

function battlefieldRules(){return gameState?.battlefieldRules||[];}
function activeBattlefieldRules(kind){return battlefieldRules().filter(rule=>!kind||rule.kind===kind);}
function battlefieldRuleLabel(rule){
  const source=rule.sourceName||"Unnamed rule";
  switch(rule.kind){
    case "artifactCastBan":return `${source} — CPU artifacts can't be cast`;
    case "noncreatureCastBan":return `${source} — CPU noncreature spells can't be cast`;
    case "cpuSpellLimit":return `${source} — CPU can cast only one spell each turn`;
    case "cpuCreatureAttackBan":return `${source} — CPU creatures can't attack`;
    case "cpuCreatureBlockBan":return `${source} — CPU creatures can't block`;
    case "noncreatureTax":return `${source} — CPU noncreature spells cost ${rule.amount} more`;
    case "creatureTax":return `${source} — CPU creature spells cost ${rule.amount} more`;
    case "preventCpuDamage":return `${source} — prevent next ${rule.remaining||0} CPU damage`;
    case "cpuGraveyardExile":return `${source} — CPU cards going to graveyards are exiled instead`;
    case "cpuDamageReduction":return `${source} — CPU combat damage is reduced by ${rule.amount}`;
    case "cpuCreaturePT":return `${source} — CPU creatures get ${formatSigned(rule.power)}/${formatSigned(rule.toughness)}`;
    case "cpuCreatureMinusPT":return `${source} — CPU creatures get -${Math.max(0,parseInt(rule.power)||0)}/-${Math.max(0,parseInt(rule.toughness)||0)}`;
    case "cpuCreaturePowerCap":return `${source} — CPU creature power can't exceed ${rule.amount}`;
    case "cpuCreatureKeywordLoss":return `${source} — CPU creatures lose modeled keywords`;
    default:return source;
  }
}
function formatSigned(value){const amount=parseInt(value)||0;return `${amount>=0?"+":""}${amount}`;}
function isPersistentBattlefieldRule(rule){return rule.kind!=="preventCpuDamage";}
function cpuCreatureModifier(){
  const bonus=activeBattlefieldRules("cpuCreaturePT").reduce((modifier,rule)=>({
    power:modifier.power+(parseInt(rule.power)||0),
    toughness:modifier.toughness+(parseInt(rule.toughness)||0)
  }),{power:0,toughness:0});
  const reduction=activeBattlefieldRules("cpuCreatureMinusPT").reduce((modifier,rule)=>({
    power:modifier.power+Math.max(0,parseInt(rule.power)||0),
    toughness:modifier.toughness+Math.max(0,parseInt(rule.toughness)||0)
  }),{power:0,toughness:0});
  return {power:bonus.power-reduction.power,toughness:bonus.toughness-reduction.toughness};
}
function cpuCreaturePowerCap(){
  const caps=activeBattlefieldRules("cpuCreaturePowerCap").map(rule=>Math.max(0,parseInt(rule.amount)||0));
  return caps.length?Math.min(...caps):Infinity;
}
function cpuCreaturesLoseModeledKeywords(){return activeBattlefieldRules("cpuCreatureKeywordLoss").length>0;}
function applyBattlefieldRuleModifiers(){
  if(!gameState)return;
  const modifier=cpuCreatureModifier();
  const powerCap=cpuCreaturePowerCap();
  const removeKeywords=cpuCreaturesLoseModeledKeywords();
  const defeated=[];
  gameState.opponents.forEach(opp=>{
    opp.tokens.forEach(token=>{
      if(token.baseP==null)token.baseP=token.p||0;
      if(token.baseT==null)token.baseT=token.t||0;
      if(token.baseKws==null)token.baseKws=[...(token.kws||[])];
      token.p=Math.max(0,Math.min(powerCap,token.baseP+modifier.power));
      token.t=token.baseT+modifier.toughness;
      token.kws=removeKeywords?[]:[...token.baseKws];
      if(token.t<=0)defeated.push({opp,token});
    });
  });
  defeated.forEach(({opp,token})=>{
    const index=opp.tokens.indexOf(token);
    if(index<0)return;
    const moved=removeOpponentPermanent(opp,`token:${index}`,"graveyard");
    if(moved)logCommander(`${token.name} has 0 or less toughness and leaves the battlefield → ${moved.destination}.`);
  });
}
function cpuSpellDescriptor(card,category){
  const resolvedCategory=category||card?.ref?.category;
  if(resolvedCategory==="commander"||resolvedCategory==="creatures"||card?.isCreature||card?.rampValue)return {types:["Creature"],nonCreature:false};
  if(resolvedCategory==="gear"||resolvedCategory==="explosive"||card?.name==="Skullclamp")return {types:["Artifact"],nonCreature:true};
  if(resolvedCategory==="ramp"||resolvedCategory==="draw"||resolvedCategory==="haymakers"||resolvedCategory==="boardwipes")return {types:["Sorcery"],nonCreature:true};
  if(resolvedCategory==="protection")return {types:["Instant"],nonCreature:true};
  if(resolvedCategory==="utility")return {types:["Enchantment"],nonCreature:true};
  return {types:["Sorcery"],nonCreature:true};
}
function cpuCastingRequirement(card,baseCost,category){
  const descriptor=cpuSpellDescriptor(card,category);
  if(descriptor.types.includes("Artifact")&&activeBattlefieldRules("artifactCastBan").length)return {allowed:false,cost:Infinity,reason:"artifacts can't be cast"};
  if(descriptor.nonCreature&&activeBattlefieldRules("noncreatureCastBan").length)return {allowed:false,cost:Infinity,reason:"noncreature spells can't be cast"};
  const noncreatureTax=descriptor.nonCreature?activeBattlefieldRules("noncreatureTax").reduce((sum,rule)=>sum+(parseInt(rule.amount)||0),0):0;
  const creatureTax=descriptor.types.includes("Creature")?activeBattlefieldRules("creatureTax").reduce((sum,rule)=>sum+(parseInt(rule.amount)||0),0):0;
  const additional=noncreatureTax+creatureTax;
  return {allowed:true,cost:Math.max(0,(baseCost||0)+additional),additional,descriptor};
}
function cpuSpellLimitReached(turnSpellState){return activeBattlefieldRules("cpuSpellLimit").length>0&&(turnSpellState?.spellsCast||0)>=1;}
function recordCpuSpellCast(turnSpellState){if(turnSpellState)turnSpellState.spellsCast=(turnSpellState.spellsCast||0)+1;}
function cpuCanCast(card,baseCost,mana,category,turnSpellState){
  const requirement=cpuCastingRequirement(card,baseCost,category);
  if(requirement.allowed&&cpuSpellLimitReached(turnSpellState))return {...requirement,allowed:false,reason:"only one spell can be cast each turn",canCast:false};
  return {...requirement,canCast:requirement.allowed&&mana>=requirement.cost};
}
function cpuCreaturesCannotAttack(){return activeBattlefieldRules("cpuCreatureAttackBan").length>0;}
function cpuCreaturesCannotBlock(){return activeBattlefieldRules("cpuCreatureBlockBan").length>0;}
function cpuCardsGoToExileInstead(){return activeBattlefieldRules("cpuGraveyardExile").length>0;}
function battlefieldRuleRemovalPriority(rule){
  return {cpuSpellLimit:60,artifactCastBan:55,noncreatureCastBan:50,creatureTax:45,noncreatureTax:40,cpuCreatureAttackBan:35,cpuCreatureBlockBan:35,cpuGraveyardExile:30,cpuDamageReduction:25,cpuCreatureKeywordLoss:20,cpuCreaturePowerCap:20,cpuCreaturePT:20,cpuCreatureMinusPT:20}[rule.kind]||0;
}
function canCpuRemovalAffectRule(card,rule){
  if(card.name==="Beast Within"||card.name==="Chaos Warp")return true;
  return card.name==="Return to Nature"&&["Artifact","Enchantment"].includes(rule.sourceType);
}
function findCpuRuleRemoval(opp,mana,turnSpellState){
  const rules=activeBattlefieldRules().filter(isPersistentBattlefieldRule).sort((left,right)=>battlefieldRuleRemovalPriority(right)-battlefieldRuleRemovalPriority(left));
  if(!rules.length)return null;
  const answers=opp.typedHand
    .map((card,index)=>({card,index}))
    .filter(({card})=>["Beast Within","Chaos Warp","Return to Nature"].includes(card.name));
  for(const rule of rules){
    for(const answer of answers){
      const casting=cpuCanCast(answer.card,answer.card.cost,mana,undefined,turnSpellState);
      if(casting.canCast&&canCpuRemovalAffectRule(answer.card,rule))return {...answer,rule,casting};
    }
  }
  return null;
}
function tryCpuRemoveBattlefieldRule(opp,mana,actions,turnSpellState){
  const answer=findCpuRuleRemoval(opp,mana,turnSpellState);
  if(!answer)return mana;
  mana-=answer.casting.cost;
  const [card]=opp.typedHand.splice(answer.index,1);
  opp.hand.other=Math.max(0,(opp.hand.other||0)-1);
  const graveyardCard=typedGraveyardCard(card);
  addOpponentGraveyardCard(opp,graveyardCard);
  recordCpuSpellCast(turnSpellState);
  gameState.battlefieldRules=gameState.battlefieldRules.filter(rule=>rule.id!==answer.rule.id);
  applyBattlefieldRuleModifiers();
  actions.push({label:`Cast ${card.name}`,detail:`Removes ${battlefieldRuleLabel(answer.rule)}.`});
  logCommander(`${opp.name.split(",")[0]} casts ${card.name} to remove ${answer.rule.sourceName||"a battlefield rule"}.`);
  return mana;
}
function applyCpuDamagePrevention(damage,commanderDamage){
  let remainingDamage=Math.max(0,damage||0);
  let remainingCommanderDamage=Math.max(0,commanderDamage||0);
  const damageReduction=activeBattlefieldRules("cpuDamageReduction").reduce((sum,rule)=>sum+(parseInt(rule.amount)||0),0);
  const reduced=Math.min(remainingDamage,damageReduction);
  remainingDamage-=reduced;
  remainingCommanderDamage=Math.max(0,remainingCommanderDamage-reduced);
  let prevented=0;
  activeBattlefieldRules("preventCpuDamage").forEach(rule=>{
    if(remainingDamage<=0||!rule.remaining)return;
    const absorbed=Math.min(remainingDamage,rule.remaining);
    rule.remaining-=absorbed;
    remainingDamage-=absorbed;
    const commanderAbsorbed=Math.min(remainingCommanderDamage,absorbed);
    remainingCommanderDamage-=commanderAbsorbed;
    prevented+=absorbed;
  });
  if(prevented)gameState.battlefieldRules=gameState.battlefieldRules.filter(rule=>rule.kind!=="preventCpuDamage"||rule.remaining>0);
  return {damage:remainingDamage,commanderDamage:remainingCommanderDamage,prevented,reduced};
}
function addBattlefieldRule(draft){
  const kind=draft.kind;
  const sourceName=(draft.sourceName||"").trim()||"Unnamed battlefield rule";
  const rule={
    id:`rule:${++gameState.nextBattlefieldRuleId}`,
    kind,
    sourceName,
    sourceType:draft.sourceType||"Enchantment",
    amount:Math.max(0,parseInt(draft.amount)||0),
    power:kind==="cpuCreatureMinusPT"?Math.max(0,parseInt(draft.power)||0):parseInt(draft.power)||0,
    toughness:kind==="cpuCreatureMinusPT"?Math.max(0,parseInt(draft.toughness)||0):parseInt(draft.toughness)||0,
    remaining:kind==="preventCpuDamage"?Math.max(1,parseInt(draft.amount)||1):null,
    createdTurn:gameState.turn
  };
  gameState.battlefieldRules.push(rule);
  applyBattlefieldRuleModifiers();
  renderBoardView(gameState);
  logCommander(`Battlefield rule added: ${battlefieldRuleLabel(rule)}.`);
  return rule;
}
function removeBattlefieldRule(ruleId,reason="removed"){
  const rule=battlefieldRules().find(candidate=>candidate.id===ruleId);
  if(!rule)return;
  gameState.battlefieldRules=gameState.battlefieldRules.filter(candidate=>candidate.id!==ruleId);
  applyBattlefieldRuleModifiers();
  renderBoardView(gameState);
  logCommander(`${rule.sourceName||"Battlefield rule"} ${reason}.`);
}

function createPlayerEffect(draft){
  if(draft.action==="exileGraveyards")return {scope:"each",action:"exileGraveyards",count:0,all:true,cardType:null};
  return {
    scope:draft.scope,
    action:draft.action,
    count:Math.max(1,parseInt(draft.count)||1),
    all:!!draft.all,
    cardType:(draft.action==="destroy"||draft.action==="sacrifice"||draft.action==="exile")?draft.cardType:draft.action==="reanimate"?"creature":null
  };
}
function playerActionAmount(effect,target){
  if(!effect.all)return effect.count;
  if(effect.action==="discard")return target.id==="player"?Math.max(0,target.handSize||0):opponentHandSize(target);
  if(effect.action==="mill"||effect.action==="draw")return target.id==="player"?Math.max(0,target.librarySize||0):opponentDeckSize(target);
  if(effect.action==="reanimate")return graveyardCreatureCards(target).length;
  if(effect.action==="destroy"||effect.action==="sacrifice"||effect.action==="exile"){
    return target.id==="player"
      ?["creature","permanent"].includes(effect.cardType)?Math.max(0,target.creatures||0):0
      :opponentPermanentOptions(target,effect.cardType).length;
  }
  if(effect.action==="loseLife"||effect.action==="gainLife")return Math.max(0,target.life||0);
  return effect.count;
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
  return {name:token.name,ico:token.ico||"🐾",types:(token.type||"Creature").includes("Creature")?["Creature"]:[token.type||"Permanent"],p:token.p,t:token.t,kws:token.baseKws?[...token.baseKws]:token.kws?[...token.kws]:[],effect:token.effect||"",virtual:false,isToken:!!token.isToken};
}
function addOpponentExileCard(opp,card){
  if(card.isToken)return null;
  opp.exile=opp.exile||[];
  opp.nextExileCardId=(opp.nextExileCardId||0)+1;
  const {id:_id,ownerId:_ownerId,destination:_destination,...cardData}=card;
  const entry={...cardData,id:`${opp.id}:ex:${opp.nextExileCardId}`,ownerId:opp.id,destination:"exile"};
  opp.exile.push(entry);opp.exileCount=(opp.exileCount||0)+1;
  return entry;
}
function addOpponentGraveyardCard(opp,card){
  if(card.isToken)return null;
  if(cpuCardsGoToExileInstead())return addOpponentExileCard(opp,card);
  opp.graveyard=opp.graveyard||[];
  opp.nextGraveyardCardId=(opp.nextGraveyardCardId||0)+1;
  const entry={id:`${opp.id}:gy:${opp.nextGraveyardCardId}`,ownerId:opp.id,...card,destination:"graveyard"};
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
  player.tokens.push({name:card.name,ico:card.ico||"🐾",kind:"reanimated-creature",type:"Creature",p:card.p||1,t:card.t||1,baseP:card.p||1,baseT:card.t||1,kws:card.kws?[...card.kws]:[],effect:card.effect||`Resurrected from ${effectTargetName(owner)}'s graveyard.`,summoningSick:true,owner:card.ownerId||owner.id,controller:"player",isToken:false});
  player.creatures++;
  return card;
}
function exileOpponentGraveyardCreature(opp,cardId){
  const index=(opp.graveyard||[]).findIndex(card=>card.id===cardId&&card.types?.includes("Creature")&&!card.isToken);
  if(index<0)return null;
  const [card]=opp.graveyard.splice(index,1);
  opp.graveyardCount=Math.max(0,(opp.graveyardCount||0)-1);
  return addOpponentExileCard(opp,card);
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
function moveGraveyardToExile(owner){
  const graveyard=owner.graveyard||[];
  const total=Math.max(owner.graveyardCount||0,graveyard.length);
  const unmaterialized=Math.max(0,total-graveyard.length);
  owner.exile=owner.exile||[];
  owner.nextExileCardId=owner.nextExileCardId||owner.exile.length;
  const moved=graveyard.map(card=>{
    owner.nextExileCardId++;
    const {destination,...cardData}=card;
    const entry={...cardData,id:`${owner.id}:ex:${owner.nextExileCardId}`,ownerId:owner.id,destination:"exile"};
    owner.exile.push(entry);
    return entry;
  });
  owner.exileCount=(owner.exileCount||0)+total;
  owner.graveyard=[];
  owner.graveyardCount=0;
  return {total,moved,unmaterialized};
}
function recordOpponentPermanentZone(opp,destination,card){
  if(destination==="exile")return card?addOpponentExileCard(opp,card):null;
  return card?addOpponentGraveyardCard(opp,card):null;
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
    return cards.length===0||selected.length>=playerActionAmount(effect,owner);
  });
}
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
        logCommander(`${name} discards ${discarded.length?discarded.map(discardedCardText).join(", "):"no cards"}. Types: ${discardedTypeSummary(discarded)}. The physical-hand model does not reveal their actual identities.`);
      }else{
        const discarded=discardFromOpponent(target,amount);
        logCommander(`${name} chooses to discard ${discarded.length?discarded.map(discardedCardText).join(", "):"no cards"}.${discarded.length?` Types: ${discardedTypeSummary(discarded)}.`:""}`);
      }
    }else if(effect.action==="mill"){
      if(target.id==="player"){
        const milledAmount=Math.min(amount,target.librarySize);target.librarySize-=milledAmount;
        const milled=Array.from({length:milledAmount},()=>addPlayerGraveyardCard(target,{name:"Unrevealed milled card",ico:"📚",types:["Unknown"],virtual:true})).filter(Boolean);
        logCommander(`${name} mills ${milled.length?milled.map(discardedCardText).join(", "):"no cards"}. Types: ${discardedTypeSummary(milled)}. The physical-library model does not reveal their actual identities.`);
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
    ?`Complete your physical action now, then confirm it: ${playerEffectSummary(effect)}`
    :`No physical action is required from you.`;
  const cpuInstruction=effect.action==="reanimate"
    ?"Selected creature cards will be resurrected onto your battlefield under your control."
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
            <button type="button" class="count-btn" data-count="2">2</button>
            <button type="button" class="count-btn active" data-count="3">3</button>
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

  let selectedCount=3;
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
  const ownerName=owner.id==="player"?"Your":`${owner.name.split(",")[0]}'s`;
  let selectedCardId=null;
  const close=()=>{overlay.classList.remove("show");modal.innerHTML="";};
  const render=()=>{
    const cards=owner.graveyard||[];
    const selectableCards=owner.id==="player"?[]:cards.filter(card=>!card.isToken&&card.types?.includes("Creature"));
    if(!selectableCards.some(card=>card.id===selectedCardId))selectedCardId=null;
    const selectedCard=selectableCards.find(card=>card.id===selectedCardId)||null;
    const unmaterialized=unmaterializedGraveyardCount(owner);
    const cardsHtml=cards.length?cards.map(card=>{
      const selectable=selectableCards.some(candidate=>candidate.id===card.id);
      const selected=card.id===selectedCardId;
      return `<li class="graveyard-card ${card.virtual?"virtual":""} ${selectable?"selectable":""} ${selected?"selected":""}">
        <span class="graveyard-card-icon">${escapeHtml(card.ico||"🃏")}</span><div class="graveyard-card-info"><strong>${escapeHtml(card.name)}</strong><span>${escapeHtml(cardTypeText(card))}${card.p!=null&&card.t!=null?` · ${card.p}/${card.t}`:""}</span>${card.effect?`<small>${escapeHtml(card.effect)}</small>`:""}</div>
        ${selectable?`<button type="button" class="graveyard-card-select" data-graveyard-card-id="${escapeHtml(card.id)}" aria-pressed="${selected}">${selected?"Selected":"Select creature"}</button>`:""}
      </li>`;
    }).join(""):"<li class=\"graveyard-empty\">No materialized cards yet.</li>";
    const historicalNote=unmaterialized?`<p class="graveyard-untracked">${unmaterialized} earlier card${unmaterialized===1?" was":"s were"} counted but not materialized, so ${unmaterialized===1?"it":"their identities"} cannot be shown.</p>`:"";
    const actionControls=selectableCards.length?`<section class="graveyard-card-actions"><p>${selectedCard?`Selected: <strong>${escapeHtml(selectedCard.name)}</strong>.`:"Select a creature card, then choose an action."}</p><div><button type="button" class="target-btn graveyard-exile-action" id="exileSelectedGraveyardCreature" ${selectedCard?"":"disabled"}>Exile selected creature</button><button type="button" class="target-btn graveyard-resurrect-action" id="resurrectSelectedGraveyardCreature" ${selectedCard?"":"disabled"}>Resurrect to your battlefield</button></div></section>`:"";
    modal.className="modal graveyard-modal";
    modal.innerHTML=`<div class="graveyard-modal-head"><div><span class="big-ico">⚰</span><h2>${escapeHtml(ownerName)} Graveyard</h2></div><button type="button" class="graveyard-close" aria-label="Close graveyard">×</button></div><p class="graveyard-summary">${owner.graveyardCount||0} card${owner.graveyardCount===1?"":"s"} · ${cards.length} materialized</p><ul class="graveyard-card-list">${cardsHtml}</ul>${historicalNote}${actionControls}<button type="button" class="cta ghost" id="closeGraveyardViewer">Close</button>`;
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
  const cardsHtml=cards.length?cards.map(card=>`<li class="graveyard-card exile-card">
    <span class="graveyard-card-icon">${escapeHtml(card.ico||"🃏")}</span><div class="graveyard-card-info"><strong>${escapeHtml(card.name)}</strong><span>${escapeHtml(cardTypeText(card))}${card.p!=null&&card.t!=null?` · ${card.p}/${card.t}`:""}</span>${card.effect?`<small>${escapeHtml(card.effect)}</small>`:""}</div>
  </li>`).join(""):"<li class=\"graveyard-empty\">No cards in exile.</li>";
  modal.className="modal graveyard-modal";
  modal.innerHTML=`<div class="graveyard-modal-head"><div><span class="big-ico">✦</span><h2>${escapeHtml(ownerName)} Exile</h2></div><button type="button" class="graveyard-close" aria-label="Close exile">×</button></div><p class="graveyard-summary">${owner.exileCount||0} card${owner.exileCount===1?"":"s"} exiled</p><ul class="graveyard-card-list">${cardsHtml}</ul><button type="button" class="cta ghost" id="closeGraveyardViewer">Close</button>`;
  overlay.classList.add("show");
  const close=()=>{overlay.classList.remove("show");modal.innerHTML="";};
  document.getElementById("closeGraveyardViewer").onclick=close;
  modal.querySelector(".graveyard-close").onclick=close;
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
    html+=`<button type="button" class="life-pip life-pip-btn ${dead?'dead':''} ${active?'active-opp':''}" data-view="${opp.index}" style="border-color:${opp.color}"><span class="life-ico">${opp.ico}</span><span class="life-name">${opp.name.split(',')[0]}</span><span class="life-val ${opp.life<=10?'warn':''}">${dead?'☠':opp.life}</span><span class="life-creatures">🃏 ${opponentHandSize(opp)} · 📚 ${opponentDeckSize(opp)} · <span class="life-graveyard" role="button" tabindex="0" data-graveyard-owner="${opp.id}">⚰ ${opp.graveyardCount}</span>${opp.exileCount?` · <span class="life-graveyard" role="button" tabindex="0" data-exile-owner="${opp.id}">✦ ${opp.exileCount}</span>`:''}</span>${cd>0?`<span class="life-cmdr-dmg">⚜${cd}</span>`:''}</button>`;
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
  board.className=`board ${dead?'defeated':''}`;board.style.borderColor=dead?'var(--blood)':opp.color;
  const tokensHtml=opp.tokens.length===0?'<div class="empty-field">No creatures</div>':
    opp.tokens.map((t,i)=>{
      const kws=t.kws&&t.kws.length?t.kws.join(' · '):'';
      const tooltip=`${t.name} — ${t.p}/${t.t}${t.kws&&t.kws.length?' · '+t.kws.join(', '):''}${t.effect?' — '+t.effect:''}`;
      return `<div class="card ${t.kind==='commander'?'commander':''} ${t.summoningSick?'sick':''} ${t.attacking?'tapped':''}" title="${tooltip.replace(/"/g,'&quot;')}">
      ${canRemove?`<button type="button" class="c-remove" data-opp="${opp.id}" data-rm-idx="${i}" title="Remove ${t.name}" aria-label="Remove ${t.name}">↗</button>`:''}
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

        // Commanders always return to command zone
        if(token.kind==="commander"){
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
    button.onclick=event=>{
      event.stopPropagation();
      const pwId=button.dataset.pwRemove;
      const planeswalkers=state.player.planeswalkers||[];
      const pw=planeswalkers.find(candidate=>candidate.id===pwId);
      if(!pw)return;
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
      return `<div class="cbs-item cbs-cmdr-dmg"><span class="cbs-label">${src?src.ico:'⚜'} Cmdr dmg from ${src?src.name.split(',')[0]:'?'}</span><div class="cbs-adj"><button type="button" class="cbs-btn" data-cmdr-from="${oppId}" data-d="-1">−</button><span class="cbs-val ${dmg>=14?'warn':''}">${dmg}/21</span><button type="button" class="cbs-btn" data-cmdr-from="${oppId}" data-d="1">+</button></div></div>`;
    }).join('');
  }

  const playerCreatureCards=(p.tokens||[]).filter(token=>token.kind==="reanimated-creature");
  const playerTokensHtml=playerCreatureCards.length?playerCreatureCards.map(token=>`<div class="card voltron-creature reanimated" title="Reanimated from ${token.owner}"><span class="c-name"><span>${token.name}</span><span class="mana">↩</span></span><span class="c-art">${token.ico}</span>${token.kws?.length?`<span class="c-kw">${token.kws.join(" · ")}</span>`:""}${token.effect?`<span class="c-effect">${token.effect}</span>`:""}<span class="c-pt">${token.p}/${token.t}</span>${token.summoningSick?'<div class="c-sick">💤</div>':''}</div>`).join(""):`<div class="empty-field">${p.creatures} creature${p.creatures!==1?'s':''} on your battlefield</div>`;

  // Planeswalker display
  const pws=p.planeswalkers||[];
  const pwHtml=pws.length?pws.map(pw=>`<div class="card commander pw-card" title="${pw.name} · Loyalty ${pw.loyalty}"><span class="c-name"><span>${pw.name}</span><span class="mana">⬡</span></span><span class="c-art">⬡</span><span class="c-pt">${pw.loyalty}</span><button type="button" class="c-remove" data-pw-remove="${pw.id}" title="Remove ${pw.name}">↗</button><div class="pw-adj"><button type="button" class="cbs-btn" data-pw-loyalty="${pw.id}" data-d="-1">−</button><button type="button" class="cbs-btn" data-pw-loyalty="${pw.id}" data-d="1">+</button></div></div>`).join(""):"";

  board.innerHTML=`<div class="board-h"><span class="ico">🗡️</span><span>You</span>
    <span class="atk-note"></span>
    <div class="view-controls"><button class="btn-ghost view-btn" id="prevOppBtn">◂</button><span class="view-counter">1/${totalViews}</span><button class="btn-ghost view-btn" id="nextOppBtn">▸</button><button class="btn-ghost view-btn" id="allViewBtn">⊞</button></div>
  </div><div class="board-inner commander-board-inner"><div class="garruk-col">
    <div class="commander-board-stats">
      <div class="cbs-item"><span class="cbs-label">Life</span><div class="cbs-adj"><button type="button" class="cbs-btn" data-player-stat="life" data-d="-1">−</button><span class="cbs-val ${p.life<=10?'warn':''}">${p.life}</span><button type="button" class="cbs-btn" data-player-stat="life" data-d="1">+</button></div></div>
      ${cmdrDmgHtml}
      <div class="cbs-item"><span class="cbs-label">Creatures</span><div class="cbs-adj"><button type="button" class="cbs-btn" data-player-stat="creatures" data-d="-1">−</button><span class="cbs-val">${p.creatures}</span><button type="button" class="cbs-btn" data-player-stat="creatures" data-d="1">+</button></div></div>
      <div class="cbs-item"><span class="cbs-label">Planeswalkers</span><span class="cbs-val">⬡ ${pws.length}</span></div>
      <div class="cbs-item"><span class="cbs-label">Graveyard</span><button type="button" class="cbs-zone-btn" data-graveyard-owner="player">⚰ ${p.graveyardCount}</button></div>
      <div class="cbs-item"><span class="cbs-label">Exile</span><button type="button" class="cbs-zone-btn" data-exile-owner="player">✦ ${p.exileCount}</button></div>
    </div></div>
    <div class="field-col"><div class="field-h"><span class="lbl">Your board state</span><button class="btn-ghost" data-pw-add type="button">+ Planeswalker</button></div><div class="tokens">${pwHtml}${playerTokensHtml}</div></div></div></div>`;

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
    ?`<div class="all-pw-list">${planeswalkers.map(pw=>`<div class="all-pw-card"><span class="all-pw-name" title="${escapeHtml(pw.name)}">⬡ ${escapeHtml(pw.name)}</span><div class="all-pw-controls"><button type="button" class="cbs-btn" data-pw-loyalty="${pw.id}" data-d="-1" aria-label="Decrease ${escapeHtml(pw.name)} loyalty">−</button><span class="all-pw-loyalty">${pw.loyalty}</span><button type="button" class="cbs-btn" data-pw-loyalty="${pw.id}" data-d="1" aria-label="Increase ${escapeHtml(pw.name)} loyalty">+</button><button type="button" class="all-pw-remove" data-pw-remove="${pw.id}" title="Remove ${escapeHtml(pw.name)}" aria-label="Remove ${escapeHtml(pw.name)}">↗</button></div></div>`).join('')}</div>`
    :'<span class="all-pw-empty">No planeswalkers on your battlefield.</span>';
  let html=`<div class="board-h"><span class="ico">⊞</span><span>All Opponents</span><span class="atk-note">Commander battlefield</span><div class="view-controls"><button class="btn-ghost view-btn" id="singleViewBtn" title="Open the active player view">◻</button></div></div><div class="all-opponents-grid">`;
  html+=`<div class="all-opp-card player-card" data-idx="-1" style="border-color:var(--gold-dim)">
    <div class="all-opp-header"><span>🗡️</span><span class="all-opp-name">You</span><span class="all-opp-life">${player.life}</span></div>
    <div class="all-opp-body"><span>♟ ${player.creatures} creature${player.creatures!==1?'s':''}</span><span>⬡ ${planeswalkers.length} planeswalker${planeswalkers.length===1?'':'s'}</span><span>⚰ ${player.graveyardCount}</span><span>✦ ${player.exileCount}</span></div>
    <div class="all-opp-pws"><div class="all-pw-heading"><span>Planeswalkers</span><button type="button" class="all-pw-add" data-pw-add>+ Add</button></div>${playerPlaneswalkersHtml}</div>
  </div>`;
  state.opponents.forEach((opp,i)=>{
    const dead=isOpponentDead(opp);const commander=commanderOnField(opp);
    const commanderSummary=commander?`⚜ ${commander.p}/${commander.t}`:'⚜ In zone';
    html+=`<div class="all-opp-card ${dead?'dead':''}" data-idx="${i}" style="border-color:${opp.color}">
      <div class="all-opp-header"><span>${opp.ico}</span><span class="all-opp-name">${opp.name.split(',')[0]}</span><span class="all-opp-life">${dead?'☠':opp.life}</span></div>
      <div class="all-opp-body"><span>♟ ${opp.tokens.length} creature${opp.tokens.length!==1?'s':''}</span><span>${commanderSummary}</span><span>◇ ${opp.landsInPlay+opp.rampInPlay} mana</span><span>📚 ${opponentDeckSize(opp)}</span></div>
      ${opp.attackTarget?`<div class="all-opp-target">→ ${getTargetName(state,opp.attackTarget)}</div>`:''}
    </div>`;
  });
  html+='</div>';board.innerHTML=html;
  document.getElementById('singleViewBtn').onclick=()=>{state.viewMode="single";if(state._activeOppIndex!=null)state.viewTarget=state._activeOppIndex;renderBoardView(state);};
  wirePlaneswalkerControls(board,state);
  board.querySelectorAll('.all-opp-card').forEach(card=>{card.onclick=()=>{state.viewTarget=parseInt(card.dataset.idx,10);state.viewMode="single";renderBoardView(state);};});
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

  // CPU-vs-CPU combat resolves after the response window so intervention can
  // change the actual blockers and attackers before damage is assigned.

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
          `<em>Choose whether you countered the spell or cleared your board.</em>`,
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
          `<em>Choose whether you countered the spell or cleared your board.</em>`,
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
  gameState._activeOppIndex=opp.index;
  opp._lastResult=result;
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

  // Resolve any board-wipe choice before the combat response form is available.
  const wipeAction=result.actions.find(a=>a.boardWipe);
  const renderResponse=()=>{
    const panel=document.getElementById('respGrid');
    const isIntervention=!attacksPlayer&&result.attackPower>0;
    document.getElementById('respTitle').textContent=attacksPlayer?"Your Response":isIntervention?"Intervene?":"Your Response";
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
      <div class="combat-choice-card">${token.ico||"🐾"} <b>${token.name}</b>${kws.length?' · '+kws.join(', '):''}</div>
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
      <div class="combat-choice-card">${token.ico||"🐾"} <b>${token.name}</b> (${p}/${t})${kws.length?' · '+kws.join(', '):''}</div>
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
    const pwTarget=result.planeswalkerTarget||opp._planeswalkerTarget;
    const attackingPW=!!pwTarget;
    const combatTitle=attackingPW
      ?`Combat — ${opp.name.split(',')[0]} attacks ⬡ ${pwTarget.name} (${pwTarget.loyalty}) for ${result.attackPower}`
      :`Combat — ${opp.name.split(',')[0]} attacks you for ${result.attackPower}`;
    html+=`<div class="context-section"><div class="context-section-title">${combatTitle}</div>
      <div class="cab-attackers">${attackerList}</div>
      <div class="commander-player-actions">
        ${attackingPW?`<div class="inline-stepper"><label>Damage to ${pwTarget.name}</label>
          <button type="button" data-key="damageToPW" data-delta="-1">−</button>
          <input type="number" min="0" max="${result.attackPower}" value="${result.attackPower}" data-key="damageToPW" data-pw-id="${pwTarget.id}">
          <button type="button" data-key="damageToPW" data-delta="1">+</button>
        </div>`:""}
        <div class="inline-stepper"><label>Damage getting through${attackingPW?" to you":""}</label>
          <button type="button" data-key="damageThrough" data-delta="-1">−</button>
          <input type="number" min="0" max="${result.attackPower}" value="${attackingPW?0:result.attackPower}" data-key="damageThrough">
          <button type="button" data-key="damageThrough" data-delta="1">+</button>
        </div>
        ${cmdDmg>0?`<div class="inline-stepper"><label>Commander damage</label>
          <button type="button" data-key="cmdrDmgThrough" data-delta="-1">−</button>
          <input type="number" min="0" max="${cmdDmg}" value="${attackingPW?0:cmdDmg}" data-key="cmdrDmgThrough">
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

  // Wire the continue button (fixed position above panel)
  const remaining=cpuQueue.length;
  setConfirmButton(
    remaining>0?`Next Opponent (${remaining} left) ▸`:"Continue to Your Turn ▸",
    "garruk",
    ()=>resolveResponseAndContinue(opp,result,attacksPlayer,panel)
  );
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
  let html=`<details class="context-disclosure player-action-disclosure"${draft.actionOpen?" open":""}><summary><span>Create Player Action</span><small></small></summary><div class="context-disclosure-body"><div class="context-section player-effect-section">
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
      html+=`<div class="player-effect-owner"><span>${owner.id==="player"?"🗡️":owner.ico} ${effectTargetName(owner)}'s graveyard</span>${cards.length?`<div class="kill-select">${cards.map(card=>`<button type="button" class="kill-btn ${(draft.choices[owner.id]||[]).includes(card.id)?"selected":""}" data-reanimate-owner="${owner.id}" data-reanimate-card="${card.id}">${card.ico||"🐾"} ${card.name} (${card.p||1}/${card.t||1})</button>`).join("")}</div>`:"<small>No materialized creature cards.</small>"}</div>`;
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
      logCommander(`${playerDeaths} of your creature(s) died blocking.`);
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
  return `<section class="battlefield-rules-panel" aria-label="Battlefield Rules and Permissions">
    <div class="battlefield-rules-heading"><div><span>🛡</span><strong>Battlefield Rules & Permissions</strong></div><small>Enforced against CPUs; track player-only effects at the table.</small></div>
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
  </section>`;
}
function wireBattlefieldRulesPanel(panel){
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
  let actionHtml=`<details class="context-disclosure player-action-disclosure"${draft.actionOpen?" open":""}><summary><span>Create Player Action</span><small></small></summary><div class="context-disclosure-body"><div class="context-section player-effect-section">
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
      actionHtml+=`<div class="player-effect-owner"><span>${owner.id==="player"?"🗡️":owner.ico} ${effectTargetName(owner)}'s graveyard</span>${cards.length?`<div class="kill-select">${cards.map(card=>`<button type="button" class="kill-btn ${(draft.choices[owner.id]||[]).includes(card.id)?"selected":""}" data-reanimate-owner="${owner.id}" data-reanimate-card="${card.id}">${card.ico||"🐾"} ${card.name} (${card.p||1}/${card.t||1})</button>`).join("")}</div>`:"<small>No materialized creature cards.</small>"}</div>`;
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
  panel.innerHTML=`<div class="context-form commander-form"><div class="context-section"><div class="commander-player-actions"><div class="inline-stepper"><label>Creatures I played</label><button type="button" data-key="creaturesPlayed" data-delta="-1">−</button><input type="number" min="0" value="${draft.creaturesPlayed}" data-key="creaturesPlayed"><button type="button" data-key="creaturesPlayed" data-delta="1">+</button></div></div></div>${battlefieldRulesHtml}${actionHtml}</div>`;
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
