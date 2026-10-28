/* =====================================================================
   commander-turn.js — Commander Battle turn flow and response resolution.

   Shared by js/ui/commander-ui.js and tests/sim-commander.js so the
   simulation exercises the same code the player uses.

   - Seat order: rounds start at gameState.firstSeat and follow table order
     (you, then each CPU). gameState.cpuQueueIds holds the seats still to act
     this round; it may contain "player" (your seat).
   - resolveCpuResponse(opp, result, response): every state change of a CPU
     response window (counters, removal, blocks, damage to you or your
     planeswalker, CPU-vs-CPU combat, flash creatures, instant damage, life
     gained). The UI only builds the `response` object.
   - previewCpuResponse(opp, result, response): the same numbers without
     changing state (used for the outcome pill on the confirm button).
   - computePlayerAttack / applyPlayerCombat: your declared attacks.

   NO DOM ACCESS. Loaded after ai-commander.js; uses its globals.
   ===================================================================== */

/* ---------- seats & rounds ---------- */
/** Table order starting at state.firstSeat: ["cpu_1","cpu_2","player","cpu_0"]. */
function commanderSeatOrder(state){
  var seats=["player"].concat(state.opponents.map(function(o){return o.id;}));
  var start=Math.max(0,seats.indexOf(state.firstSeat||"player"));
  return seats.slice(start).concat(seats.slice(0,start));
}
/** Starts a round: per-round AI bookkeeping, then queues every seat. */
function beginCommanderRoundQueue(state){
  if(typeof beginCommanderRound==="function")beginCommanderRound(state);
  state.cpuQueueIds=commanderSeatOrder(state);
  return state.cpuQueueIds;
}
/**
 * Takes the next seat from state.cpuQueueIds, skipping opponents that were
 * eliminated earlier in the round. Returns "player", an opponent id, or null
 * when the round is over.
 */
function nextCommanderSeat(state){
  var queue=state.cpuQueueIds||[];
  while(queue.length){
    var seat=queue.shift();
    if(seat==="player")return seat;
    var opp=state.opponents.find(function(o){return o.id===seat;});
    if(opp&&!isOpponentDead(opp))return seat;
  }
  state.cpuQueueIds=queue;
  return null;
}
/** Number of CPU seats still to act this round (for button labels). */
function remainingCpuSeats(state){
  return (state.cpuQueueIds||[]).filter(function(id){
    if(id==="player")return false;
    var opp=state.opponents.find(function(o){return o.id===id;});
    return opp&&!isOpponentDead(opp);
  }).length;
}
/** Marks newly eliminated opponents (and logs it once). Returns them. */
function markCommanderEliminations(state){
  var fresh=[];
  state.opponents.forEach(function(opp){
    if(isOpponentDead(opp)&&!opp._eliminated){
      opp._eliminated=true;fresh.push(opp);
      cmdLog(opp.ico+" "+shortName(opp)+" has been eliminated.");
    }
  });
  return fresh;
}

/* ---------- your tracked creatures ---------- */
/**
 * player.tokens holds the creatures you list on the board as cards (kind
 * "player-creature", plus resurrected "reanimated-creature"). player.creatures
 * stays the total on your battlefield; the rest are untracked paper creatures.
 * Tracked attackers stay tapped (attacking) until your next untap step.
 */
