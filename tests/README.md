# Simulation tests

Headless, seeded simulations of the game engine. No dependencies (Node built-ins only: `vm`, `fs`, `path`).

## Running

```sh
npm test                      # 300 Commander games + 100 games per adventure mode
SIM_GAMES=1000 npm test       # more Commander games
SIM_ADV_GAMES=500 npm test    # more games per adventure mode
npm test -- --strict          # also fail on KNOWN FAILURES (invariant violations)
node tests/sim-commander.js   # run one simulation alone
node tests/sim-adventure.js
node tests/sim-decks.js       # CPU deck archetypes (DECK_REGISTRY)
```

Exit code is non-zero if any simulation throws an exception. Invariant violations are reported as
**KNOWN FAILURES**; they fail the run only with `--strict` (or `SIM_STRICT=1`).

Every game is seeded (Commander seed = `1000 + game`, adventure seed = `50000 + modeIndex*10000 + game`),
so a failure line such as `game=26 seed=1026 seats=3 turn=9` can be replayed exactly.

## Files

| File | Purpose |
|---|---|
| `harness.js` | Loads the non-UI `<script>` tags from `Magic No Gathering.html` (in HTML order; `js/ui/*` skipped) into a `vm` context. Replaces `Math.random` with a seeded mulberry32, auto-stubs every function defined in `js/ui/*` (e.g. `logCommander`, `saveState`, `renderBoardView`, `render`, `askConfirm` → resolves `true`), and provides a `document`/`window`/`localStorage` shim that records each engine→DOM call with its source line. `h.call(name, ...args)` calls an engine global with a 2 s timeout, so an infinite loop is reported as an exception instead of hanging. |
| `sim-commander.js` | Commander Battle, 1–4 CPU seats (cycled), up to 40 turns. Each round follows `js/ui/commander-ui.js`: the queue of living opponents is built once (`runCpuPhase`), and each CPU takes its turn (`advanceCpuQueue`). It uses `executeOpponentMainPhase` → `executeOpponentCombat` → damage → `executeOpponentEndStep` when those exist (see `docs/OVERHAUL_CONTRACT.md`), otherwise `executeOpponentTurn`. Combat resolves as in `resolveResponseAndContinue`: CPU-vs-CPU uses `resolveCpuCombat` + `applyCpuDamagePrevention`, and the player takes all attack damage and commander damage. The scripted player plays 1 creature a turn, deals 5 damage to the living CPU with the lowest life, and clears their board for wipes. |
| `sim-adventure.js` | Every mode in `js/data/modes.js`, up to 60 turns: `freshState` → `startEnemyTurn` → enemy-turn resolution with default inputs (a copy of `resolveEnemyTurnInputs` from `js/ui/inputs.js`) → `startPlayerTurn` → `jumpToStep(COMBAT)` (CPU reactions) → `damageLoyalty` → kill 1–3 tokens → `checkEnd`. The scripted player draws from its own PRNG (separate from the engine's): 0–2 creatures and 2–8 damage per turn, plus 1 damage for every 5 turns so stalemates still end. |
| `report.js` | Result bookkeeping and printing (stats, exceptions grouped by message and first stack frame, known failures with up to 3 example locations, DOM-touch warnings). |
| `sim-ai.js` | CPU AI behaviour per power level 1–5 (`gameState.settings.cpu`): a 1-CPU **goldfish** (the player does nothing; env `SIM_AI_GOLDFISH`, default 80 games/level) and a **4-CPU pod** with the sim-commander scripted player, who also tries to destroy the biggest CPU commander every third turn (env `SIM_AI_POD`, default 40 games/level), plus aggression/interaction 0 and 1 variants. Also a Boros Tokens goldfish + pod and a mixed-deck pod at PL3 (`settings.decks`), so the behaviour assertions cover every deck. Calls `beginCommanderRound` each round. Reports median/mean kill turn, % commander-damage kills, how often the player is targeted, wipes per game, protection-response rate, held-mana turns, spot removal, intent-preview accuracy and target reasons. |
| `sim-decks.js` | Every deck in `DECK_REGISTRY`: a 1-CPU goldfish per deck (env `SIM_DECK_GOLDFISH`, default 120), a 4x Boros Tokens pod, `"mixed"` 2/3/4-CPU pods and a per-seat deck array (env `SIM_DECK_POD`, default 40). Asserts deck invariants (`deck.other === otherDeck.length`, `hand.other === typedHand.length`, 99-card library at setup, typed hand/graveyard refs resolve in the owner's deck, every CPU token incl. created tokens has a uid + enteredTurn, unique uids, seats get the requested decks, `"mixed"` decks distinct). Reports per deck: median/mean kill turn, % kills by life total vs commander damage, tokens created and anthems cast per seat, elimination rate, and who dealt the killing blow. Seeds: goldfish `60000 + deckIndex*1000 + game`, Boros pod `64000 + game`, mixed `66000 + seats*1000 + game`, seat array `69000 + game`. |
| `run.js` | Runs all simulations, prints a summary, and sets the exit code. |

## What is asserted

Commander (after setup, after every CPU turn, and after every player step):
- no exception, and every engine call returns within 2 s
- life, creatures, hand size, library size, poison, and commander damage are finite and ≥ 0, for the player and for each opponent
- for each opponent: `landsInPlay`, `rampInPlay`, `explosiveInPlay`, `commanderTax`, `gear`, `graveyardCount`, `exileCount`, `heldMana`, `manaAvailable()`, every `hand.*` and `deck.*` count, `opponentHandSize()` and `opponentDeckSize()` are finite and ≥ 0
- `deck.other === otherDeck.length` (the typed library tracks the generic count)
- `hand.other >= typedHand.length`
- at most one commander on the field, and it is never on the field and in the command zone at once
- token `p`/`t` are finite; token `uid`s are unique across the game (only checked for tokens that have a `uid`)
- an eliminated opponent never takes another turn and never comes back to life
- a CPU never attacks itself or an eliminated opponent
- every game ends within 40 turns

Adventure (after the enemy turn and after the player turn):
- no exception; `freshState(mode)` works for every mode
- loyalty, life, creatures, turn, commander damage, and attack power are finite and ≥ 0; `tokenPower`/`tokenToughness` are finite
- voltron: deck, hand, bottom, and mana counts are finite and ≥ 0; at most one commander; `voltronDeck.other === voltronOtherDeck.length`
- every game ends within 60 turns

CPU AI (`sim-ai.js`, seeds: goldfish `70000 + level*1000 + game`, pod `80000 + level*1000 + game`, knob variants `90000 + variant*1000 + game`):
- `lethal-not-taken`: a CPU that could eliminate someone this turn (independent check: no-blocker player with life ≤ ready power or commander damage + commander power ≥ 21; a CPU whose `resolveCpuCombat` blocks still let lethal through) attacked without eliminating anyone
- `player-overtargeted`: 3+ CPUs attacked the player in one round and none of those attacks was lethal
- `wipe-while-ahead`: a CPU cast a board wipe while leading the table (`archenemyScore`) by 3+

Warnings, which never fail a run: each engine→DOM call (`document.*`, `window.confirm/alert/prompt`) with its source line. Engine files must not touch the DOM (CLAUDE.md hard rule 2).

## Adding an invariant

1. Add a check to `checkInvariants` in `sim-commander.js` or `sim-adventure.js` and call
   `fail("short-type-name", "detail with the values")` when it is violated. The type name groups
   occurrences in the report, so keep it stable and put the variable data in the detail string.
2. To check something once per turn or once per game, call `fail(...)` from the game loop (see
   `eliminated-opponent-acted` or `game-did-not-terminate`).
3. Run `npm test`. A new violation shows up as `KNOWN FAILURE <type>` with example seeds. When the
   engine is fixed and the type no longer appears, consider running CI with `--strict`.

To exercise a new engine function, call it through `h.call("fnName", ...)` so it gets the timeout and a
clean stack frame in reports. If the engine starts calling a new UI global, the harness stubs it
automatically, as long as it is defined with `function name(` somewhere in `js/ui/`.
