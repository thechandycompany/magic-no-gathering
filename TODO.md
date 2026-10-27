# Rivals at the Table — TODO

A free, unofficial Magic: The Gathering fan project, released as a static web page.
No Steam, no desktop build, no paid content. See README.md for the fan-content and donation rules.

## [PRIORITY] Web release

**Before publishing**
- [ ] Set `DONATION_URL` (Ko-fi or similar) and `SOURCE_URL` in `js/data/modes.js` — leave empty to hide the buttons
- [ ] Pick a code license for the repo (e.g. MIT) and add `LICENSE` — covers the code only, not Wizards' IP
- [ ] Favicon / social preview image (original art only — no Wizards logos, set symbols, mana-symbol artwork or card images)
- [ ] Run the manual checklist below on desktop Chrome, Firefox, Safari, and one phone/tablet
- [ ] `npm test -- --strict` passes

**Publish (either works — the game is plain static files)**
- [ ] itch.io: zip the repo contents (index.html at the root), upload as an HTML5 game, "No payments" or "Name your own price" with a $0 minimum; paste the fan-content notice into the page description
- [ ] GitHub Pages: push to a public repo, Settings → Pages → deploy from the default branch root

**After publishing**
- [ ] Add the public URL to README.md
- [ ] Bump every `?v=N` in `index.html` on each release so players get fresh scripts

## Manual test checklist
- [ ] Fresh start (`localStorage.clear(); location.reload()`) shows the setup screen
- [ ] Commander Battle, 3 opponents, "Mixed" decks — CPU windows, counters, blocks, your attack declaration, undo, reload mid-round
- [ ] Easy Garruk / Hard Garruk — wolves, slay, Overrun the Weak, undo
- [ ] Horde Mode — waves, deck depletion, win condition
- [ ] Aether Conclave — named creatures, auras, spell locks
- [ ] Commander Rival adventure — ramp, Rukha cast, gear, commander damage
- [ ] Settings — themes, turn recap, export backup → clear storage → import backup restores the game
- [ ] Space / Enter advances; clicking the backdrop or Escape closes dismissible popups only
- [ ] Graveyard / exile viewers, restart

## Commander mode

**More CPU archetypes** (deck seam is done — see docs/OVERHAUL_CONTRACT.md "Wave 3 — decks")
- Esper Artifacts — engines, protection, selective resets; would exercise CPU counterspells
- Mardu Aristocrats — fodder, sacrifice value, drains, rebuild after wipes
- Sultai Graveyard — mill, reanimate, recursion

**Known approximations**
- CPUs cannot protect their creatures against another CPU's symmetric wipe (wipe resolves inside the CPU main phase)
- Lifelink from blocked attackers in your attack declaration is estimated
- Gruul Voltron vs Boros Tokens balance: Boros is slightly stronger in harsher sims — revisit after playtesting

## Deferred (not planned until it adds real value)
- **Decklist import** (e.g. Moxfield). The player plays a paper deck; importing it would make them track the same deck in two places. Revisit only if it unlocks something counts can't (e.g. accurate blockers or removal targets) without double bookkeeping.
- **Native/desktop builds and stores** — the web version is the product.

## Done
- Modular refactor (`js/data`, `js/engine`, `js/ui`) and headless simulation tests (`npm test`)
- Commander UX: sticky confirm bar with outcome preview, Space/Enter, numbered response steps, turn recap, settings dialog, four themes, UI scaling
- Rules: two response windows per CPU turn, working counters, trample/planeswalker blocks, per-owner untap, double strike, poison, bounce, tokens, random first seat, your hand/library tracking
- Player attack declaration with CPU blocks
- CPU behaviour: lethal awareness, archenemy targeting, home guard, wipe policy, held mana + instant-speed protection, difficulty settings
- Second archetype: Boros Tokens
- Popups close on backdrop click / Escape (except prompts whose second button is an answer)
- Save backup export / import
