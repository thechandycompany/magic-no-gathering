/**
 * tokens.js — Token/creature manipulation functions for the game engine.
 *
 * Handles creation, removal, buffing, zone transitions, and stat
 * computation for enemy battlefield tokens (wolves, horde units,
 * conclave synergy units, voltron commander/support). Also contains
 * the Voltron mana-model and deck-draw simulation, support-card
 * casting AI, and the Garruk slay-target picker.
 *
 * Globals expected (loaded before this file):
 *   S, MODES, CONCLAVE_UNITS, VOLTRON_COMMANDER, VOLTRON_CARDS,
 *   VOLTRON_DECK_COMPOSITION, HORDE_UNITS, render, checkPhase,
 *   logG, shuffled
 */

/* ---------- slay targets ---------- */
var SLAY_TARGETS = [
  "your commander, if it can be targeted","your highest-toughness creature","your biggest threat on the battlefield",
  "your most valuable creature (best abilities)","the creature that is hardest for you to replace"
];
function garrukSlayTarget(){ return SLAY_TARGETS[Math.floor(Math.random()*SLAY_TARGETS.length)]; }

/* ---------- mode helpers ---------- */
function modeConfig(){ return MODES[S?.mode] || MODES.vanilla; }
function enemyName(){ return modeConfig().enemy; }
/* Display name for a mode config. Modes tied to a commander deck read the
   deck's name from the deck object instead of hardcoding it. */
function modeDisplayName(cfg){
  cfg = cfg || modeConfig();
  if(cfg.deckId && typeof getDeck === "function"){
    var deck = getDeck(cfg.deckId);
    if(deck && deck.name) return cfg.name + ": " + deck.name;
  }
  return cfg.name;
}

/* ---------- mutations ---------- */
function damageLoyalty(n){
  S.loyalty=Math.max(0,S.loyalty-n);
  if(S.phase==="player")S.lastPlayerDamage=n;
  checkPhase();render();
}
function gainLoyalty(n){ S.loyalty+=n; if(S.loyalty>S.maxLoyaltySeen)S.maxLoyaltySeen=S.loyalty; render(); }
function adjust(stat,d){
  if(!S){
    if(window._commanderMain&&window._commanderMain.adjust)window._commanderMain.adjust(stat,d);
    return;
  }
  S.player[stat]=Math.max(0,S.player[stat]+d); render();
}
function setStat(stat,v){ S.player[stat]=Math.max(0,v); render(); }
/* Commander life counts down from 21 as the enemy commander's combat damage
   (S.commanderDamage) accumulates — mirrors the 21 commander-damage loss rule.
   Adjusting it manually moves S.commanderDamage in the opposite direction. */
function commanderLifeRemaining(){ return Math.max(0,21-(S.commanderDamage||0)); }
function adjustCommanderLife(d){
  S.commanderDamage=Math.max(0,Math.min(21,(S.commanderDamage||0)-d));
  render();
}

/* ---------- wolf tokens ---------- */
function addWolf(){
  var big=S.mode==="hard" && S.turn>=5;
  var size=big?4:2;
  S.tokens.push({name:"Wolf",ico:"\u{1F43A}",kind:"wolf",type:"Creature — Wolf",p:size,t:size,baseP:size,baseT:size,kws:[],effect:big?"Apex Wolf":"",summoningSick:true});
  render();
}

/* ---------- voltron commander ---------- */
function voltronCommanderIndex(){return S.tokens.findIndex(function(token){return token.kind==="commander";});}
function voltronCommander(){var index=voltronCommanderIndex();return index===-1?null:S.tokens[index];}
function voltronCommanderCost(){return VOLTRON_COMMANDER.cost+(S.commanderTax||0);}
function deployVoltronCommander(){
  var cost=voltronCommanderCost();
  if(S.voltronMana<cost||voltronCommander())return false;
  S.voltronMana-=cost; S.commanderZone=false; S.voltronGear=0;
  S.tokens.push({name:VOLTRON_COMMANDER.name,ico:VOLTRON_COMMANDER.ico,kind:"commander",type:VOLTRON_COMMANDER.type,p:VOLTRON_COMMANDER.p,t:VOLTRON_COMMANDER.t,baseP:VOLTRON_COMMANDER.p,baseT:VOLTRON_COMMANDER.t,kws:[].concat(VOLTRON_COMMANDER.kws),effect:VOLTRON_COMMANDER.effect,summoningSick:true});
  return true;
}

