/* =====================================================================
   combat.js - Combat engine functions
   Extracted from game.js (declareAttackers, declareVoltronAttackers)
   and commander.js (CPU-vs-CPU combat system).
   Globals used: S, tokenPower, voltronCommander (from tokens.js)
                 cpuCreaturesCannotBlock (from ai-commander.js, called at run time)
   Rules modelled: first strike / double strike damage steps, trample
   (with deathtouch lethal = 1), deathtouch, indestructible. Summoning-sick
   creatures can block; tapped (attacking) creatures can't.
   ===================================================================== */

/* ---------- attack declaration (from game.js) ---------- */

/**
 * Declares which tokens are attacking this turn. Sets the `attacking` flag
 * on each token. Called during the enemy turn before appendAttackStep().
 */
function declareAttackers(){
  // First clear all attack flags
  S.tokens.forEach(function(t){ t.attacking=false; });

  if(S.mode==="voltron"){
    declareVoltronAttackers();
  }else{
    // Default behavior for vanilla, hard, horde, conclave: all non-sick attack
    S.tokens.forEach(function(t){ if(!t.summoningSick) t.attacking=true; });
  }
}

/**
 * Voltron-specific attack logic. Rukha's strategy:
 * - Commander ALWAYS attacks if able (she's the main threat)
 * - Creatures with haste that just entered attack (aggressive posture)
 * - Mana dorks (rampValue > 0) stay back - they're more valuable tapping for mana
 * - Small utility creatures (power <= 1) stay back unless the player has no creatures
 * - Other combat-relevant creatures attack if the player has blockers to trade with,
 *   OR if Rukha is ahead on board and can afford to swing wide
 */
function declareVoltronAttackers(){
  var playerCreatures=S.player.creatures;
  var commander=voltronCommander();
  var nonSick=S.tokens.filter(function(t){return !t.summoningSick;});

  nonSick.forEach(function(t){
    // Commander always attacks - that's the whole voltron plan
    if(t.kind==="commander"){
      t.attacking=true;
      return;
    }

    // Mana dorks never attack - their ramp value exceeds their combat value
    if(t.kind==="voltron-support" && t.effect && t.effect.includes("mana")){
      t.attacking=false;
      return;
    }

    // Horde-style: haste creatures attack immediately (already not sick)
    if(t.kws && t.kws.includes("Haste") && tokenPower(t)>=2){
      t.attacking=true;
      return;
    }

    // Tiny creatures (0-1 power) hold back as chump blockers unless player is wide open
    if(tokenPower(t)<=1){
      t.attacking=(playerCreatures===0);
      return;
    }

    // Medium creatures: attack if commander is out (they support the alpha strike)
    // or if player has few blockers and we can overwhelm
    if(commander && !commander.summoningSick){
      // With commander attacking, send support to force tough blocking decisions
      t.attacking=true;
      return;
    }

    // No commander on field: be more conservative, only attack with decent bodies
    // if the player doesn't have overwhelming blockers
    if(playerCreatures<=nonSick.length){
      t.attacking=(tokenPower(t)>=2);
    }else{
      // Player has more creatures than us, hold back for defense
      t.attacking=false;
    }
  });
}

/* =====================================================================
   CPU-vs-CPU COMBAT SYSTEM (from commander.js)
   Strategic attack decisions and blocking logic.
   ===================================================================== */

function hasKeyword(creature,keyword){
  return (creature.kws||[]).some(function(value){return String(value).toLowerCase()===keyword.toLowerCase();});
}

function creatureCombatValue(creature){
  return (creature.p||0)+(creature.t||0)+(hasKeyword(creature,"Deathtouch")?3:0)+(hasKeyword(creature,"Trample")?2:0);
}

function hasFirstStrikeDamage(creature){return hasKeyword(creature,"First Strike")||hasKeyword(creature,"Double Strike");}
function hasRegularDamage(creature){return !hasKeyword(creature,"First Strike")||hasKeyword(creature,"Double Strike");}
/** Number of combat damage steps in which this creature deals damage (2 for double strike). */
function combatStrikeCount(creature){return hasKeyword(creature,"Double Strike")?2:1;}

