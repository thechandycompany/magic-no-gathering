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

/** True when a creature is untapped and able to block (summoning sickness does NOT matter). */
function canBlockCreature(creature){return !creature.attacking&&!creature.tapped;}

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
  // Summoning-sick creatures can block; only tapped (attacked) ones can't.
  var possibleBlockers=defenderTokens.filter(canBlockCreature);
  if(possibleBlockers.length===0)return 10;

  var killsAttacker=possibleBlockers.filter(function(b){return combatDamageKills(b,attacker);});
  // Check if attacker can kill the blocker it fights
  var attackerKills=possibleBlockers.filter(function(b){return combatDamageKills(attacker,b);});

  // Commander always attacks - voltron pressure is worth the risk
  if(attacker.kind==="commander")return 8;

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
 */
function smartDeclareAttackers(opp, defenderTokens){
  var candidates=opp.tokens.filter(function(t){return !t.summoningSick;});
  var attackers=[];

  for(var i=0;i<candidates.length;i++){
    var t=candidates[i];
    // Mana dorks never attack - their ramp value exceeds combat value
    if(t.kind==="voltron-support"&&t.effect&&t.effect.includes("mana"))continue;

    // Commander always attacks
    if(t.kind==="commander"){attackers.push(t);continue;}

    // Evaluate profitability
    var score=evaluateAttackProfitability(t, defenderTokens);

    // Only attack if the trade is at least neutral
    if(score>0){
      attackers.push(t);
    }
  }

  return attackers;
}

/**
 * CPU blocking logic: defender assigns blockers strategically.
 * Returns an object with assignments array and unblocked attackers.
 *
 * Strategy:
 * - Block lethal threats (commander, big hitters) if we can trade favorably
 * - Chump-block (sacrifice a small creature) if life is critical
 * - Let small damage through to preserve board if life is healthy
 * - Never block if the blocker would die without killing the attacker AND life is safe
 */
function cpuAssignBlockers(defender, attackers){
  if(cpuCreaturesCannotBlock())return {assignments:[],unblocked:[].concat(attackers)};
  // Summoning-sick creatures CAN block; creatures still tapped from attacking can't.
  var available=(defender.tokens||[]).filter(canBlockCreature);
  var assignments=[]; // {attacker, blocker}
  var used=new Set();
  var defenderLife=defender.life;

  // Total incoming if we block nothing

  // Sort attackers by threat: commander first, then by power descending
  var sorted=[].concat(attackers).sort(function(a,b){
    if(a.kind==="commander"&&b.kind!=="commander")return -1;
    if(b.kind==="commander"&&a.kind!=="commander")return 1;
    return b.p-a.p;
  });

  for(var i=0;i<sorted.length;i++){
    var attacker=sorted[i];
    // Find blockers that can kill this attacker, survive it, or do both.
    var canKill=available.filter(function(b){return !used.has(b)&&combatDamageKills(b,attacker);});
    var survives=available.filter(function(b){return !used.has(b)&&creatureSurvivesCombat(b,attacker);});
    var perfectBlocks=available.filter(function(b){return !used.has(b)&&combatDamageKills(b,attacker)&&creatureSurvivesCombat(b,attacker);});

    // Priority 1: Perfect block (we kill their creature, ours lives)
    if(perfectBlocks.length>0){
      // Use the smallest perfect blocker (preserve big creatures for later)
      var best=perfectBlocks.sort(function(a,b){return (a.p+a.t)-(b.p+b.t);})[0];
      assignments.push({attacker:attacker,blocker:best});
      used.add(best);
      continue;
    }

    // Priority 2: Favorable trade (we both die, but their creature is more valuable)
    var favorableTrades=canKill.filter(function(b){return creatureCombatValue(attacker)>creatureCombatValue(b);});
    if(favorableTrades.length>0){
      var best2=favorableTrades.sort(function(a,b){return (a.p+a.t)-(b.p+b.t);})[0];
      assignments.push({attacker:attacker,blocker:best2});
      used.add(best2);
      continue;
    }

    // Priority 3: Even trade - block commander or big threats to prevent damage
    if(attacker.kind==="commander"||attacker.p>=5){
      var evenTrades=canKill.filter(function(b){return creatureCombatValue(attacker)>=creatureCombatValue(b);});
      if(evenTrades.length>0){
        var best3=evenTrades.sort(function(a,b){return (a.p+a.t)-(b.p+b.t);})[0];
        assignments.push({attacker:attacker,blocker:best3});
        used.add(best3);
        continue;
      }
    }

    // Priority 4: Chump block if life is critical (<=15) and attacker is big
    if(defenderLife<=15&&attacker.p>=4){
      var chumps=available.filter(function(b){return !used.has(b)&&b.kind!=="commander";}).sort(function(a,b){return (a.p+a.t)-(b.p+b.t);});
      if(chumps.length>0){
        assignments.push({attacker:attacker,blocker:chumps[0]});
        used.add(chumps[0]);
        continue;
      }
    }

    // Priority 5: Block with a surviving creature to prevent damage (no trade)
    // Only if this attacker's damage is significant relative to our life
    if(attacker.p>=3&&defenderLife<=25&&survives.length>0){
      var best4=survives.filter(function(b){return !used.has(b);}).sort(function(a,b){return (a.p+a.t)-(b.p+b.t);})[0];
      if(best4){
        assignments.push({attacker:attacker,blocker:best4});
        used.add(best4);
        continue;
      }
    }

    // Otherwise: let it through - we'd rather preserve our board than chump
  }

  // Determine unblocked attackers
  var blockedSet=new Set(assignments.map(function(a){return a.attacker;}));
  var unblocked=attackers.filter(function(a){return !blockedSet.has(a);});

  return {assignments:assignments, unblocked:unblocked};
}

/**
 * Resolve combat between CPU attacker and CPU defender.
 * Returns { damageToDefender, defenderCreaturesKilled[], attackerCreaturesKilled[], blocked[] }
 */
function resolveCpuCombat(attackerOpp, defenderOpp, attackers){
  var result=cpuAssignBlockers(defenderOpp,attackers);
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
