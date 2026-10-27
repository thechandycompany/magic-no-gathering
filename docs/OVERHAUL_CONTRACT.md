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

## Wave 2 additions
- `beginCommanderRound(state)` (engine, ai-commander.js) — the UI calls it once at the start
  of every round (before the first seat acts). Resets per-round AI bookkeeping such as
  `state.roundTargets` (how many CPUs have already chosen each player as their attack target).
- `resolveCpuResponse(opp, result, response)` (engine, js/engine/commander-turn.js — owned by the
  UI agent) — all response-window state changes (counters, kills/blocks by uid, damage to player
  or planeswalker, CPU-vs-CPU combat, flash creatures, instant damage) live here, not in the UI,
  so the simulation test exercises the same code. The UI only collects the `response` object.
- Commander cast from hand (after a bounce) costs its base cost with NO tax; tax only applies
  to casts from the command zone (engine tracks `opp.commanderInHand`).

## Wave 2 — delivered by the CPU-behaviour agent (merged)
- `createCommanderBattle(n, settings?)` — optional `settings` (`{cpu:{powerLevel 1–5, aggression 0–1, interaction 0–1}}`),
  defaults to the previous game's settings. Read with `cpuSettings(state)`.
- `opp.commanderInHand` — commander bounced to hand (next cast: base cost, no tax). `commanderZone` stays `true`
  while in hand for compatibility; the UI should show "In hand" when `commanderInHand` is set.
