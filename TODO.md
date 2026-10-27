# Magic No Gathering — TODO

## [PRIORITY] Refactor Bug Testing

Validate the 16-file modular refactor works identically to the monolithic original.

**Test checklist:**
- [ ] Clear localStorage (`localStorage.clear(); location.reload()`) and confirm setup screen shows
- [ ] Begin Commander Battle (3 opponents) — game starts, CPU turns execute, player can respond
- [ ] Begin Solo Adventure (Easy Garruk) — wolves spawn, combat resolves, undo works
- [ ] Test Hard Garruk — escalating loyalty, emergency slay/wipe decisions fire
- [ ] Test Horde Mode — waves spawn, horde deck depletes, win condition triggers
- [ ] Test Aether Conclave — named creatures enter, auras apply, spell locks work
- [ ] Test Voltron (adventure) — mana ramps, Rukha casts, gear equips, commander damage tracks
- [ ] Save/load — save mid-game, reload page, game resumes correctly
- [ ] Undo — works in both adventure and commander modes
- [ ] Themes — Settings → Appearance switches Classic / Light / Dark / Dark Purple without breaking layout
- [ ] Graveyard/exile viewers — open correctly, show cards, track counts
- [ ] Restart — returns to setup screen, clears state

**Known issues to watch for:**
- `ReferenceError: X is not defined` from `ai-commander.js` → function is inside commander-ui.js IIFE, needs `window.X = X;` exposure (~line 2120)
- `gameState is null` errors → commander function called before battle starts, add null guard
- `S is null` errors → adventure function called when no game active, add null guard
- Stale saves from before refactor cause boot crash → clear localStorage
- Browser caching old JS files → hard refresh (Cmd+Shift+R) or bump `?v=N` in HTML script tags

---

## Player Attack Declaration

Add a step during the player's combat phase where the player explicitly declares which of their creatures are attacking (and optionally which opponent they're attacking in Commander).

**Planned:**
- During the player's combat step, present a moment to select which creatures are attacking
- CPU opponent(s) then decide whether to block or let the damage through, based on the current board state
- AI blocking logic considers: lethal threats, creature value trades, life total safety margins
- If the CPU blocks, it chooses strategically (e.g. chump-block a trampler vs. double-block to kill a big threat)
- If the CPU lets damage through, it accepts the life loss to preserve board presence
- UI: show a creature picker (similar to the kill-select buttons) for declaring attackers
- After declaration, a brief CPU decision phase resolves blocking before damage is applied
- In Commander mode, allow targeting a specific opponent with each attacker

**Design notes:**
- This mirrors the existing enemy attack declaration logic (declareAttackers / declareVoltronAttackers) but for the player side
- CPU blocking AI should factor in: remaining life, creature count advantage, keyword interactions (deathtouch, first strike, trample)
- A "swing all" shortcut should exist for when the player wants to attack with everything
- The CPU's decision adds strategic depth without requiring the player to manually resolve every block

---

## Ship to Steam

Prepare the game for a Steam release with a free-to-play base + paid DLC model.

**Pre-launch blockers:**
- Rename all MTG IP references (Garruk, Wolf tokens, planeswalker terminology) — WotC will enforce
- Rename the game itself — "Magic No Gathering" references their trademark
- Visual polish — card art, layout, animations, overall graphic design pass
- Wrap in Electron/NW.js for desktop distribution

**Steam setup:**
- $100 Steamworks fee (one-time)
- Store page assets: capsule images, 5+ screenshots, short description, tags
- Free-to-play base game: solo adventures + 1v1 Commander
- $4.99 DLC: "Commander Rivals Pack" (2–4 CPU opponents)
- Steamworks SDK integration for DLC gating
- Review process ~2–4 weeks after submission

**Revenue model:**
- Steam takes 30% cut
- Two-build split not needed — Steam DLC system handles gating natively
- Consider regional pricing for international markets

---

## ~~Commander Action: Exile All Graveyards~~ DONE

~~Add an "Exile all graveyards" player action to the structured action builder.~~ Implemented in the `resolvePlayerEffect` function — `exileGraveyards` action calls `moveGraveyardToExile()` for each target.

---

## ~~Commander Rival: Discard Interaction~~ DONE

~~Add player-side discard/mill actions that interact with Rukha's finite virtual hand and deck.~~ Implemented via `PLAYER_ACTIONS` (discard, mill options) and `discardFromOpponent`/`millOpponent` functions with AI priority logic.

---

## Second Commander Rival Archetype

Build a second Commander Rival opponent using the existing framework (finite virtual deck, typed hand, mana model, command zone, commander damage). The engine work is done; this is mostly content.

**Candidate archetypes (from original brainstorm):**
- **Esper Artifacts** — develops engines, protects them, creates artifact creatures, resets the board selectively
- **Mardu Aristocrats** — creates fodder, sacrifices creatures for value, drains life, rebuilds after wipes
- **Sultai Graveyard** — mills, reanimates, recurs threats, makes removal less final
- **Boros Tokens/Equipment** — goes wide or empowers its commander through equipment (closest analog to Voltron, so probably not the first pick for variety)

**Design notes:**
- New deck goes in `js/data/decks/new-archetype.js` and registers in `index.js`
- Reuse VOLTRON_CARDS-style typed pool structure, but with archetype-appropriate categories
- Needs its own win condition framing — not every archetype should use commander damage as the primary clock
- `ai-commander.js` executeOpponentTurn currently has Voltron-specific logic inline — will need deck.ai.* hooks for different playstyles
- Consider whether this should be a wholly separate mode or a "commander select" step within a shared "Commander Rival" mode
