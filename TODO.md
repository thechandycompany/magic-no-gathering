# Magic No Gathering — TODO

## Commander Rival: Discard Interaction

Add player-side discard/mill actions that interact with Rukha's finite virtual hand and deck.

**Planned:**
- Player-turn action to force Rukha to discard from her virtual hand
- Random discard (e.g. "discard 2") — engine removes cards, AI keeps what matters most
- Targeted discard (e.g. Thoughtseize) — player picks the category (land, ramp, gear/other)
- Mill option — damage the virtual deck directly, bypassing the hand
- Hand size indicator visible in the Commander status badges
- AI discard priority: keeps lands if short, keeps ramp if commander not cast, keeps gear if commander is on field

**Design notes:**
- Discard decks delay Rukha's commander cast by stripping unplayed lands and ramp
- Once Rukha is topdecking, she can only act on what she draws each turn
- Mill overlaps with discard strategies and accelerates deck depletion
- Consider a "Rukha has no cards in hand" state where she skips non-combat development

## Second Commander Rival Archetype

Build a second Commander Rival opponent using the existing framework (finite virtual deck, typed hand, mana model, command zone, commander damage). The engine work is done; this is mostly content.

**Candidate archetypes (from original brainstorm):**
- **Esper Artifacts** — develops engines, protects them, creates artifact creatures, resets the board selectively
- **Mardu Aristocrats** — creates fodder, sacrifices creatures for value, drains life, rebuilds after wipes
- **Sultai Graveyard** — mills, reanimates, recurs threats, makes removal less final
- **Boros Tokens/Equipment** — goes wide or empowers its commander through equipment (closest analog to Voltron, so probably not the first pick for variety)

**Design notes:**
- Reuse VOLTRON_CARDS-style typed pool structure, but with archetype-appropriate categories (e.g. Aristocrats: sac outlets, token generators, drain effects instead of gear/protection/haymakers)
- Needs its own win condition framing — not every archetype should use commander damage as the primary clock (Aristocrats/Graveyard decks usually grind via card advantage + drain, not one big creature)
- Consider whether this should be a wholly separate mode or a "commander select" step within a shared "Commander Rival" mode
