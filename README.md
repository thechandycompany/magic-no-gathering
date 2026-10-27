# Rivals at the Table

A free, unofficial **Magic: The Gathering** fan project: a solo Commander table for your **real paper deck**.
You play your own cards at a physical table; the app runs 1–4 CPU Commander opponents — their decks, hands,
mana, commanders, attacks, and fights with each other — and gives you a response window on every CPU turn.
It also includes scripted one-on-one encounters (Solo Adventures).

Free to play. No ads, no accounts, no paid features. Donations are optional and unlock nothing.

## Play
- **Online:** _add the public itch.io / GitHub Pages URL here after publishing._
- **Offline:** download or clone this repo and open `index.html` in a browser. No install, no server, no internet needed.

Your game saves automatically in this browser. Use **⚙ Settings → Export backup** to keep a copy or move it
to another device — clearing browser data erases saves otherwise.

## How a Commander game works
1. Choose 1–4 opponents, their decks (or "Mixed"), and a difficulty on the setup screen.
2. On each CPU turn, the app shows what it did, then numbered steps: counter a spell → block or remove creatures → damage to you. The main button previews the result ("Take 7 (6 cmdr)"); press it or Space/Enter.
3. On your turn, follow the steps: draw → main phase → declare attackers (CPUs choose blocks) → main phase 2.
4. Your own board is tracked as counts (creatures, life, planeswalkers) — the cards stay on your table.

## Fan content & donations
This project follows Wizards of the Coast's [Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy):

> Rivals at the Table is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.

That means:
- The game is **free** — never paywall it, sell it, or gate any feature behind a payment.
- **Donations are optional tips** (set `DONATION_URL` in `js/data/modes.js`; leave it empty to hide the button). Donors get nothing extra.
- **No Wizards logos, set symbols, mana-symbol artwork, or card images** are included. The app uses emoji and original styling.
- Real card names, characters, and rules terms are used descriptively; the product name ("Rivals at the Table") is original and the project never claims to be official.
- Keep the notice above visible in the app (Settings → About) and on any page that hosts the game.

This is a summary for contributors, not legal advice — read the policy itself before publishing.

## Publish a new version
The game is plain static files — there is no build step.
1. Bump every `?v=N` query in `index.html` so browsers fetch the new scripts.
2. Run `npm test -- --strict` (Node 18+, no dependencies).
3. **itch.io:** zip the repo contents with `index.html` at the root (exclude `.git/`, `backup/`, `node_modules/`, `.claude/`), upload as an HTML5 game, set pricing to "No payments" or "Name your own price" with a $0 minimum, and include the fan-content notice in the description.
   **GitHub Pages:** push to a public repo → Settings → Pages → deploy from the default branch root.

## Develop
- `CLAUDE.md` — architecture, where code goes, and the hard rules (including the fan-content rules).
- `docs/OVERHAUL_CONTRACT.md` — engine ↔ UI contract (CPU turn phases, response resolution, deck plug-in seam).
- `tests/README.md` — headless simulation tests: `npm test`, `npm test -- --strict`, `SIM_GAMES=1000 npm test`.
- `TODO.md` — release checklist, roadmap, deferred ideas.

Settings you can change in one place (`js/data/modes.js`): `GAME_TITLE`, `DONATION_URL`, `SOURCE_URL`.