var PLAYER_CREATURE_KEYWORDS=["Flying","Reach","Trample","Vigilance","Haste","Deathtouch","Lifelink","First Strike","Double Strike","Menace","Indestructible"];
function trackedPlayerCreatures(player){return (player.tokens||[]).filter(function(t){return t.p!=null;});}
function untrackedPlayerCreatures(player){return Math.max(0,(player.creatures||0)-trackedPlayerCreatures(player).length);}
function playerCommanderCreature(player){return (player.tokens||[]).find(function(t){return t.commander;})||null;}
/** Adds `count` copies of spec {name, ico, p, t, kws, commander, isToken}. Returns the new tokens. */
function addPlayerCreatures(state,spec,count){
  var player=state.player;player.tokens=player.tokens||[];
  var n=Math.max(1,Math.min(99,parseInt(count,10)||1));
  var p=Math.max(0,parseInt(spec.p,10)||0),t=Math.max(0,parseInt(spec.t,10)||0);
  var commander=!!spec.commander&&!playerCommanderCreature(player);
  var name=(spec.name||"").trim()||(commander?"Your commander":"Creature");
  var made=[];
  for(var i=0;i<n;i++){
    var token={name:name,ico:spec.ico||(commander&&i===0?"⚜":"♟"),kind:"player-creature",type:"Creature",p:p,t:t,baseP:p,baseT:t,
      kws:(spec.kws||[]).slice(),commander:commander&&i===0,isToken:!!spec.isToken,controller:"player"};
    player.tokens.push(token);registerToken(player,token);made.push(token);
  }
  player.creatures=(player.creatures||0)+n;
  if(commander)player.commanderPower=p;
  cmdLog("You put "+(n>1?n+"× ":"")+name+" ("+p+"/"+t+") onto your battlefield.");
  return made;
}
/** Adds `count` more copies of a tracked creature (never a second commander). */
function duplicatePlayerCreature(state,uid,count){
  var token=(state.player.tokens||[]).find(function(t){return t.uid===uid;});
  if(!token)return [];
  return addPlayerCreatures(state,{name:token.commander?token.name+" (copy)":token.name,ico:token.commander?"♟":token.ico,p:token.p,t:token.t,kws:token.kws,isToken:token.isToken},count);
}
/** Removes a tracked creature. destination: "graveyard" | "exile". Your commander goes to the command zone. */
function removePlayerCreature(state,uid,destination,reason){
  var player=state.player;
  var index=(player.tokens||[]).findIndex(function(t){return t.uid===uid;});
  if(index<0)return null;
  var token=player.tokens.splice(index,1)[0];
  player.creatures=Math.max(0,(player.creatures||0)-1);
  var card={name:token.name,ico:token.ico,types:["Creature"],p:token.baseP!=null?token.baseP:token.p,t:token.baseT!=null?token.baseT:token.t,kws:(token.kws||[]).slice(),isToken:!!token.isToken};
  var where;
  if(token.commander){where="the command zone";player.commanderPower=0;}
  else if(token.isToken)where="nowhere (token)";
  else if(destination==="exile"){addOpponentExileCard(player,card);where="exile";}
  else{addPlayerGraveyardCard(player,card);where="your graveyard";}
  cmdLog(token.name+(reason?" "+reason:"")+" → "+where+".");
  return token;
}
/** You lose `count` creatures: untracked paper creatures first, then tracked cards (commander last). */
function playerLoseCreatures(state,count,reason){
  var player=state.player;
  var n=Math.max(0,Math.min(count||0,player.creatures||0));
  var fromPaper=Math.min(n,untrackedPlayerCreatures(player));
  player.creatures-=fromPaper;
  var rest=n-fromPaper;
  var order=trackedPlayerCreatures(player).slice().sort(function(a,b){return (a.commander?1:0)-(b.commander?1:0);});
  for(var i=0;i<rest&&i<order.length;i++)removePlayerCreature(state,order[i].uid,"graveyard",reason);
  return n;
}
/** Your untap step: tracked creatures untap and lose summoning sickness. */
function untapPlayerCreatures(state){
  (state.player.tokens||[]).forEach(function(t){t.attacking=false;t.tapped=false;t.summoningSick=false;});
}

/* ---------- your turn ---------- */
/** In a one-CPU game the player who goes first skips their first draw. */
function playerSkipsFirstDraw(state){
  return state.opponents.length===1&&state.firstSeat==="player"&&(state.turn||1)===1&&!state.player.turnsTaken;
}
/** Your draw step: library −1 (or the skipped first draw). Your hand is not tracked. */
function playerDrawStep(state){
  var player=state.player;
  if(playerSkipsFirstDraw(state)){untapPlayerCreatures(state);player.turnsTaken=(player.turnsTaken||0)+1;cmdLog("You skip your first draw (first player in a two-player game).");return {drawn:0,skipped:true};}
  player.turnsTaken=(player.turnsTaken||0)+1;
  untapPlayerCreatures(state);
  if((player.librarySize||0)<=0){cmdLog("Your library is empty. You cannot draw.");return {drawn:0,skipped:false,empty:true};}
  player.librarySize-=1;
  return {drawn:1,skipped:false};
}
/** Main-phase entries: creatures played, life gained. */
function applyPlayerTurnInputs(state,inputs,whenText){
  var player=state.player;var input=inputs||{};
  var played=Math.max(0,input.creaturesPlayed||0);
  var gained=Math.max(0,input.lifeGained||0);
  if(played){player.creatures=(player.creatures||0)+played;cmdLog("You play "+plural(played,"creature")+(whenText?" "+whenText:"")+".");}
  if(gained){player.life+=gained;cmdLog("You gain "+gained+" life. (Life → "+player.life+")");}
}