/**
 * Rough "can source kill target in one combat" check used by AI evaluation.
 * Double strike counts both damage steps. resolveSingleBlock does the exact
 * step-by-step resolution.
 */
function combatDamageKills(source,target){
  if(hasKeyword(target,"Indestructible"))return false;
  if((source.p||0)<=0)return false;
  if(hasKeyword(source,"Deathtouch"))return true;
  return (source.p||0)*combatStrikeCount(source)>=(target.t||0);
}

function creatureSurvivesCombat(creature,opponent){return !combatDamageKills(opponent,creature);}

/**
 * Damage that tramples over a blocker with the given (remaining) toughness in
 * ONE damage step. Lethal damage is 1 for a deathtouch attacker.
 * Returns 0 for attackers without trample.
 */
function trampleExcess(attacker,blockerToughness){
  if(!hasKeyword(attacker,"Trample"))return 0;
  var toughness=Math.max(0,blockerToughness||0);
  var lethal=hasKeyword(attacker,"Deathtouch")?Math.min(1,toughness):toughness;
  return Math.max(0,(attacker.p||0)-lethal);
}

/** Back-compat wrapper (single damage step against a fresh blocker). */
function trampleOverflow(attacker,blocker){return trampleExcess(attacker,blocker.t||0);}

/**
 * Resolves one attacker vs one blocker through the first-strike and regular
 * combat damage steps. First strike deals damage only in the first step,
 * double strike in both, everything else only in the regular step. A
 * creature destroyed in the first step deals no regular damage. A trampling
 * attacker assigns lethal damage to the blocker (accounting for damage it
 * already took) and the rest to the defending player; once the blocker is
 * gone, all of its remaining damage tramples through.
 * Returns {attackerDies, blockerDies, trampleDamage}.
 */
function resolveSingleBlock(attacker,blocker){
  var attackerDT=hasKeyword(attacker,"Deathtouch"),blockerDT=hasKeyword(blocker,"Deathtouch");
  var attackerTramples=hasKeyword(attacker,"Trample");
  var attackerIndestructible=hasKeyword(attacker,"Indestructible"),blockerIndestructible=hasKeyword(blocker,"Indestructible");
  var attackerTaken=0,blockerTaken=0,attackerDies=false,blockerDies=false,trampleDamage=0;
  var steps=[true,false];
  for(var s=0;s<steps.length;s++){
    var firstStep=steps[s];
    var attackerStrikes=!attackerDies&&(firstStep?hasFirstStrikeDamage(attacker):hasRegularDamage(attacker))&&(attacker.p||0)>0;
    var blockerStrikes=!blockerDies&&(firstStep?hasFirstStrikeDamage(blocker):hasRegularDamage(blocker))&&(blocker.p||0)>0;
    var toBlocker=0,toAttacker=0;
    if(attackerStrikes){
      var power=attacker.p||0;
      if(!blockerDies){
        if(attackerTramples){
          var lethal=attackerDT?(blockerTaken>0?0:1):Math.max(0,(blocker.t||0)-blockerTaken);
          var assigned=Math.min(power,lethal);
          toBlocker=assigned;
          trampleDamage+=power-assigned;
        }else toBlocker=power;
      }else if(attackerTramples){
        trampleDamage+=power;
      }
    }
    if(blockerStrikes&&!attackerDies)toAttacker=blocker.p||0;
    if(toBlocker>0){
      blockerTaken+=toBlocker;
      if(!blockerIndestructible&&(attackerDT||blockerTaken>=(blocker.t||0)))blockerDies=true;
    }
    if(toAttacker>0){
      attackerTaken+=toAttacker;
      if(!attackerIndestructible&&(blockerDT||attackerTaken>=(attacker.t||0)))attackerDies=true;
    }
  }
  return {attackerDies:attackerDies,blockerDies:blockerDies,trampleDamage:trampleDamage};
}

