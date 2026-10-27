# Rivals at the Table — Project Guide

> Working title, defined once as `GAME_TITLE` in `js/data/modes.js`. The entry HTML file still carries the pre-rename filename.

## What This Is

A solo card game engine playable via `file://` (no server required). Two modes: **Solo Adventures** (1v1 scripted encounters) and **Commander Battle** (1-4 CPU opponents with full deck simulation). Built with vanilla HTML/CSS/JS — no frameworks, no bundler, no modules.

## Architecture

```
Magic No Gathering.html    ← single entry point, loads all scripts in order
styles.css                 ← all styles (themes via CSS variables)
js/
├── data/                  ← PURE DATA. No functions that modify state. No DOM.
│   ├── modes.js           ← GAME_TITLE + mode configs (name, icon, resource, life, summary)
│   ├── cards-adventure.js ← Card/unit definitions for adventure encounters
│   └── decks/             ← One file per commander deck archetype
│       ├── deck-base.js   ← Shared deck utilities (shuffle, draw, mana math)
│       ├── gruul-voltron.js ← Rukha's deck (cards, composition, AI hints)
│       └── index.js       ← Registry + backward-compat global aliases
│
├── engine/                ← GAME LOGIC. May reference globals (S, gameState).
│   │                        NO document access. No innerHTML. No getElementById.
│   ├── state.js           ← State factory, save/load, undo, log functions
│   ├── phases.js          ← Turn structure constants and timing helpers
│   ├── tokens.js          ← Creature CRUD, stat calculation, voltron mana model
│   ├── combat.js          ← Attack/block declaration, damage resolution
│   ├── ai-adventure.js    ← Adventure AI decisions + turn flow orchestration
│   └── ai-commander.js    ← Commander battle AI, targeting, rules, effects
│
└── ui/                    ← DOM MANIPULATION. Rendering, events, modals.
    ├── modals.js          ← Reusable dialog system (number input, confirm, pick)
    ├── render.js          ← render(), renderTokens(), phase bar, log display
    ├── inputs.js          ← Contextual turn forms, casualty selection
    ├── setup.js           ← Boot, wire(), theme system, setup screen
    └── commander-ui.js    ← Commander mode UI (IIFE with internal state)
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

## The IIFE Boundary (commander-ui.js)

`commander-ui.js` wraps its internals in `(function(){ "use strict"; ... })()`. This means:

- Functions INSIDE the IIFE are private — other files cannot call them directly
- Functions that `ai-commander.js` or other global code needs must be explicitly exposed via `window.X = X;` (near line ~2120)
- `gameState` is intentionally declared OUTSIDE the IIFE (as a global `var`) so both commander-ui.js and ai-commander.js can access it

**Currently exposed on `window`:**
- `logCommander`, `saveState`, `showCommanderGame`, `cmdSnapshot`, `renderBoardView`

**If ai-commander.js needs a new function from commander-ui.js:** add `window.newFn = newFn;` in the exposure block.

## Adding a New Commander Deck

```
1. Create js/data/decks/my-deck.js:

var MY_DECK = {
  id: "my-deck",
  name: "Display Name",
  commander: { name:"...", ico:"...", p:4, t:4, kws:["..."], cost:5 },
  color: "#hexcode",
  summary: "One-line description.",
  winCondition: { type: "commanderDamage", threshold: 21 },
  cards: { creatures:[...], gear:[...], protection:[...], ... },
  deckComposition: { creatures:14, gear:12, ... },
  cpuNames: [{ name:"...", ico:"...", color:"..." }],
  commanderBase: { p:4, t:4, kws:["..."], cost:5 },
  maxCpuHandSize: 7,
  strategies: { ... },
  strategyLabels: { ... }
};

2. In index.js, add to registry:
   var DECK_REGISTRY = [GRUUL_VOLTRON, MY_DECK];

3. In HTML, add script tag BEFORE index.js:
   <script src="js/data/decks/my-deck.js?v=N"></script>

4. (Future) Add AI hooks if the archetype plays differently than Voltron.
   Currently executeOpponentTurn has Voltron logic inline — 
   this will need refactoring to deck.ai.* dispatch for different playstyles.
```

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