/* ---------- CPU response windows ---------- */
/** Stable key for an action in a phase result (selections are keyed by it). */
function cpuActionKey(action,index){
  if(action&&action.tokenUid)return "uid:"+action.tokenUid;
  if(action&&action.gearName)return "gear:"+action.gearName+":"+index;
  return "idx:"+index;
}
function cpuActionByKey(result,key){
  var actions=(result&&result.actions)||[];
  for(var i=0;i<actions.length;i++)if(cpuActionKey(actions[i],i)===key)return actions[i];
  return null;
}
/** Spells in this result you can still counter: [{action, index, key}]. */
function counterableCpuActions(result){
  return ((result&&result.actions)||[]).map(function(action,index){return {action:action,index:index,key:cpuActionKey(action,index)};})
    .filter(function(entry){return entry.action.counterable&&!entry.action.countered;});
}
/** Actions that need the player's attention before responses (wipes, removal aimed at you). */
function pendingPlayerRemovalActions(result){
  return ((result&&result.actions)||[]).map(function(action,index){return {action:action,index:index,key:cpuActionKey(action,index)};})
    .filter(function(entry){
      var a=entry.action;
      if(a.playerRemovalHandled||a.countered)return false;
      if(a.boardWipe==="symmetric"||(a.boardWipe==="targeted"&&a.wipeTarget==="player"))return true;
      return !!a.playerRemoval;
    });
}
/**
 * Resolves a CPU spell aimed at your board (board wipe, haymaker, removal).
 * choice: {countered, creaturesLost, creaturesGained, planeswalkerIds}
 * Countering uses counterOpponentAction, which also restores CPU creatures
 * a symmetric wipe destroyed. Returns the log lines.
 */
function resolveCpuPlayerRemoval(opp,action,choice){
  var lines=[];var log=function(m){lines.push(m);cmdLog(m);};
  var state=liveGameState();
  if(!action||action.playerRemovalHandled)return lines;
  action.playerRemovalHandled=true;
  var c=choice||{};
  var name=action.wipeName||action.cardName||(action.playerRemoval&&action.playerRemoval.cardName)||"the spell";
  if(c.countered){log(counterOpponentAction(opp,action));return lines;}
  if(!state)return lines;
  var player=state.player;
  var lost=Math.max(0,Math.min(c.creaturesLost!=null?c.creaturesLost:(action.boardWipe?player.creatures:0),player.creatures||0));
  if(lost){playerLoseCreatures(state,lost,"is destroyed");log(name+" destroys "+plural(lost,"creature")+" you control. ("+player.creatures+" remaining)");}
  else log("You resolve "+name+". No creatures you control are destroyed.");
  var gained=Math.max(0,c.creaturesGained||0);
  if(gained){player.creatures+=gained;log("You create "+plural(gained,"creature token")+".");}
  (c.planeswalkerIds||[]).forEach(function(id){
    var pw=(player.planeswalkers||[]).find(function(p){return p.id===id;});
    if(!pw)return;
    player.planeswalkers=player.planeswalkers.filter(function(p){return p.id!==id;});
    log("⬡ "+pw.name+" leaves the battlefield.");
  });
  return lines;
}
/**
 * You aim removal at a CPU creature: the CPU may answer with a protection
 * instant from held mana (cpuRespondToRemoval). Returns its response or null.
 */
function cpuProtectAgainstRemoval(owner,uid){
  var token=findTokenByUid(owner,uid);
  if(!token)return null;
  var response=cpuRespondToRemoval(owner,token);
  if(response)cmdLog(response.label+". Your removal has no effect.");
  return response;
}
/** The attacking planeswalker of a combat result (by id, so saved results still resolve). */
function cpuAttackPlaneswalker(result){
  var state=liveGameState();
  if(!state||!result)return null;
  var id=result.planeswalkerTargetId||(result.planeswalkerTarget&&result.planeswalkerTarget.id);
  if(!id)return null;
  return (state.player.planeswalkers||[]).find(function(pw){return pw.id===id;})||null;
}
function responseRemovedUids(response){
  var r=response||{};
  return (r.removals||[]).map(function(x){return x.uid;}).concat(r.combatDeaths||[]);
}
/**
 * Damage a CPU attack on you deals after your removals and blocks (before
 * prevention). A blocked attacker deals nothing unless it tramples and the
 * blocker's toughness is known (trampleExcess), even if it dies in the block. Commander damage is the
 * commander's share. When the attack targets your planeswalker, the damage
 * goes to it instead. Manual overrides in `response` replace the totals.
 */
