# Overhaul contract (engine ↔ UI)

Shared spec for the multi-agent overhaul. Engine = `js/engine/*`, `js/data/*`.
UI = `js/ui/*`. Follow CLAUDE.md rules (no DOM in engine, `var`/`function` at
top level outside the commander-ui IIFE, no modules, load order).

## Tokens
- Every CPU token gets a stable `uid` (string, unique for the game) at creation,
  and `enteredTurn` (= `gameState.turn` when it entered).
- UI selections (kills, blocks, counters) are keyed by `uid`, never by array index.
- Helper: `findTokenByUid(opp, uid)` → token or null; `removeOpponentPermanentByUid(opp, uid, destination)`.

## CPU turn is split into phases (engine)
- `executeOpponentMainPhase(opp, allPlayers)` → `{actions}`
  Untaps that opponent's own creatures first (clears `attacking` on its tokens) —
  creatures stay tapped from their attack until their owner's next turn.
- `executeOpponentCombat(opp, allPlayers)` → `{target, attackPower, commanderAttacking, planeswalkerTarget, actions}`
- `executeOpponentEndStep(opp)` → `{actions}` (discard to hand size)
- `executeOpponentTurn(opp, allPlayers)` stays as a wrapper calling all three
  (used by the simulation test) and returns the merged result as before.
- Cast actions carry what they created: `{label, detail, tokenUid?}` for creature/commander
  casts, `{gearName}` for "Cast + equip" actions, `{cardName}` for other spells.
  `counterable: true` on actions that are spells (equip-only activations are not counterable).
- `counterOpponentAction(opp, action)` → log string; undoes that spell's effect
  (removes the created token / gear, returns commander to zone with tax, etc.).

## Damage / prevention
- `previewCpuDamagePrevention(damage, commanderDamage)` — same return shape as
  `applyCpuDamagePrevention` but does NOT consume prevention shields.
- Commander damage recorded from an attack is capped at the attacking commander's
  current power and is always also life loss.

## Combat helpers (engine/combat.js)
- `trampleExcess(attacker, blockerToughness)` → damage that tramples over.
- Double strike deals damage in both first-strike and regular steps.
- Summoning-sick creatures CAN block.
- `cpuAssignBlockers(defenderOpp, attackers)` is reused for player attacks.

## CPU interaction (engine/ai-commander.js)
- `opp.heldMana` — mana the CPU deliberately left open this turn cycle.
- `cpuRespondToRemoval(opp, token)` → `{cardName, label}` if the CPU protects the
  token (consumes the protection card + mana), else `null`.
- `cpuRespondToWipe(opp)` → same shape or `null`.
- Main-phase removal aimed at the player appears as an action with
  `playerRemoval: {cardName, instruction}`; the UI shows it as an instruction popup.
- `cpuIntentPreview(opp, state)` → `{targetId, targetName, reason}` (likely next attack).
- `cpuHandBreakdown(opp)` → `{lands, creatures, gear, protection, other, unknown}`.
- `cpuLethalWarnings(state)` → array of `{oppId, text}` e.g. "Rukha: 15/21 commander damage to you".

## Player state additions
- `gameState.player.poison` (0..), `opp.poison`; 10+ poison eliminates (engine checks in
  `isOpponentDead` / `checkCommanderBattleEnd`).
- `gameState.player.handSize`, `gameState.player.librarySize` maintained by draw/discard/mill.
- `gameState.firstSeat` (`"player"` or an opponent id) chosen at random in
  `createCommanderBattle`; in a 1-CPU game the first player skips their first draw.
- New `PLAYER_ACTIONS`: `bounce` (return permanents to hand; a bounced commander goes to
  hand with NO tax), `poison` (add poison counters), `tokens` (you create N creature tokens).

## Saved turn state (UI owns, engine must not break)
- `gameState.cpuQueueIds` (remaining opponent ids this round), `gameState.activeOppId`,
  `gameState.activeResult`, `gameState.responseStage` (`"main"`|`"combat"`),
  `gameState.playerStep`. Reload/undo re-shows the stored result; it never re-runs a CPU phase.
