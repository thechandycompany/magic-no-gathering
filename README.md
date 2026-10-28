# Magic No Gathering

**Solo Commander Simulator** · _Alpha_

A free, unofficial **Magic: The Gathering** fan project: a solo Commander table for your **real paper deck**.
You play your own cards at a physical table. The app runs 1–4 CPU Commander opponents, their decks, hands,
mana, commanders, attacks, and fights with each other, and gives you a response window on every CPU turn.
It also includes scripted one-on-one encounters (Solo Adventures).

Free to play. No ads, no accounts, no paid features.

## Play
- **Online:** https://thechandycompany.github.io/magic-no-gathering/
- **Offline:** open `index.html` in a browser. No install, no server, no internet needed.

Your game saves automatically in this browser. Use **⚙ Settings → Export backup** to keep a copy or move it to another device.

## Alpha feedback
This is an early alpha. Send bugs and ideas to **thechandycompany@gmail.com**, or use **Feedback** in Settings → About.

## How a Commander game works
1. Choose 1–4 opponents, their decks (or "Mixed"), and a difficulty on the setup screen.
2. On each CPU turn, the app shows what it did and only stops when you can respond: counter a spell, remove creatures, or declare blockers in a popup when it attacks you. The main button previews the result ("Take 7 (6 commander)"). Press it or Space/Enter.
3. On your turn the draw happens automatically: main phase → declare attackers (CPUs choose blocks) → main phase 2.
4. Add your creatures as cards (+ Creature, with a number of copies) to attack and block with them in one click, or just keep a count. Your hand stays on your table and is not tracked.

## Fan content & donations
This project follows Wizards of the Coast's [Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy):

> Magic No Gathering is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.

- The game is **free**.
- **Donations are optional** via [Ko-fi](https://ko-fi.com/chandlerandrew) (`DONATION_URL` in `js/data/modes.js`).
- **No Wizards logos, set symbols, mana-symbol artwork, or card images** are included.
- Real card names, characters, and rules terms are used descriptively. "Magic No Gathering" is a fan parody title (`GAME_TITLE`).
- The notice above stays visible in the app (Settings → About) and on any page that hosts the game.

## Publish a new version
The game is plain static files, with no build step.
1. Bump every `?v=N` query in `index.html`.
2. Run `npm test -- --strict` (Node 18+, no dependencies).
3. **itch.io:** zip the game files with `index.html` at the root, upload as an HTML5 game, set pricing to "No payments", and include the fan-content notice in the description.
   **GitHub Pages:** Settings → Pages → deploy from the default branch root.

## License
The code is free software under the **GNU General Public License v3.0 or later**. See [`LICENSE`](LICENSE).

The license covers this project's own code only. Magic: The Gathering names, card text and other Wizards of the Coast
material are **not** licensed here.

## Develop
- `CLAUDE.md`: architecture, where code goes, and the hard rules.
- `docs/OVERHAUL_CONTRACT.md`: engine ↔ UI contract (CPU turn phases, response resolution, deck plug-in seam).
- `tests/README.md`: headless simulation tests (`npm test`, `npm test -- --strict`, `SIM_GAMES=1000 npm test`).
- `TODO.md`: release checklist, roadmap, deferred ideas.

Settings in one place (`js/data/modes.js`): `GAME_TITLE`, `GAME_TAGLINE`, `GAME_STAGE`, `DONATION_URL`, `SOURCE_URL`, `FEEDBACK_EMAIL`.