function computeCpuAttackOnPlayer(opp,result,response){
  var r=response||{};
  var removed=new Set((r.removals||[]).map(function(x){return x.uid;}));
  var diedInCombat=new Set(r.combatDeaths||[]);
  var blocks={};(r.blocks||[]).forEach(function(b){blocks[b.uid]=b;});
  var attackers=opp.tokens.filter(function(t){return t.attacking&&!removed.has(t.uid);});
  var total=0,commander=0,perAttacker=[];
  attackers.forEach(function(a){
    var block=blocks[a.uid];
    // A blocked trampler (even one your blocker kills) still deals its excess.
    var through=block?(block.blockerToughness==null?0:trampleExcess(a,block.blockerToughness))
      :diedInCombat.has(a.uid)?0:(a.p||0)*combatStrikeCount(a);
    total+=through;if(a.kind==="commander")commander+=through;
    perAttacker.push({uid:a.uid,name:a.name,blocked:!!block,damage:through});
  });
  var pw=cpuAttackPlaneswalker(result);
  var out={attackers:attackers,perAttacker:perAttacker,planeswalker:pw,
    pwDamage:pw?total:0,playerDamage:pw?0:total,commanderDamage:pw?0:commander};
  if(r.damageToPlayer!=null)out.playerDamage=Math.max(0,r.damageToPlayer);
  if(r.damageToPW!=null&&pw)out.pwDamage=Math.max(0,r.damageToPW);
  if(r.commanderDamageToPlayer!=null)out.commanderDamage=Math.max(0,r.commanderDamageToPlayer);
  out.commanderDamage=Math.min(out.commanderDamage,commanderDamageCap(opp),out.playerDamage);
  return out;
}
/**
 * Prevention for several CPU damage events in order, without consuming
 * shields: same math as computeCpuDamagePrevention, with one shared pool.
 * parts: [{damage, commanderDamage}] → [{damage, commanderDamage, prevented, reduced}]
 */
function previewCpuPreventionSequence(parts){
  if(parts.length===1)return [previewCpuDamagePrevention(parts[0].damage,parts[0].commanderDamage)];
  var reduction=activeBattlefieldRules("cpuDamageReduction").reduce(function(s,r){return s+(parseInt(r.amount)||0);},0);
  var pool=activeBattlefieldRules("preventCpuDamage").reduce(function(s,r){return s+(r.remaining||0);},0);
  return parts.map(function(part){
    var dmg=Math.max(0,part.damage||0);
    var cmd=Math.min(Math.max(0,part.commanderDamage||0),dmg);
    var reduced=Math.min(dmg,reduction);dmg-=reduced;cmd=Math.max(0,cmd-reduced);
    var absorbed=Math.min(dmg,pool);pool-=absorbed;dmg-=absorbed;cmd-=Math.min(cmd,absorbed);
    cmd=Math.min(cmd,dmg);
    return {damage:dmg,commanderDamage:cmd,prevented:absorbed,reduced:reduced};
  });
}
/** The defender a CPU-vs-CPU attack is aimed at (or null). */
function cpuCombatDefender(opp,result){
  var state=liveGameState();
  if(!state||!result||!result.target||result.target==="player")return null;
  return state.opponents.find(function(o){return o.id===result.target;})||null;
}
/**
 * What the response window will do, without changing state. Matches
 * resolveCpuResponse (including damage prevention).
 * Returns {countered, removed, blocked, attack:{playerDamage, commanderDamage,
 * pwDamage, planeswalker, prevented}|null, cpuCombat:{defender, damage,
 * commanderDamage, blockerDeaths, attackerDeaths}|null, flash, lifeGained, instantDamage}
 */