- `opp.utilityPermanents` (cards flagged `permanent`, e.g. Frontier Watchpost / Beastkeeper's Codex) — removable/counterable via `util:<i>` keys.
- Attack actions and `cpuIntentPreview` results carry `lethal: true` when the attack is lethal.
- CPU-vs-CPU removal actions carry `response` when the target CPU protected itself.
- `state.aiStats` — counters for tests/diagnostics (no UI needed).
- Tax model unchanged: +2 is recorded when the commander returns to the command zone.

## Wave 3 — decks (CPU deck plug-in seam)
- **Registry**: `DECK_REGISTRY` (js/data/decks/index.js) = `[GRUUL_VOLTRON, BOROS_TOKENS]`; `getDeck(id)`
  (unknown → first entry), `listDecks()`. Each entry has `id`, `name`, `color`, `summary`, `archetype`
  (`"voltron"` | `"tokens"`), `winCondition` (`{type:"commanderDamage", threshold:21}` | `{type:"life"}`),
  `commander`, `cpuNames[seat]`, `cards`, `deckComposition`, `libraryCounts`, `maxCpuHandSize`,
  `strategyLabels`, `ai`, and optionally `commanderTrigger`. A settings UI lists entries by these fields.
- **Backward-compat globals** (`VOLTRON_CARDS`, `STRATEGY_LABELS`, `MAX_CPU_HAND_SIZE`, `CPU_NAMES`,
  `COMMANDER_BASE`, `DECK_COMPOSITION`, ...) still point at Wildheart Armory (`gruul-voltron`). Engine code no longer reads
  them for per-opponent logic; use the per-opponent forms below.
- **Per opponent**: `opp.deckId` (registry id) and `opp.archetype` (from the deck). `deckOf(opp)` →
  deck object (deck-base.js; legacy saves without `deckId` → Wildheart Armory). `deckCommanderBase(opp)`,
  `deckStrategyLabels(opp)`, `deckAi(opp)`, `deckAttackPolicy(opp)`. `opp.tokensCreated` counts the
  creature tokens that CPU has created this game.
- **Card lookup for display**: `cardDefinitionByName(name, opp?)` → card object (the opponent's deck
  first, then every registry deck) or null. The UI's `commanderDeckCardByName(name, opp)` delegates to it, so
  every deck's card details show.
- **Settings**: `createCommanderBattle(n, {cpu:{...}, decks})` — `decks` is an array of deck ids per seat
  (missing / unknown entries → `"gruul-voltron"`, `"random"` → any deck), a single id for every seat, or
  `"mixed"` (random decks, distinct while seats ≤ registry size, then cycled). Omitted → the previous
  game's `settings.decks`, else every seat `"gruul-voltron"` (the old behaviour; no extra randomness).
  Stored as `state.settings.decks` (the requested value, e.g. `"mixed"`); the resolved deck is `opp.deckId`.
  `resolveSeatDecks(spec, seatCount)` → `[deckId per seat]`. `createOpponent(index, deckId, settings)`
  (legacy `createOpponent(index, settings)` still works); a seat's name/icon/colour come from
  `deck.cpuNames[index]`, so two decks never share a seat name.
- **CPU turn split** (executeOpponentMainPhase): shared steps — untap, upkeep triggers, draw, upkeep
  token triggers, land, battlefield-rule removal — then the deck hook `deck.ai.mainPhase(opp, ctx)`,
  then shared bookkeeping (`opp.heldMana`). The discard to hand size stays shared in
  `executeOpponentEndStep` (uses `deck.maxCpuHandSize`). `ctx` (see `createMainPhaseContext`):
  `ctx.mana`, `ctx.actions`, `ctx.settings`, `ctx.state`, `ctx.allPlayers`, and steps that spend mana,
  push their action and return true when they acted: `commander()`, `castThisTurn(type)`,
  `castCommander()`, `castFastMana()`, `castRamp()`, `equipLooseGear()`, `castGear()`, `castTokenMaker()`,
  `castSecondary(steps)` — holds protection mana, then casts the first step that succeeds from
  `"wipe"`, `"haymaker"`, `"removalVsCpu"`, `"extraGear"`, `"creature"`, `"fallbackRamp"`, `"spell"`,
  `"removalVsPlayer"`, `"tokenMaker"`. The wipe / haymaker / removal policies are shared; the hook only
  orders them. Hooks decide only (no `gameState` / DOM access in deck files); ctx steps change state.
  Wildheart Armory's hook reproduces the wave-2 priority exactly (sims are byte-identical).
- **Attack policy** `deck.ai.attackPolicy` = `{commanderAlwaysAttacks, minPower, goWide, goWideMargin,
  commanderRaces}` (defaults = equipment commander: `true, 2, false, 2, true`). Read by `profitableAttackers` and
  `applyHomeGuard`; `evaluateAttackProfitability(attacker, defenders, {commanderAlwaysAttacks})` and
  `smartDeclareAttackers(opp, defenders, options)` (combat.js) take the same option. Lethal planning
  (`planTarget` / `lethalPlan`) and the home guard / archenemy logic are shared for every deck.
- **Dawnmarch Legion** (`js/data/decks/boros-tokens.js`, `id:"boros-tokens"`): Ysolde, Dawnmarch Captain
  (3/3, cost 5). `deck.commanderTrigger = {when:"beginCombat", tokens}` — at the start of
  `executeOpponentCombat` (before targeting) the commander creates a 1/1 Soldier; the combat result's
  `actions` gets `{type:"trigger", counterable:false, tokenUid, tokenUids}`.
- **New card flags** (engine reads them for any deck): `makesTokens {name, ico, p, t, count |
  perCreature/min/max, haste}` (creature ETB or sorcery), `permanent {effect, types, ...}` with effects
  `upkeepToken` / `anthem` (static +p/+t to that CPU's creatures) / `creatureDraw` / `upkeepCard`,
  `haymaker:"anthem"` (`pumpP`, `pumpT`, `minSwing`: +P/+T and haste until end of turn; cast when lethal
  or it adds ≥ minSwing (8) damage), `protect`, `wipeProtect`, `removal` (+ `removalInstruction` with
  `{target}`), `ruleRemoval:"any"|"artifactEnchantment"`, `draw.mode:"creatures"`.
- **Created tokens**: `createTokenCreatures(opp, spec, count, sourceName, undo)` — every created token
  has `uid`, `enteredTurn`, `isToken:true`, `kind:"voltron-creature"`, `owner`. Actions that create tokens
  carry `tokenUids` (creature casts keep `tokenUid` = the creature; token spells / triggers set `tokenUid`
  to the first token). Upkeep token actions: `{type:"upkeep", tokenUids}`. Countering a token maker
  (`counterOpponentAction`, types `creature` / `spell`) removes the tokens it created; countering an
  anthem restores P/T and summoning sickness.

## Wave 4 — naming pass (Steam prep)
- Display names: deck `gruul-voltron` is shown as **Wildheart Armory**, `boros-tokens` as **Dawnmarch Legion**.
  Ids, file names and JS identifiers (`GRUUL_VOLTRON`, `BOROS_TOKENS`, `VOLTRON_CARDS`, `archetype:"voltron"`,
  CSS classes) are internal and unchanged for save compatibility. User-facing text never says the old names.
- Every card name is original. Engine code matches cards by **flags**, never by name: `protect`, `wipeProtect`,
  `removal` (+ `removalInstruction`, `removalLeavesToken {name, ico, p, t}`), `ruleRemoval`, `permanent {effect,
  types}` (effect `"none"` = stays on the battlefield without a modeled trigger; `types` containing
  `"Equipment"` makes it cast as an artifact). `playerRemoval.leavesToken` tells the UI the player gets a token.
- Old saves: `migrateLegacyNames(state)` (js/engine/state.js) rewrites every string in a saved state using
  `LEGACY_CARD_NAMES` (decks/index.js) and `LEGACY_TITLE_NAMES` (modes.js); `state.namesVersion` = `NAMES_VERSION`
  marks it done. Adventure saves migrate in `normalizeState`, Commander saves in `ensureCommanderEffectState`,
  which also re-reads typed hand cards from the deck (`refreshLegacyCardData`) so they get the new flags.
- User-facing text says "PW", never the long card-type word. The entry file is `index.html`.