/* ---------- voltron deck simulation ---------- */
function newVoltronDeck(){var other=0;for(var key in VOLTRON_DECK_COMPOSITION)if(VOLTRON_DECK_COMPOSITION.hasOwnProperty(key))other+=VOLTRON_DECK_COMPOSITION[key];return {lands:37,ramp:10,explosive:1,other:other};}
function voltronDeckTotal(){var deck=S.voltronDeck;return deck?deck.lands+deck.ramp+deck.explosive+deck.other:0;}
/**
 * Canonical Voltron draw (adventure mode). Keeps the invariants
 *   S.voltronOtherDeck.length === S.voltronDeck.other and
 *   S.voltronHand.other === S.voltronTypedHand.length:
 * a generic "other" draw always pops its typed card from voltronOtherDeck.
 * (Same class of bug as the Commander fix in 7bfeed6: draws and draw spells
 * used to move the count model and the typed pile independently.)
 */
function drawVoltronCard(){
  var deck=S.voltronDeck,hand=S.voltronHand,total=voltronDeckTotal();
  if(!deck||total<=0)return "none";
  if(!S.voltronOtherDeck)S.voltronOtherDeck=generateVoltronOtherDeck();
  var roll=Math.floor(Math.random()*total),category="lands";
  var keys=["lands","ramp","explosive","other"];
  for(var k=0;k<keys.length;k++){
    var key=keys[k];
    if(roll<deck[key]){category=key;break;}
    roll-=deck[key];
  }
  deck[category]--;
  if(category==="other"){
    var ref=S.voltronOtherDeck.pop();
    if(ref){var card=resolveVoltronCard(ref);S.voltronTypedHand.push(Object.assign({},card,{ref:ref}));}
    S.voltronLastTypedDraw=ref?S.voltronTypedHand[S.voltronTypedHand.length-1]:null;
  }
  syncVoltronHandCount();
  if(category!=="other")hand[category]++;
  return category;
}
/** hand.other mirrors the typed hand (typed cards are removed from it when cast). */
function syncVoltronHandCount(){if(S.voltronHand)S.voltronHand.other=(S.voltronTypedHand||[]).length;}
function drawVoltronCards(count){var drawn=[];for(var i=0;i<count;i++)drawn.push(drawVoltronCard());return drawn;}
/** Mulligan bottom: the least useful card leaves the hand (it is no longer drawable). */
function bottomVoltronCard(){
  var hand=S.voltronHand,bottom=S.voltronBottom;
  syncVoltronHandCount();
  var category=["other","ramp","explosive","lands"].find(function(key){return hand[key]>0;});
  if(!category)return "none";
  if(category==="other"){
    var typed=S.voltronTypedHand,worst=0;
    for(var i=1;i<typed.length;i++)if((typed[i].cost||0)>(typed[worst].cost||0))worst=i;
    typed.splice(worst,1);
    syncVoltronHandCount();
  }else hand[category]--;
  bottom[category]++;
  return category;
}
function resetVoltronOpeningHand(){
  S.voltronDeck=newVoltronDeck();
  S.voltronOtherDeck=generateVoltronOtherDeck();
  S.voltronTypedHand=[];
  S.voltronHand={lands:0,ramp:0,explosive:0,other:0};
  drawVoltronCards(7);
}
function initializeVoltronManaModel(){
  if(S.voltronDeck)return;
  S.voltronLandsInPlay=0;S.voltronRampInPlay=0;S.voltronExplosiveInPlay=0;S.voltronMulligans=0;
  S.voltronBottom={lands:0,ramp:0,explosive:0,other:0};
  resetVoltronOpeningHand();
  while(S.voltronHand.lands<2&&S.voltronMulligans<2){S.voltronMulligans++;resetVoltronOpeningHand();}
  for(var i=0;i<S.voltronMulligans;i++)bottomVoltronCard();
}
function voltronManaFromSources(){return S.voltronLandsInPlay+S.voltronRampInPlay+(S.voltronExplosiveInPlay*2);}
function voltronDeckSummary(){return S.voltronDeck.lands+" lands · "+(S.voltronDeck.ramp+S.voltronDeck.explosive)+" ramp left";}

/* ---------- voltron typed deck ---------- */
/**
 * Generates a shuffled array of card references for the 51 "other" slots.
 * Each entry is {category, index} pointing into VOLTRON_CARDS.
 */