function previewCpuResponse(opp,result,response){
  var r=response||{};
  var blockedUids=new Set((r.blocks||[]).map(function(b){return b.uid;}));
  // An attacker you blocked and killed counts as blocked, not removed.
  var unblockedDeaths=(r.combatDeaths||[]).filter(function(uid){return !blockedUids.has(uid);}).length;
  var out={countered:(r.counters||[]).length,removed:(r.removals||[]).length+unblockedDeaths,blocked:(r.blocks||[]).length,
    attack:null,cpuCombat:null,flash:r.flashCreatures||0,lifeGained:r.lifeGained||0,
    instantDamage:(r.instantDamage||[]).reduce(function(s,d){return s+(d.amount||0);},0)};
  if(r.stage!=="combat"||!result||!(result.attackPower>0))return out;
  var removed=new Set(responseRemovedUids(r));
  if(result.target==="player"){
    var attack=computeCpuAttackOnPlayer(opp,result,r);
    var seq=previewCpuPreventionSequence([{damage:attack.playerDamage,commanderDamage:attack.commanderDamage},{damage:attack.pwDamage,commanderDamage:0}]);
    out.attack={playerDamage:seq[0].damage,commanderDamage:seq[0].commanderDamage,pwDamage:seq[1].damage,planeswalker:attack.planeswalker,
      prevented:seq[0].prevented+seq[1].prevented+seq[0].reduced+seq[1].reduced};
    return out;
  }
  var defender=cpuCombatDefender(opp,result);
  if(!defender||isOpponentDead(defender))return out;
  var attackers=opp.tokens.filter(function(t){return t.attacking&&!removed.has(t.uid);});
  if(!attackers.length){out.cpuCombat={defender:defender,damage:0,commanderDamage:0,blockerDeaths:0,attackerDeaths:0};return out;}
  var proxy=Object.assign({},defender,{tokens:defender.tokens.filter(function(t){return !removed.has(t.uid);})});
  var combat=resolveCpuCombat(opp,proxy,attackers);
  var cmd=Math.min(combat.commanderDamage,commanderDamageCap(opp),combat.damageToDefender);
  var prev=previewCpuDamagePrevention(combat.damageToDefender,cmd);
  out.cpuCombat={defender:defender,damage:prev.damage,commanderDamage:prev.commanderDamage,
    blockerDeaths:combat.defenderCreaturesKilled.length,attackerDeaths:combat.attackerCreaturesKilled.length};
  return out;
}
/**
 * Applies a response window. `result` is the stored phase result
 * (executeOpponentMainPhase / executeOpponentCombat). `response`:
 * {
 *   stage: "main" | "combat",
 *   counters: [actionKey],                  // cpuActionKey of countered spells
 *   removals: [{ownerId, uid, destination, checked}],  // your instant-speed removal;
 *                                            // checked = protection already asked
 *   blocks: [{uid, blockerToughness, blockerUid, blockerDies}], // attackers you blocked (blockerUid: your tracked blocker)
 *   combatDeaths: [uid],                    // attackers that died to your blockers
 *   damageToPlayer, commanderDamageToPlayer, damageToPW: number | null (null = computed)
 *   playerDeaths, flashCreatures, lifeGained: number
 *   instantDamage: [{targetId, amount}]     // any player, including you
 *   playerRemoval: [{key, countered, creaturesLost, creaturesGained, planeswalkerIds}]
 * }
 * Returns {lines, protections:[{ownerId, uid, label}]}.
 */
