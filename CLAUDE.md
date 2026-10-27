# Magic No Gathering — Project Guide

> Title and tagline ("Solo Commander Simulator") defined once as `GAME_TITLE` / `GAME_TAGLINE` in `js/data/modes.js`. Entry file: `index.html`. The `ratt_` storage-key prefix is historical (earlier working title) — keep it.

## What This Is

A free, unofficial **Magic: The Gathering fan project**: a solo Commander table where the player plays their real paper deck and the app runs 1–4 CPU opponents (**Commander Battle**), plus scripted 1v1 encounters (**Solo Adventures**). Released as a free static web page (itch.io / GitHub Pages) with optional donations — no Steam, no desktop build, no paid content. Plays from `file://` or any static host. Vanilla HTML/CSS/JS — no frameworks, no bundler, no modules, no server.

## Architecture

```
index.html                 ← single entry point, loads all scripts in order (bump every ?v= on release)
styles.css                 ← all styles (themes via CSS variables)
js/
├── data/                  ← PURE DATA. No functions that modify state. No DOM.
│   ├── modes.js           ← GAME_TITLE/GAME_TAGLINE, FAN_CONTENT_NOTICE, DONATION_URL/SOURCE_URL + mode configs
│   ├── cards-adventure.js ← Card/unit definitions for adventure encounters
│   └── decks/             ← One file per commander deck archetype
│       ├── deck-base.js   ← Shared deck utilities (shuffle, draw, mana math)
│       ├── gruul-voltron.js ← "Gruul Voltron": Rukha, equipment-focused commander
│       ├── boros-tokens.js  ← "Boros Tokens": Ysolde, go-wide Soldier tokens
│       └── index.js       ← Registry, backward-compat aliases, LEGACY_CARD_NAMES
│
├── engine/                ← GAME LOGIC. May reference globals (S, gameState).
│   │                        NO document access. No innerHTML. No getElementById.
│   ├── state.js           ← State factory, save/load, undo, log functions
│   ├── phases.js          ← Turn structure constants and timing helpers
│   ├── tokens.js          ← Creature CRUD, stat calculation, voltron mana model
│   ├── combat.js          ← Attack/block declaration, damage resolution
│   ├── ai-adventure.js    ← Adventure AI decisions + turn flow orchestration
│   ├── ai-commander.js    ← Commander battle AI, targeting, rules, effects, deck ctx steps
│   └── commander-turn.js  ← resolveCpuResponse: response-window state changes (UI collects input)
│
└── ui/                    ← DOM MANIPULATION. Rendering, events, modals.
    ├── modals.js          ← Reusable dialog system (number input, confirm, pick)
    ├── render.js          ← render(), renderTokens(), phase bar, log display
    ├── inputs.js          ← Contextual turn forms, casualty selection
    ├── setup.js           ← Boot, wire(), theme system, setup screen
    └── commander-ui.js    ← Commander mode UI (IIFE with internal state)
tests/                     ← headless seeded sims (`npm test -- --strict`); see tests/README.md
docs/OVERHAUL_CONTRACT.md  ← engine ↔ UI contract (function shapes, saved state, deck seam)
```

## Rules for Placing Code

### Where does NEW CODE go?

| You're adding... | Put it in... |
|---|---|
| A new deck/archetype | `js/data/decks/new-deck.js` + register in `index.js` |
| New card data (units, abilities, pools) | `js/data/cards-adventure.js` or the relevant deck file |
| A new game mode config | `js/data/modes.js` |
| AI decision logic (who to attack, what to cast) | `js/engine/ai-commander.js` or `ai-adventure.js` |
| Battlefield rule types or casting restrictions | `js/engine/ai-commander.js` |
| A new turn phase or timing rule | `js/engine/phases.js` |
| Creature stat modifiers or keyword handling | `js/engine/tokens.js` |
| Combat math (blocking, trample, first strike) | `js/engine/combat.js` |
| State shape changes (new fields on S or gameState) | `js/engine/state.js` (freshState/normalizeState) |
| A reusable popup/dialog | `js/ui/modals.js` |
| Adventure mode rendering | `js/ui/render.js` |
| Commander mode rendering | `js/ui/commander-ui.js` |
| A new input form for turn resolution | `js/ui/inputs.js` |
| Boot logic or setup screen changes | `js/ui/setup.js` |
| New CSS | `styles.css` (group by component, see theme vars) |

### Hard Rules

1. **`data/` files must be pure data.** Constants, arrays, objects. No `document`, no `S`, no `gameState`. If it needs state, it's engine or UI.

2. **`engine/` files must not touch the DOM.** No `document.getElementById`, no `innerHTML`, no `classList`. If you need to update the screen, call a function from `ui/` (which will be a global).

3. **`ui/` files may read state but should not compute game logic.** They render what the engine decided. Exceptions: input parsing (reading form values) and trivial projections (calculating remaining attack power for display).

4. **All top-level declarations use `var` or `function`.** No `const`/`let` at file top level — they don't hoist across `<script>` tags the same way. Inside functions, use whatever.

5. **No ES modules.** No `import`/`export`. Everything is loaded via `<script>` tags and communicates through globals. This preserves `file://` compatibility.