function generateVoltronOtherDeck(){
  var cards=[];
  var entries=Object.entries(VOLTRON_DECK_COMPOSITION);
  for(var e=0;e<entries.length;e++){
    var category=entries[e][0], count=entries[e][1];
    var pool=VOLTRON_CARDS[category];
    for(var i=0;i<count;i++){
      cards.push({category:category, index:i%pool.length});
    }
  }
  return shuffled(cards);
}

/**
 * Resolves a card reference into its full data object.
 */
function resolveVoltronCard(ref){
  return VOLTRON_CARDS[ref.category][ref.index];
}

/**
 * Legacy helper: draws one card through the canonical drawVoltronCard and
 * returns the typed card when an "other" card was drawn (null otherwise).
 */
function drawTypedVoltronCard(){
  var drawn=drawVoltronCard();
  return drawn==="other"?S.voltronLastTypedDraw:null;
}

/**
 * AI casting priority for spending remaining mana on support cards.
 * Returns an array of action step descriptions for everything cast.
 */
function voltronCastSupportCards(manaAvailable,commanderOnField,maxCasts){
  if(maxCasts===undefined)maxCasts=99;
  var cast=[];
  var mana=manaAvailable;
  var castCount=0;
  var hand=S.voltronTypedHand;

  // Sort hand by AI priority: dorks/ramp first if no commander, gear if commander out, then creatures by cost
  var scored=function(card,index){
    var score=0;
    if(!commanderOnField&&card.rampValue)score=100; // dorks are critical pre-commander
    else if(commanderOnField&&card.ref?.category==="gear")score=90;
    else if(card.ref?.category==="creatures")score=70;
    else if(card.ref?.category==="draw")score=50;
    else if(card.ref?.category==="utility")score=40;
    else if(card.ref?.category==="haymakers"&&commanderOnField)score=30;
    else if(card.ref?.category==="protection")score=10; // hold protection, don't cast sorcery-speed
    score-=card.cost; // prefer cheaper cards when competing
    return {card:card,index:index,score:score};
  };

  var ranked=hand.map(scored).sort(function(a,b){return b.score-a.score;});
  var castIndices=[];

  for(var r=0;r<ranked.length;r++){
    var entry=ranked[r];
    if(castCount>=maxCasts&&entry.card.ref?.category!=="protection")continue;
    var card=entry.card;

    // Protection stays in hand — don't extract it proactively.
    if(card.ref?.category==="protection"){
      continue;
    }

    // Gear requires cast + equip cost together
    var effectiveCost=card.ref?.category==="gear"?card.cost+(card.equip||0):card.cost;
    if(mana<effectiveCost)continue;

    mana-=effectiveCost;
    castCount++;

    if(card.ref?.category==="gear"&&commanderOnField){
      // Apply gear to commander
      var commander=voltronCommander();
      if(commander){
        var bonus=card.bonus||2;
        commander.baseP+=bonus;commander.baseT+=bonus;commander.p=commander.baseP;commander.t=commander.baseT;
        S.voltronGear=(S.voltronGear||0)+1;
        if(card.kw&&!commander.kws.includes(card.kw))commander.kws.push(card.kw);
        commander.effect="Commander — "+S.voltronGear+" gear; "+commander.kws.join(", ").toLowerCase()+".";
        cast.push({label:"Cast + equip "+card.name+" to "+commander.name,detail:card.effect+". Now "+tokenPower(commander)+"/"+tokenToughness(commander)+"."});
        logG("equips "+card.name+" on "+commander.name+"; now "+tokenPower(commander)+"/"+tokenToughness(commander)+".");
      }
    }else if(card.ref?.category==="creatures"||(card.ref?.category==="utility"&&card.isCreature)||card.rampValue){
      // Deploy creature to battlefield
      var p=card.p||2,t=card.t||2;
      var kws=card.kws?[].concat(card.kws):[];
      S.tokens.push({name:card.name,ico:card.ico||"\u{1F43E}",kind:card.rampValue?"voltron-support":"voltron-creature",type:card.type||"Creature",p:p,t:t,baseP:p,baseT:t,kws:kws,effect:card.effect||"",summoningSick:!card.haste});
      if(card.rampValue)S.voltronRampInPlay=(S.voltronRampInPlay||0)+card.rampValue;
      cast.push({label:"Cast "+card.name+" ("+card.cost+" mana)",detail:p+"/"+t+(kws.length?" · "+kws.join(", "):"")+(" — "+card.effect)});
      logG("casts "+card.name+" ("+p+"/"+t+").");
    }else if(card.ref?.category==="draw"){
      // Card draw — draw extra typed cards
      var extraDraws=Math.min(3,voltronDeckTotal());
      drawVoltronCards(extraDraws);
      cast.push({label:"Cast "+card.name+" ("+card.cost+" mana)",detail:card.effect+" Rukha draws "+extraDraws+" card"+(extraDraws===1?"":"s")+"."});
      logG("casts "+card.name+" and draws "+extraDraws+" cards.");
    }else if(card.ref?.category==="haymakers"){
      // Haymaker — logged as a powerful effect
      cast.push({label:"Cast "+card.name+" ("+card.cost+" mana)",detail:card.effect});
      logG("casts "+card.name+"!");
    }else if(card.ref?.category==="utility"&&!card.isCreature){
      // Non-creature utility
      cast.push({label:"Cast "+card.name+" ("+card.cost+" mana)",detail:card.effect});
      logG("casts "+card.name+".");
    }else{
      // Fallback — generic play
      cast.push({label:"Play "+card.name+" ("+card.cost+" mana)",detail:card.effect||"Rukha plays a spell."});
    }

    castIndices.push(entry.index);
  }

  // Remove cast/held cards from hand (descending order to preserve indices)
  castIndices.sort(function(a,b){return b-a;}).forEach(function(i){hand.splice(i,1);});
  syncVoltronHandCount();
  S.voltronMana=mana;
  return cast;
}
function addVoltronSupport(){
  initializeVoltronManaModel();
  // Try to cast a creature from the typed hand
  var creature=S.voltronTypedHand.find(function(c){return (c.ref?.category==="creatures"||c.rampValue)&&c.cost<=voltronManaFromSources();});
  if(!creature&&S.voltronHand.ramp<=0)return false;
  if(creature){
    var idx=S.voltronTypedHand.indexOf(creature);
    S.voltronTypedHand.splice(idx,1);
    syncVoltronHandCount();
    var p=creature.p||2,t=creature.t||2;
    S.tokens.push({name:creature.name,ico:creature.ico||"\u{1F43E}",kind:creature.rampValue?"voltron-support":"voltron-creature",type:creature.type||"Creature",p:p,t:t,baseP:p,baseT:t,kws:creature.kws?[].concat(creature.kws):[],effect:creature.effect||"",summoningSick:!creature.haste});
    if(creature.rampValue)S.voltronRampInPlay=(S.voltronRampInPlay||0)+creature.rampValue;
    return true;
  }
  // Fallback to generic ramp
  S.voltronHand.ramp--;S.voltronRampInPlay=(S.voltronRampInPlay||0)+1;
  S.tokens.push({name:"Wilds Guide",ico:"\u{1F33F}",kind:"voltron-support",type:"Creature — Shaman",p:2,t:2,baseP:2,baseT:2,kws:[],effect:"Drawn ramp source.",summoningSick:true});
  return true;
}