function resolveCpuResponse(opp,result,response){
  var state=liveGameState();
  var r=response||{};
  var lines=[];var log=function(m){if(!m)return;lines.push(m);cmdLog(m);};
  var protections=[];
  var oppName=shortName(opp);
  if(!state||!opp)return {lines:lines,protections:protections};

  // 1. Spells aimed at your board (callers without popups pass the choice here).
  (r.playerRemoval||[]).forEach(function(choice){
    var action=cpuActionByKey(result,choice.key);
    if(action)resolveCpuPlayerRemoval(opp,action,choice).forEach(function(l){lines.push(l);});
  });

  // 2. Counters.
  (r.counters||[]).forEach(function(key){
    var action=cpuActionByKey(result,key);
    if(action&&action.counterable&&!action.countered)log(counterOpponentAction(opp,action));
  });

  // 3. Your removal and attackers that died to your blockers.
  var applied=[];
  (r.removals||[]).forEach(function(removal){
    var owner=state.opponents.find(function(o){return o.id===removal.ownerId;});
    if(!owner||!findTokenByUid(owner,removal.uid))return;
    if(!removal.checked){
      var protectedBy=cpuProtectAgainstRemoval(owner,removal.uid);
      if(protectedBy){protections.push({ownerId:owner.id,uid:removal.uid,label:protectedBy.label});lines.push(protectedBy.label);return;}
    }
    var dest=removal.destination==="exile"?"exile":"graveyard";
    var moved=removeOpponentPermanentByUid(owner,removal.uid,dest);
    if(moved)applied.push(removal);
    if(moved)log("You "+(dest==="exile"?"exile":"destroy")+" "+movementCardText(moved)+" ("+shortName(owner)+"). Types: "+discardedTypeSummary([moved])+".");
  });

  var attackOnPlayer=r.stage==="combat"&&result&&result.target==="player"&&result.attackPower>0;
  var attack=attackOnPlayer?computeCpuAttackOnPlayer(opp,result,Object.assign({},r,{removals:applied})):null;
  (r.combatDeaths||[]).forEach(function(uid){
    var moved=removeOpponentPermanentByUid(opp,uid,"graveyard");
    if(moved)log(moved.name+" ("+oppName+") dies in combat → "+moved.destination+".");
  });

  // 4. Combat damage.
  if(attack){
    if(attack.playerDamage>0||attack.pwDamage===0){
      var prevention=applyCommanderCombatDamage(opp,state.player,attack.playerDamage,attack.commanderDamage);
      if(prevention.reduced)log("Battlefield damage reduction lowers "+oppName+"'s combat damage by "+prevention.reduced+".");
      if(prevention.prevented)log("Battlefield prevention stops "+prevention.prevented+" damage from "+oppName+".");
      if(prevention.damage>0)log(oppName+" deals "+prevention.damage+" combat damage to you. (Life → "+state.player.life+")");
      else if(!attack.pwDamage)log("You take no combat damage from "+oppName+".");
      if(prevention.commanderDamage>0)log(prevention.commanderDamage+" commander damage from "+oppName+" ("+state.player.commanderDamageReceived[opp.id]+"/21).");
    }
    if(attack.pwDamage>0&&attack.planeswalker){
      var pwPrevention=applyCpuDamagePrevention(attack.pwDamage,0);
      var pw=attack.planeswalker;
      if(pwPrevention.prevented||pwPrevention.reduced)log("Battlefield effects stop "+(pwPrevention.prevented+pwPrevention.reduced)+" damage to ⬡ "+pw.name+".");
      if(pwPrevention.damage>0){
        pw.loyalty=Math.max(0,pw.loyalty-pwPrevention.damage);
        log(oppName+" deals "+pwPrevention.damage+" combat damage to ⬡ "+pw.name+". (Loyalty → "+pw.loyalty+")");
        if(pw.loyalty<=0){state.player.planeswalkers=state.player.planeswalkers.filter(function(p){return p.id!==pw.id;});log("⬡ "+pw.name+" is destroyed.");}
      }
    }
    (r.blocks||[]).forEach(function(b){if(b.blockerUid&&b.blockerDies)removePlayerCreature(state,b.blockerUid,"graveyard","dies blocking");});
    var deaths=playerLoseCreatures(state,r.playerDeaths||0,"dies in combat");
    if(deaths)log(plural(deaths,"creature")+" you control died in combat.");
  }else if(r.stage==="combat"&&result&&result.target&&result.target!=="player"){
    var defender=cpuCombatDefender(opp,result);
    if(defender)resolveCpuVsCpuAttack(opp,defender);
  }

  // 5. Your other instant-speed responses.
  var flash=Math.max(0,r.flashCreatures||0);
  if(flash){state.player.creatures=(state.player.creatures||0)+flash;log("You flash in "+plural(flash,"creature")+" during "+oppName+"'s turn.");}
  var gained=Math.max(0,r.lifeGained||0);
  if(gained){state.player.life+=gained;log("You gain "+gained+" life. (Life → "+state.player.life+")");}
  (r.instantDamage||[]).forEach(function(entry){
    var amount=Math.max(0,entry.amount||0);
    if(!amount)return;
    if(entry.targetId==="player"){state.player.life=Math.max(0,state.player.life-amount);log("You take "+amount+" damage. (Life → "+state.player.life+")");return;}
    var target=state.opponents.find(function(o){return o.id===entry.targetId;});
    if(!target||isOpponentDead(target))return;
    target.life=Math.max(0,target.life-amount);
    target.damageLog=target.damageLog||{};
    target.damageLog.player=(target.damageLog.player||0)+amount;
    target.lastAttacker="player";
    log("You deal "+amount+" damage to "+shortName(target)+". (Life → "+target.life+")");
  });
  markCommanderEliminations(state);
  return {lines:lines,protections:protections};
}

/* ---------- your attacks ---------- */
var PLAYER_ATTACK_KEYWORDS=["Trample","Flying","Deathtouch","First Strike","Double Strike","Lifelink"];
/** A declared attacker row → a creature object the combat helpers understand. */
function playerAttackerCreature(row,index){
  return {uid:"player:atk"+index,trackedUid:row.uid||null,name:row.name||(row.commander?"Your commander":"Attacker "+(index+1)),
    p:Math.max(0,parseInt(row.p)||0),t:Math.max(0,parseInt(row.t)||0),kws:(row.kws||[]).slice(),
    kind:row.commander?"commander":"creature",row:index};
}
/** Damage a creature deals in a block (for lifelink): both steps it survives to strike in. */
function blockDamageDealt(attacker,blocker,outcome){
  var strikes=combatStrikeCount(attacker);
  if(outcome.attackerDies&&strikes===1&&hasFirstStrikeDamage(blocker)&&!hasFirstStrikeDamage(attacker))return 0;
  return (attacker.p||0)*strikes;
}
/**
 * Your attack declaration. rows: [{p, t, kws, targetId, commander, uid?, name?}] (uid: a tracked creature).
 * Each targeted CPU chooses blockers with cpuAssignBlockers (creatures with
 * Flying can only be blocked by Flying/Reach creatures). Returns
 * {perOpp:[{oppId, damage, commanderDamage, kills:[uid], blocks:[text]}],
 *  playerDeaths, lifeGained, rows:[{row, blockedBy, dies, damage}]}.
 */
