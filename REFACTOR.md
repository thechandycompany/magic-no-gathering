# Refactor Notes — 2024-07-31

## What We Did

Split the monolithic `game.js` (2,456 lines) and `commander.js` (3,577 lines) into 16 modular files organized by concern. No features were added or removed. The game should look and behave identically.

Original files are backed up in `backup/`.

---

## New File Structure

```
js/
├── data/                          — Pure data, no logic, no DOM
│   ├── modes.js                   — MODES object (single source of truth)
│   ├── cards-adventure.js         — ABILITIES, HORDE_UNITS, CONCLAVE_UNITS, SLAY_TARGETS
│   └── decks/
│       ├── deck-base.js           — Shared deck utilities (shuffle, draw, mana model)
│       ├── gruul-voltron.js       — Rukha's deck definition (cards, composition, strategies)
│       └── index.js               — DECK_REGISTRY + backward-compat global aliases
│
├── engine/                        — Game logic, no DOM access
│   ├── state.js                   — S, gameOver, save/load, undo, log functions (logG/logP/logSys/logBig)
│   ├── phases.js                  — TURN_PHASES, TURN_STEPS, timing helpers
│   ├── tokens.js                  — Token CRUD, power/toughness, voltron mana model
│   ├── combat.js                  — Attack declaration, blocking AI, damage resolution
│   ├── ai-adventure.js            — Adventure mode AI + turn flow (ulvar/horde/conclave/voltron)
│   └── ai-commander.js            — Commander battle AI (targeting, board wipes, rules, effects)
│
└── ui/                            — DOM manipulation, rendering, events
    ├── modals.js                  — Dialog system (askNumber, askConfirm, pickToken, etc.)
    ├── render.js                  — render(), renderTokens(), renderPhaseBar(), renderLog()
    ├── inputs.js                  — Contextual turn input forms, casualty selection
    ├── setup.js                   — Boot sequence, wire(), theme, setup screen, _adventureEngine
    └── commander-ui.js            — Commander mode UI (IIFE): board views, player forms, game loop
```

---

## Script Load Order (in HTML)

```
data/modes.js → data/cards-adventure.js → data/decks/deck-base.js →
data/decks/gruul-voltron.js → data/decks/index.js →
engine/state.js → engine/phases.js → engine/tokens.js → engine/combat.js →
engine/ai-adventure.js → engine/ai-commander.js →
ui/modals.js → ui/render.js → ui/inputs.js → ui/setup.js → ui/commander-ui.js
```

Order matters. Each file can reference globals defined by files loaded before it.

---

## Boot Sequence

1. All scripts load, defining globals and the `commander-ui.js` IIFE
2. HTML inline script calls `bootGame()` (defined in setup.js)
3. `bootGame()` → `wire()` (binds DOM events) → `_commanderMain.boot()`
4. `boot()` checks for commander save (v2 key), then adventure save (v1 key)
5. If no save found → `showSetup()` → renders the split Commander/Adventure menu

---

## Known Issues / Debugging Guide

### The #1 Problem: Scope Boundary Between IIFE and Globals

`commander-ui.js` wraps everything in an IIFE (`(function(){...})()`). Functions inside it are NOT accessible from outside. But `ai-commander.js` is global scope and needs some of those functions.

**Exposed on `window` (at bottom of commander-ui.js):**
- `window.logCommander`
- `window.saveState`
- `window.showCommanderGame`
- `window.cmdSnapshot`
- `window.renderBoardView`

**Global variable shared across the boundary:**
- `var gameState` — declared ABOVE the IIFE (global), used by both commander-ui.js internals and ai-commander.js

**If you see `ReferenceError: X is not defined` from ai-commander.js:**
→ That function is trapped inside the IIFE. Add `window.X = X;` near line ~2120 of commander-ui.js.

### Stale localStorage Saves

The game has two save slots:
- `ratt_save_adventure_v1` — adventure mode saves (migrated from `magic_no_gathering_save_v1` / `garruk_slayer_save_v4`)
- `ratt_save_commander_v2` — commander battle saves (migrated from `magic_no_gathering_save_v2`)

Old saves from before the refactor may cause crashes on boot. Clear with:
```js
localStorage.clear(); location.reload();
```

### Duplicate Function Definitions

Some functions exist in multiple files (harmless — last loaded wins):
- `drawCard` — in both deck-base.js and ai-commander.js (identical)
- `SLAY_TARGETS` — in both cards-adventure.js and tokens.js (identical)
- `manaAvailable`, `opponentHandSize`, etc. — in deck-base.js (generic) and ai-commander.js (uses COMMANDER_BASE global)

These aren't bugs. The duplicates in ai-commander.js were copied verbatim from the original IIFE and shadow the generic versions. They'll converge when we move to the deck abstraction pattern.

### Cache Busting

Script tags have `?v=3` query params. Bump this number if the browser serves stale JS:
```html
<script src="js/engine/state.js?v=4"></script>
```
Or hard refresh: Cmd+Shift+R.

### Common Error Patterns

| Error | Cause | Fix |
|-------|-------|-----|
| `X is not defined` in ai-commander.js | Function is inside commander-ui.js IIFE | Expose it on `window` |
| `X is not defined` in commander-ui.js | Function should be in ai-commander.js but wasn't extracted | Add it to ai-commander.js |
| `Cannot read property of null` on `S` | Adventure function called when no game is active | Check `if(!S) return` guard |
| `Cannot read property of null` on `gameState` | Commander function called before battle starts | Check `if(!gameState) return` guard |
| Game starts as vanilla Ulvar on load | Stale save in localStorage | Clear localStorage |
| Setup screen never appears | `_commanderMain` not set (IIFE crashed) | Check console for earlier error |

---

## Adding a New Deck (Future)

1. Create `js/data/decks/new-deck.js` with the deck definition object
2. Add it to `DECK_REGISTRY` in `index.js`
3. The setup screen and AI will pick it up automatically (once deck-abstracted AI hooks are built)

Current state: the AI in `ai-commander.js` still has Voltron-specific logic inline. To support multiple archetypes, the `executeOpponentTurn` function will need to delegate to `deck.ai.primaryAction()` style hooks instead of hardcoded gear/ramp logic.

---

## Files NOT Changed

- `styles.css` — untouched
- `index.html` (then named after the old working title) — only the script tags changed (plus cache-bust params)
- `backup/` — contains originals of game.js, commander.js, and the HTML