/* ---------- zone transitions ---------- */
function returnVoltronCommanderToZone(token){
  S.commanderZone=true; S.commanderTax=(S.commanderTax||0)+2; S.voltronGear=0;
  return token.name+" returns to the command zone (tax +"+S.commanderTax+").";
}
function removeEnemyBattlefieldToken(index){
  var token=S.tokens[index]; if(!token)return null;
  S.tokens.splice(index,1);
  if(S.mode==="voltron"&&token.kind==="voltron-support")S.voltronRampInPlay=Math.max(0,(S.voltronRampInPlay||0)-1);
  return {token:token, commanderReturn:S.mode==="voltron"&&token.kind==="commander"?returnVoltronCommanderToZone(token):""};
}
/** Send a removed enemy token to the graveyard (unless it's a commander returning to zone) */
function sendToEnemyGraveyard(token){
  if(!token||token.kind==="commander")return; // commanders go to command zone, not graveyard
  S.enemyGraveyard=S.enemyGraveyard||[];
  S.enemyGraveyardCount=(S.enemyGraveyardCount||0)+1;
  S.enemyGraveyard.push({
    id:"gy:"+S.enemyGraveyardCount,
    name:token.name, ico:token.ico||"\u{1F43E}",
    type:token.type||"Creature",
    p:token.baseP||token.p, t:token.baseT||token.t,
    kws:token.kws?[].concat(token.kws):[],
    kind:token.kind, effect:token.effect||"",
    turn:S.turn
  });
}
/** Send a removed enemy token to exile */
function sendToEnemyExile(token){
  if(!token||token.kind==="commander")return;
  S.enemyExile=S.enemyExile||[];
  S.enemyExileCount=(S.enemyExileCount||0)+1;
  S.enemyExile.push({
    id:"ex:"+S.enemyExileCount,
    name:token.name, ico:token.ico||"\u{1F43E}",
    type:token.type||"Creature",
    p:token.baseP||token.p, t:token.baseT||token.t,
    kws:token.kws?[].concat(token.kws):[],
    kind:token.kind, effect:token.effect||"",
    turn:S.turn
  });
}