6. **Load order matters.** A file can only reference globals defined by files loaded BEFORE it in the HTML. Check the script order before adding cross-file calls.

7. **Fan Content rules (Wizards of the Coast Fan Content Policy).** The game is free and unofficial:
   - Real MTG card names, characters, and rules terms (planeswalker, commander, mana…) are fine in text.
   - Never charge for access or put any feature behind payment. Donations stay optional (`DONATION_URL`); nothing is unlocked by them.
   - Never ship Wizards' logos, set symbols, mana-symbol artwork, or card images in the repo. Use emoji/original art.
   - Never imply the project is official or endorsed. Keep `FAN_CONTENT_NOTICE` visible in Settings → About (and on any store page).
   - The title is a fan parody (`GAME_TITLE`); never pair it with Wizards' logos or official-looking branding.

8. **License: GPL-3.0-or-later** (`LICENSE`). All code is original to this project; other games may inspire ideas, but never copy their code or data. Never add code under a GPL-incompatible license.

9. **Saves live in this browser's localStorage** under `ratt_*` keys (Settings → Export/Import backup moves them). Rename a key only with a `LEGACY_STORAGE_KEYS` migration in `js/engine/state.js`.

## The IIFE Boundary (commander-ui.js)

`commander-ui.js` wraps its internals in `(function(){ "use strict"; ... })()`. This means:

- Functions INSIDE the IIFE are private — other files cannot call them directly
- Functions that `ai-commander.js` or other global code needs must be explicitly exposed via `window.X = X;` (exposure block at the end of the file)
- `gameState` is intentionally declared OUTSIDE the IIFE (as a global `var`) so both commander-ui.js and ai-commander.js can access it

**Currently exposed on `window`:**
- `logCommander`, `saveState`, `showCommanderGame`, `cmdSnapshot`, `renderBoardView`, `renderOpponentSettingsSummary`, `onThemeChange`

**If ai-commander.js needs a new function from commander-ui.js:** add `window.newFn = newFn;` in the exposure block.

## Adding a New Commander Deck

1. Create `js/data/decks/my-deck.js` (pure data, `var MY_DECK = (function(){ ... return {...}; })();`)
   with `id`, `name` (display), `archetype`, `color`, `summary`, `winCondition`
   (`{type:"commanderDamage", threshold:21}` | `{type:"life"}`), `commander`, `commanderBase`, `cpuNames[seat]`,
   `cards` (typed pools), `deckComposition` + `libraryCounts` (99-card library), `fallbackRampCreature`,
   `maxCpuHandSize`, `strategies` / `strategyLabels`, optional `commanderTrigger`, and `ai`:
   - `ai.mainPhase(opp, ctx)` — decide only (no `gameState`/DOM); call ctx steps such as `ctx.castCommander()`,
     `ctx.castRamp()`, `ctx.castGear()`, `ctx.castTokenMaker()`, `ctx.castSecondary([...])`.
   - `ai.attackPolicy` — `{commanderAlwaysAttacks, minPower, goWide, goWideMargin, commanderRaces}`.
   - Card roles are **flags**, never names: `protect`, `wipeProtect`, `removal` (+ `removalInstruction`,
     `removalLeavesToken`), `ruleRemoval`, `permanent {effect, types}`, `makesTokens`, `haymaker`, `draw`, `regrowth`.
   Full spec: `docs/OVERHAUL_CONTRACT.md` → "Wave 3 — decks" and "Wave 4 — naming pass".
2. Register it in `DECK_REGISTRY` (`js/data/decks/index.js`) and add its `<script>` tag to `index.html`
   BEFORE `index.js`.
3. Card names must be original (no real-world card names). When renaming a shipped card, deck or title,
   add an `[old, new]` pair to `LEGACY_CARD_NAMES` / `LEGACY_TITLE_NAMES` so saves migrate; never change a
   deck `id`.
4. Run `npm test -- --strict` (sims cover every registry deck).

## State Objects

**Adventure mode** uses global `S` (defined in state.js):
- `S.mode`, `S.turn`, `S.phase`, `S.loyalty`, `S.tokens[]`, `S.player.life`, etc.

**Commander mode** uses global `gameState` (defined above commander-ui.js IIFE):
- `gameState.opponents[]`, `gameState.player`, `gameState.turn`, `gameState.battlefieldRules[]`, etc.

Only one is active at a time. When in commander mode, `S` is null. When in adventure mode, `gameState` is null.

## CSS Conventions

- Theme variables are in `:root` / `[data-theme="X"]` blocks at the top of `styles.css`
- Use `var(--name)` for all colors — never hardcode hex in component styles
- Storage keys use the `ratt_` prefix. Old keys are migrated on load by `migrateStorageKey()` / `LEGACY_STORAGE_KEYS` in `js/engine/state.js` — add a pair there when renaming a key.
- Legacy `.garruk-*` / `.garruk` CSS class names are internal only (not user-visible) and were kept deliberately.
- Card variants: `.card.commander`, `.card.horde`, `.card.synergy`, `.card.voltron-creature`
- Responsive: mobile breakpoints at 760px and 430px
- New components: add styles at the end of `styles.css`, grouped with a `/* ===== Section ===== */` comment