/** Tapped: attacked this turn cycle (unless it has vigilance) or tapped by an effect. */
function isCreatureTapped(creature){return !!creature.tapped||(!!creature.attacking&&!hasKeyword(creature,"Vigilance"));}
/** True when a creature is untapped and able to block (summoning sickness does NOT matter). */
function canBlockCreature(creature){return !isCreatureTapped(creature);}

/**
 * Evaluate if an attacker would survive or trade favorably against the
 * defender's available blockers. Returns a score:
 *  > 0  = profitable (attacker likely gets through or wins the trade)
 *  <= 0 = bad trade (attacker would die to a cheaper/equal blocker)
 * options.commanderAlwaysAttacks (default true): a commander scores 8 when
 * blockers exist (Voltron policy). false = the commander is evaluated like
 * any other creature (deck.ai.attackPolicy, e.g. Boros Tokens).
 */
function evaluateAttackProfitability(attacker, defenderTokens, options){
  // No blockers = free damage
  if(defenderTokens.length===0)return 10;

  // Find the best blocker the defender could assign (highest power that survives or trades)
  // Summoning-sick creatures can block; only tapped (attacked) ones can't.
  var possibleBlockers=defenderTokens.filter(canBlockCreature);
  if(possibleBlockers.length===0)return 10;

  var killsAttacker=possibleBlockers.filter(function(b){return combatDamageKills(b,attacker);});
  // Check if attacker can kill the blocker it fights
  var attackerKills=possibleBlockers.filter(function(b){return combatDamageKills(attacker,b);});

  // Commander always attacks - voltron pressure is worth the risk
  var commanderAlways=!(options&&options.commanderAlwaysAttacks===false);
  if(attacker.kind==="commander"&&commanderAlways)return 8;

  // Attacker has trample - even if blocked, damage gets through
  if(attacker.kws&&attacker.kws.includes("Trample"))return 5;

  // If nobody can kill the attacker, it's always profitable
  if(killsAttacker.length===0)return 7;

  // If attacker would die but can't kill anything back - terrible trade
  if(killsAttacker.length>0&&attackerKills.length===0)return -5;

  // Mutual trade: evaluate if the trade is worth it
  // Attacker is worth more if it has higher power (it threatens more)
  // Blocker assigned will be the smallest that can kill the attacker
  var cheapestKiller=killsAttacker.sort(function(a,b){return (a.p+a.t)-(b.p+b.t);})[0];

  // If attacker can kill the blocker that would kill it - mutual trade
  if(combatDamageKills(attacker,cheapestKiller)){
    // Trade up: our creature is smaller/equal -> good trade if their creature is bigger
    var attackerValue=creatureCombatValue(attacker);
    var blockerValue=creatureCombatValue(cheapestKiller);
    if(blockerValue>attackerValue)return 3; // we trade a smaller creature for a bigger one
    if(blockerValue===attackerValue)return 1; // even trade, slightly positive (pressure)
    return -2; // we lose a bigger creature for their smaller one
  }

  // Attacker dies, can't kill the blocker - bad
  return -4;
}

/**
 * Smart attack declaration for CPU-vs-CPU.
 * Evaluates each creature's profitability against the defender's board.
 * Returns array of tokens that should attack.
 * options.commanderAlwaysAttacks as in evaluateAttackProfitability (the
 * Commander AI passes its deck's attack policy; default true).
 */
function smartDeclareAttackers(opp, defenderTokens, options){
  var candidates=opp.tokens.filter(function(t){return !t.summoningSick;});
  var attackers=[];
  var commanderAlways=!(options&&options.commanderAlwaysAttacks===false);

  for(var i=0;i<candidates.length;i++){
    var t=candidates[i];
    // Mana dorks never attack - their ramp value exceeds combat value
    if(t.kind==="voltron-support"&&t.effect&&t.effect.includes("mana"))continue;

    // Commander always attacks (Voltron policy)
    if(t.kind==="commander"&&commanderAlways){attackers.push(t);continue;}

    // Evaluate profitability
    var score=evaluateAttackProfitability(t, defenderTokens, options);

    // Only attack if the trade is at least neutral
    if(score>0){
      attackers.push(t);
    }
  }

  return attackers;
}

