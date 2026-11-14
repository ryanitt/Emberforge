# Emberforge — combat rules

This is the authoritative reference for the implemented rules. If a number here
and a number in the game disagree, the game is wrong.

## Two engines

Both sides fight with items on a grid.

- **Your items** sit on a 4×4 square board and fire at the **start of every
  beat**. You arrange them between encounters; they are locked during combat.
- **Enemy items** sit on the enemy's own board (3×3). They fire during the
  **enemy phase**, when you end your turn. Their board is visible, their
  cooldowns are visible, and the panel lists exactly what is about to fire.

Every item — yours or theirs — has `cooldown_max`, a current cooldown, and one
or more activate abilities. Items with no activate ability are passives.

## Turn structure (one beat)

1. **Start of beat** — beat counter increments, player Block resets to 0, energy
   is set to 3, per-beat markers clear (activated items, once-per-beat reactions,
   the trigger-chain counter). Relic beat effects fire. Every player item whose
   cooldown is 0 and that has an activate ability fires, in grid reading order.
2. **Trigger chain** — item reactions resolve immediately inside step 1, driven
   by events (`status_applied` today).
3. **Draw** — draw until the hand holds 5 cards (max 10), reshuffling the discard
   pile when the draw pile is empty.
4. **Player phase** — spend energy on cards, take as long as you like.
5. **End turn** — remaining hand is discarded, and the enemy's Block is cleared.
6. **Enemy phase** — every enemy item whose cooldown is 0 fires, in reading
   order.
7. **Status phase** — Burning deals its stack in damage (ignoring Block), then
   decays by 1; Vulnerable decays by 1.
8. **Cooldown phase** — every positive cooldown ticks down by 1 (both boards),
   then the next beat starts.

## Cooldowns

- `cooldown_max` is the number of beats between activations.
- An activating item sets its cooldown back to `cooldown_max`.
- Cooldowns tick once at the end of each beat.
- Therefore cooldown 2 activates on beats 1, 3, 5… — "every second beat".
- An item cannot activate twice in one beat **unless** a card explicitly says so
  (`Echo`, which bypasses the limit).
- A card-triggered activation still pays the full cooldown.
- Items with `cooldown_max` 0 and no activate ability are passives: they never
  activate and their aura is always on.
- At combat start all items on both sides are ready, so beat 1 begins with a full
  exchange.

## Damage pipeline

1. Base damage from the effect.
2. Add the source item's adjacency `damage` bonus (your items only).
3. Double if the item activation was empowered by `Flourish`.
4. Multiply by 1.5 and round **down** if the target is Vulnerable.
5. Block absorbs damage first and is spent.
6. Remaining damage reduces health.
7. Victory/defeat is checked immediately; further effects in the same chain stop.

Status damage (Burning) ignores Block.

### Block lifetimes

- **Player Block** resets at the start of every beat, so defending is a per-beat
  decision. It protects you during the enemy phase.
- **Enemy Block** clears when the enemy engine fires (start of the enemy phase),
  so Block an enemy item grants survives your whole next turn and must be chewed
  through.

Block is always shown on both panels, including at 0, alongside energy.

## Statuses

| Status | Effect | Decay |
| --- | --- | --- |
| Burning | At the end of the beat, take damage equal to the stack, ignoring Block | −1 per beat |
| Vulnerable | Takes 50% more damage | −1 per beat |

Both stack additively. Burning applied to the enemy is the event that reactive
items listen to.

## Inventory grid and rotation

- The player grid is **4×4 square**, with square cells.
- Items occupy rectangles of cells: 1×1, 1×2, 2×1, 2×2.
- Two items are adjacent when at least one of their cells shares an **edge**.
  Diagonal contact does not count.
- Rotation swaps an item's orientation (1×2 ⇄ 2×1) and never changes how many
  cells it occupies. A square item stays square.
- If the rotated shape cannot fit where the item sits, it nudges to the nearest
  legal cell instead of failing silently. Rotation only fails when no placement
  exists at all.

Auras are recomputed only when combat is built from the current inventory, so
moving items between fights re-wires the engine.

## Enemy targeting

Cards may point at the enemy's board. Today that is **Sabotage** (1 energy):
increase a chosen enemy item's cooldown by 2, pushing its damage out of the
coming turns. Enemy items glow as legal targets exactly like your own items,
and the card tells you which board to pick from.

## Trigger-chain safeguards

- A maximum of 40 resolved reactions per beat (counter resets each beat).
- Once-per-beat reactions mark themselves as used for the beat.
- Reactions are resolved from a flat queue, so a chain cannot nest.
- When the cap is hit the chain stops and the log says so.
- Items never know about each other by name; they react to events only.

## Cards, energy, piles

- 3 energy per player phase, 5 cards drawn per beat, hand limit 10.
- Played cards go to the discard pile; the discard pile reshuffles into the draw
  pile when it is empty.
- A card that says "trigger a chosen item" requires picking one of your items. A
  card that names an enemy item requires picking from the enemy board. Only legal
  targets glow.

## Readability

- Every resolved effect is recorded as a structured event (attacker side, source
  item, target, amount). The screen replays those events as projectiles, impact
  numbers, hit shakes and firing flashes.
- The combat log keeps the full ordered account, per beat.

## Balance targets (measured)

Measured with `bun run balance`, which plays every route through the act with a
greedy policy over 40 fixed seeds.

Starter engine, single encounter:

| Encounter | Beats (min–max) |
| --- | --- |
| Cinder Rat | 5.4 (5–6) |
| Ash Wisp | 4.8 (4–6) |

All six routes, aggregated by node type:

| Node | Beats (min–max) |
| --- | --- |
| Normal combat | 4.8 (3–7), n=640 |
| Elite | 6.8 (5–9), n=40 |
| Boss | 9.3 (5–14), n=240 |

223/240 runs (93%) complete the act, reaching the boss around 74/80 HP. Route
spread: rest routes 36–37/40, treasure routes 37/40, merchant route 39/40.

Enemy item cooldowns, not a fixed move pattern, set the pressure per beat; enemy
health is set against the starter engine's measured damage. Re-run the harness
after any change to item, card, enemy or player numbers, and check the per-route
split as well as the aggregate.

## Known simplifications

- One enemy per encounter; no multi-enemy targeting.
- Enemy items cannot be rearranged or destroyed — only delayed.
- No card upgrades, no item upgrades.
- Status immunity, resistances, and persistent shields are not implemented.
