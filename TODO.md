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