/**
 * CPU blocking logic: defender assigns blockers strategically.
 * attackerId (optional): who controls the attackers, for commander damage
 * (defender.commanderDamageReceived[attackerId]).
 * otherIncoming (optional): damage from attackers handled outside this call
 * (e.g. flyers this defender can't block), counted toward lethal.
 * Returns an object with assignments array and unblocked attackers.
 *
 * Strategy:
 * - Block lethal threats (commander, big hitters) if we can trade favorably
 * - Block with any creature that survives the attacker (free damage prevention)
 * - Chump-block (sacrifice a small creature) when the damage it saves is
 *   worth more than the creature; the bar drops as life drops
 * - Never let a lethal swing through: while the unblocked damage (or
 *   commander damage) would kill, keep blocking with whatever is left
 */
function cpuAssignBlockers(defender, attackers, attackerId, otherIncoming){
  if(cpuCreaturesCannotBlock())return {assignments:[],unblocked:[].concat(attackers)};
  // Summoning-sick creatures CAN block; tapped creatures can't (vigilant attackers stay untapped).
  var available=(defender.tokens||[]).filter(canBlockCreature);
  var assignments=[]; // {attacker, blocker}
  var used=new Set();
  var blockedSet=new Set();
  var defenderLife=defender.life;
  var commanderLeft=21-(attackerId?((defender.commanderDamageReceived||{})[attackerId]||0):0);

  var damageOf=function(a){return (a.p||0)*combatStrikeCount(a);};
  // Damage a block stops: all of it, or for a trampler only what the blocker's toughness soaks up.
  var stoppedBy=function(a,b){return damageOf(a)-trampleExcess(a,b.t||0)*combatStrikeCount(a);};
  var commanderLethal=function(a){return a.kind==="commander"&&damageOf(a)>=commanderLeft;};
  // Damage still coming through if nothing else is blocked (drops as attackers are blocked).
  var incoming=(otherIncoming||0)+attackers.reduce(function(s,a){return s+damageOf(a);},0);
  var inDanger=function(){
    return incoming>=defenderLife||attackers.some(function(a){return !blockedSet.has(a)&&commanderLethal(a);});
  };

  // Sort attackers by threat: commander first, then by power descending
  var sorted=[].concat(attackers).sort(function(a,b){
    if(a.kind==="commander"&&b.kind!=="commander")return -1;
    if(b.kind==="commander"&&a.kind!=="commander")return 1;
    return b.p-a.p;
  });

  var assign=function(attacker,blocker){
    assignments.push({attacker:attacker,blocker:blocker});
    used.add(blocker);blockedSet.add(attacker);
    incoming-=stoppedBy(attacker,blocker);
  };
  var smallest=function(list){return list.sort(function(a,b){return (a.p+a.t)-(b.p+b.t);})[0];};
  // A chump is worth it when it saves k damage per point of creature value: k = 1 at 15 life, up to 3 at 45.
  var chumpRate=Math.max(1,Math.min(3,defenderLife/15));

  for(var i=0;i<sorted.length;i++){
    var attacker=sorted[i];
    // Find blockers that can kill this attacker, survive it, or do both.
    var open=available.filter(function(b){return !used.has(b);});
    var canKill=open.filter(function(b){return combatDamageKills(b,attacker);});
    var survives=open.filter(function(b){return creatureSurvivesCombat(b,attacker);});
    var perfectBlocks=canKill.filter(function(b){return creatureSurvivesCombat(b,attacker);});

    // Priority 1: Perfect block (we kill their creature, ours lives)
    // Use the smallest perfect blocker (preserve big creatures for later)
    if(perfectBlocks.length>0){assign(attacker,smallest(perfectBlocks));continue;}

    // Priority 2: Favorable trade (we both die, but their creature is more valuable)
    var favorableTrades=canKill.filter(function(b){return creatureCombatValue(attacker)>creatureCombatValue(b);});
    if(favorableTrades.length>0){assign(attacker,smallest(favorableTrades));continue;}

    // Priority 3: Even trade against the commander, big threats, or once life is under 20
    if(attacker.kind==="commander"||attacker.p>=4||defenderLife<=20){
      var evenTrades=canKill.filter(function(b){return creatureCombatValue(attacker)>=creatureCombatValue(b);});
      if(evenTrades.length>0){assign(attacker,smallest(evenTrades));continue;}
    }

    // Priority 4: Free block - our creature survives, so stopping the damage costs nothing
    if((attacker.p||0)>0&&survives.length>0){assign(attacker,smallest(survives));continue;}

    // Priority 5: Chump block when it saves a lot of damage for a cheap creature,
    // or stops lethal commander damage
    var chumps=open.filter(function(b){return b.kind!=="commander";});
    var chump=chumps.sort(function(a,b){return creatureCombatValue(a)-creatureCombatValue(b);})[0];
    if(chump){
      var saved=stoppedBy(attacker,chump);
      if(commanderLethal(attacker)||(saved>=3&&saved>=creatureCombatValue(chump)*chumpRate)){assign(attacker,chump);continue;}
    }

    // Otherwise: let it through - we'd rather preserve our board than chump
  }

  // Survival pass: never take a lethal hit with blockers still free. Block the
  // most dangerous unblocked attacker with the creature that stops the most
  // (cheapest first; the commander only as a last resort).
  while(inDanger()){
    var open2=available.filter(function(b){return !used.has(b);});
    var threats=attackers.filter(function(a){return !blockedSet.has(a);});
    if(!open2.length||!threats.length)break;
    var threat=threats.sort(function(a,b){return (commanderLethal(b)-commanderLethal(a))||(damageOf(b)-damageOf(a));})[0];
    var blocker=open2.sort(function(a,b){
      return (stoppedBy(threat,b)-stoppedBy(threat,a))||((a.kind==="commander")-(b.kind==="commander"))||(creatureCombatValue(a)-creatureCombatValue(b));
    })[0];
    assign(threat,blocker);
  }

  // Determine unblocked attackers
  var unblocked=attackers.filter(function(a){return !blockedSet.has(a);});

  return {assignments:assignments, unblocked:unblocked};
}