/* ---------- horde / conclave ---------- */
function addHordeUnit(){
  var eligible=HORDE_UNITS.filter(function(u){return (u.minTurn||1)<=S.turn;});
  var u=eligible[Math.floor(Math.random()*eligible.length)];
  S.tokens.push({name:u.name,ico:u.ico,kind:"horde",type:"Horde Creature",p:u.p,t:u.t,baseP:u.p,baseT:u.t,kws:["Haste"],effect:u.effect,summoningSick:false});
  if(u.lock) S.spellLock=u.lock;
  return u;
}
function nextConclaveUnit(){
  var active=new Set(S.tokens.filter(function(t){return t.kind==="synergy";}).map(function(t){return t.unitId;}));
  var id=S.conclaveRoster.find(function(candidate){return !active.has(candidate);});
  if(!id){ S.conclaveRoster=shuffled(CONCLAVE_UNITS.map(function(c){return c.id;})); id=S.conclaveRoster.find(function(candidate){return !active.has(candidate);}); }
  if(!id) return null;
  S.conclaveRoster=S.conclaveRoster.filter(function(candidate){return candidate!==id;});
  var u=CONCLAVE_UNITS.find(function(candidate){return candidate.id===id;});
  var foretold=S.tokens.some(function(t){return t.unitId==="selune";});
  var bonus=foretold?1:0;
  S.tokens.push({name:u.name,ico:u.ico,kind:"synergy",unitId:u.id,type:"Conclave Creature",p:u.p+bonus,t:u.t+bonus,baseP:u.p+bonus,baseT:u.t+bonus,kws:u.ward?["Ward 2"]:[],effect:u.effect,summoningSick:!u.haste});
  S.lastConclaveId=id;
  if(u.lock) S.spellLock=u.lock;
  return u;
}

/* ---------- token removal / buff ---------- */
function removeToken(idx){ if(idx==null){idx=S.tokens.length-1;} return S.tokens.splice(idx,1)[0]; }
function buffRandomWolf(){
  var candidates=S.tokens.filter(function(t){return !t.kws.includes("Deathtouch");});
  var t=candidates[candidates.length-1]||S.tokens[S.tokens.length-1];
  if(t){t.p+=1;t.baseP=(t.baseP??t.p-1)+1;if(!t.kws.includes("Deathtouch"))t.kws.push("Deathtouch");}
  render();
}

/* ---------- stat computation ---------- */
function conclaveBonuses(token){
  if(S.mode!=="conclave"||token.kind!=="synergy") return {p:0,t:0};
  var p=S.conclaveAscension||0,t=S.conclaveAscension||0;
  S.tokens.forEach(function(source){
    if(source.kind!=="synergy"||source===token)return;
    var unit=CONCLAVE_UNITS.find(function(u){return u.id===source.unitId;});
    if(unit?.auraP)p+=unit.auraP;
    if(unit?.auraT)t+=unit.auraT;
  });
  if(S.tokens.filter(function(x){return x.kind==="synergy";}).length>=3 && S.tokens.some(function(x){return x.unitId==="thalen";})){p+=1;t+=1;}
  return {p:p,t:t};
}
function tokenPower(t){return (t.baseP??t.p)+conclaveBonuses(t).p+(S.turnPowerBonus||0);}
function tokenToughness(t){return (t.baseT??t.t)+conclaveBonuses(t).t;}
function tokenKeywords(t){
  var kws=[].concat(t.kws||[]);
  if(S.mode==="conclave"&&t.kind==="synergy"&&t.unitId!=="mirael"&&S.tokens.some(function(x){return x.unitId==="mirael";})&&!kws.includes("Ward 2"))kws.push("Ward 2");
  return kws;
}
function totalPower(){return S.tokens.filter(function(t){return t.attacking;}).reduce(function(a,t){return a+tokenPower(t);},0);}
function readyPowerTotal(){return S.tokens.filter(function(t){return !t.summoningSick;}).reduce(function(a,t){return a+tokenPower(t);},0);}