function computePlayerAttack(state,rows){
  var attackers=(rows||[]).map(playerAttackerCreature);
  var outcome={perOpp:[],playerDeaths:0,deadUids:[],attackerUids:[],lifeGained:0,rows:[]};
  attackers.forEach(function(a){if(a.trackedUid&&rows[a.row].targetId)outcome.attackerUids.push(a.trackedUid);});
  var byTarget={};
  attackers.forEach(function(a,i){var id=rows[i].targetId;if(!id)return;(byTarget[id]=byTarget[id]||[]).push(a);});
  Object.keys(byTarget).forEach(function(oppId){
    var defender=state.opponents.find(function(o){return o.id===oppId;});
    if(!defender||isOpponentDead(defender))return;
    var group=byTarget[oppId];
    var used=new Set();
    var assignments=[];
    var flyers=group.filter(function(a){return hasKeyword(a,"Flying");});
    var ground=group.filter(function(a){return !hasKeyword(a,"Flying");});
    var damageOf=function(list){return list.reduce(function(s,a){return s+(a.p||0)*combatStrikeCount(a);},0);};
    var pass=function(list,canBlock,otherIncoming){
      if(!list.length)return [];
      var proxy=Object.assign({},defender,{tokens:defender.tokens.filter(function(t){return !used.has(t.uid)&&canBlock(t);})});
      var res=cpuAssignBlockers(proxy,list,"player",otherIncoming);
      res.assignments.forEach(function(asg){used.add(asg.blocker.uid);assignments.push(asg);});
      return res.unblocked;
    };
    // Flyers first (only Flying/Reach can block them); each pass counts the other group toward lethal.
    var flyersThrough=pass(flyers,function(t){return hasKeyword(t,"Flying")||hasKeyword(t,"Reach");},damageOf(ground));
    pass(ground,function(){return true;},damageOf(flyersThrough||[]));
    var entry={oppId:oppId,damage:0,commanderDamage:0,kills:[],blocks:[]};
    group.forEach(function(a){
      var asg=assignments.find(function(x){return x.attacker===a;});
      var row={row:a.row,name:a.name,blockedBy:null,dies:false,damage:0,blockerDies:false};
      if(asg){
        var res=resolveSingleBlock(a,asg.blocker);
        row.blockedBy=asg.blocker.name;row.dies=res.attackerDies;row.blockerDies=res.blockerDies;row.damage=res.trampleDamage;
        if(res.blockerDies)entry.kills.push(asg.blocker.uid);
        if(res.attackerDies){if(a.trackedUid)outcome.deadUids.push(a.trackedUid);else outcome.playerDeaths++;}
        if(hasKeyword(a,"Lifelink"))outcome.lifeGained+=blockDamageDealt(a,asg.blocker,res);
        var text=res.attackerDies&&res.blockerDies?a.name+" trades with "+asg.blocker.name:res.attackerDies?asg.blocker.name+" blocks and destroys "+a.name:res.blockerDies?a.name+" destroys "+asg.blocker.name:asg.blocker.name+" blocks "+a.name;
        entry.blocks.push(text+(res.trampleDamage?" ("+res.trampleDamage+" trample)":""));
      }else{
        row.damage=(a.p||0)*combatStrikeCount(a);
        if(hasKeyword(a,"Lifelink"))outcome.lifeGained+=row.damage;
      }
      entry.damage+=row.damage;
      if(a.kind==="commander")entry.commanderDamage+=row.damage;
      outcome.rows.push(row);
    });
    outcome.perOpp.push(entry);
  });
  return outcome;
}
/**
 * Applies your combat results (from computePlayerAttack or manual entry).
 * results: {perOpp:[{oppId, damage, commanderDamage, kills:[uid]}], playerDeaths (untracked),
 *   attackerUids / deadUids (your tracked attackers: tapped / died), lifeGained}
 * `damage` is the total combat damage to that opponent and includes the
 * commander damage, so commander damage always reduces life.
 */