/**
 * Resolve combat between CPU attacker and CPU defender.
 * Returns { damageToDefender, defenderCreaturesKilled[], attackerCreaturesKilled[], blocked[] }
 */
function resolveCpuCombat(attackerOpp, defenderOpp, attackers){
  var result=cpuAssignBlockers(defenderOpp,attackers,attackerOpp.id);
  var assignments=result.assignments;
  var unblocked=result.unblocked;
  var defenderCreaturesKilled=[];
  var attackerCreaturesKilled=[];
  var blockedDescriptions=[];
  var trampleDamage=0;
  var commanderDamage=0;

  for(var i=0;i<assignments.length;i++){
    var attacker=assignments[i].attacker;
    var blocker=assignments[i].blocker;
    var outcome=resolveSingleBlock(attacker,blocker);
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

  // Unblocked double strikers deal damage in both damage steps.
  var unblockedDamage=unblocked.reduce(function(sum,a){return sum+(a.p||0)*combatStrikeCount(a);},0);
  var unblockedCommanderDamage=unblocked
    .filter(function(a){return a.kind==="commander";})
    .reduce(function(sum,a){return sum+(a.p||0)*combatStrikeCount(a);},0);
  commanderDamage+=unblockedCommanderDamage;

  return {
    damageToDefender:unblockedDamage+trampleDamage,
    commanderDamage:commanderDamage,
    defenderCreaturesKilled:defenderCreaturesKilled,
    attackerCreaturesKilled:attackerCreaturesKilled,
    blockedDescriptions:blockedDescriptions,
    unblocked:unblocked
  };
}