function applyPlayerCombat(state,results){
  var res=results||{};
  (res.perOpp||[]).forEach(function(entry){
    var opp=state.opponents.find(function(o){return o.id===entry.oppId;});
    if(!opp)return;
    var name=shortName(opp);
    var commanderDamage=Math.max(0,entry.commanderDamage||0);
    var damage=Math.max(commanderDamage,Math.max(0,entry.damage||0));
    if(damage>0&&!isOpponentDead(opp)){
      opp.life=Math.max(0,opp.life-damage);
      opp.damageLog=opp.damageLog||{};
      opp.damageLog.player=(opp.damageLog.player||0)+damage;
      opp.lastAttacker="player";
      cmdLog("You deal "+damage+" combat damage to "+name+". (Life → "+opp.life+")");
      if(commanderDamage>0){
        opp.commanderDamageReceived=opp.commanderDamageReceived||{};
        opp.commanderDamageReceived.player=(opp.commanderDamageReceived.player||0)+commanderDamage;
        state.player.commanderDamageDealt[opp.id]=(state.player.commanderDamageDealt[opp.id]||0)+commanderDamage;
        cmdLog(commanderDamage+" of it is commander damage ("+opp.commanderDamageReceived.player+"/21).");
      }
    }
    (entry.kills||[]).forEach(function(uid){
      var moved=removeOpponentPermanentByUid(opp,uid,"graveyard");
      if(moved)cmdLog("You destroy "+movementCardText(moved)+" ("+name+"). Types: "+discardedTypeSummary([moved])+".");
    });
  });
  // Tracked attackers tap (vigilance aside); the ones that died leave the battlefield.
  (res.attackerUids||[]).forEach(function(uid){var t=(state.player.tokens||[]).find(function(x){return x.uid===uid;});if(t)t.attacking=true;});
  (res.deadUids||[]).forEach(function(uid){removePlayerCreature(state,uid,"graveyard","dies in combat");});
  var deaths=playerLoseCreatures(state,res.playerDeaths||0,"dies in combat");
  if(deaths)cmdLog(plural(deaths,"creature")+" you control died in combat.");
  var gained=Math.max(0,res.lifeGained||0);
  if(gained){state.player.life+=gained;cmdLog("You gain "+gained+" life. (Life → "+state.player.life+")");}
  markCommanderEliminations(state);
}

/* ---------- your player actions, with CPU responses ---------- */
/**
 * Resolves a player action (resolvePlayerEffect) after giving each CPU a
 * chance to respond: targeted destroy/exile/bounce of selected creatures
 * may be answered with protection (cpuRespondToRemoval); "destroy all
 * creatures/permanents" may be answered with a wipeProtect spell
 * (cpuRespondToWipe). Protected targets are skipped.
 * Returns {responses:[{oppId, label}], lines}.
 */
function resolvePlayerEffectWithResponses(effect,draft){
  var state=liveGameState();
  var responses=[];
  if(typeof cmdSnapshot==="function")cmdSnapshot();
  var d=Object.assign({},draft||{});
  if(d.selections)d.selections=JSON.parse(JSON.stringify(d.selections));
  var skip=new Set();
  var targets=state?effectTargets(state,effect,d.targetId):[];
  if(["destroy","exile","bounce"].includes(effect.action)){
    targets.filter(function(t){return t.id!=="player";}).forEach(function(opp){
      if(effect.all&&effect.action==="destroy"&&["creature","permanent"].includes(effect.cardType)){
        var wipe=cpuRespondToWipe(opp);
        if(wipe){responses.push({oppId:opp.id,label:wipe.label});cmdLog(wipe.label+".");skip.add(opp.id);}
        return;
      }
      var selected=(d.selections&&d.selections[opp.id])||[];
      if(!selected.length)return;
      var kept=selected.filter(function(key){
        if(String(key).indexOf("uid:")!==0)return true;
        var response=cpuProtectAgainstRemoval(opp,String(key).slice(4));
        if(response){responses.push({oppId:opp.id,label:response.label});return false;}
        return true;
      });
      d.selections[opp.id]=kept;
      if(!kept.length)skip.add(opp.id);
    });
  }
  var lines=[];
  if(!skip.size){lines=resolvePlayerEffect(effect,d,{quiet:true});}
  else{
    targets.filter(function(t){return !skip.has(t.id);}).forEach(function(t){
      var single=Object.assign({},effect,{scope:"target"});
      lines=lines.concat(resolvePlayerEffect(single,Object.assign({},d,{scope:"target",targetId:t.id}),{quiet:true}));
    });
  }
  cmdLog("Player action resolved.");
  if(typeof saveState==="function")saveState();
  if(typeof showCommanderGame==="function")showCommanderGame();
  return {responses:responses,lines:lines};
}
