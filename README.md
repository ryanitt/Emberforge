# Emberforge

A tactical engine-building roguelite prototype: place items on a small grid,
let them fire automatically every beat, and use a deck of cards to bend their
timing at the right moment.

Built from the design blueprint in `docs/`: *items define the machine, cards let
you control it*.

## Play

```bash
bun install
bun dev        # http://localhost:3000
```

Other commands:

```bash
bun run typecheck   # tsc --noEmit
bun run build       # typecheck + production build
bun test            # rules and UI regression tests
bun run balance     # fight lengths and completion for every route in the act
```

## What is in the prototype

- **Inventory engine**: 4×4 square grid with square cells, 1×1 to 2×2 items, drag
  to move, `R` or the Rotate button to re-orient, swap by dropping onto another
  item, edge-adjacency bonuses recomputed when combat starts, bench for items
  that do not fit. Rotation keeps an item's shape and nudges to the nearest free
  cell if its own spot is blocked.
- **Two engines**: your items fire at the start of each beat; the enemy has its
  own visible 3×3 board whose items fire when you end your turn. Both boards show
  cooldowns, ready states and block.
- **Beat-based combat**: items activate on cooldowns of N beats, the enemy's
  loaded items are listed before you commit, and block resets each beat (enemy
  block clears when its engine fires).
- **Cards**: 13 cards, 3 energy, 5-card hand; triggers, cooldown manipulation,
  empowerment, defence, and Sabotage for reaching into the enemy's board.
  Targeted cards glow the legal targets on the correct board.
- **Synergies**: 12 items with auras (damage, cooldown, burning), event-driven
  reactions with a once-per-beat rule, and a chain cap so loops stop safely.
- **Statuses**: Burning (damage over time, ignores block) and Vulnerable (+50%
  damage taken).
- **Arena**: both fighters are drawn as pixel-art sprites facing each other
  between the boards. They lean in when their items fire, flash and recoil when
  hit, and collapse to the floor when they die. Elites and the boss are drawn
  larger than ordinary enemies.
- **Animation**: every resolved effect is replayed — projectiles between the
  fighters, floating damage/block numbers, hit shakes and firing flashes — while
  the log keeps the ordered account.
- **Run loop**: 9-node hand-authored act, combats, an elite with a relic drop,
  merchant (items, cards, healing, card removal), rest site, treasure, and a boss.

One character (the Pyromancer), 12 player items, 12 enemy items, 13 cards,
3 relics, 4 enemies.

## Controls

- Click a card to play it. Cards marked *targets item* ask you to click a glowing
  item on the grid.
- `End turn` runs the enemy, ticks statuses and cooldowns, and starts the next
  beat.
- On the loadout screen: drag items between grid cells and the bench, `R` or the
  Rotate button re-orients the selected item, dropping onto another item swaps
  them.

## Docs

- [`docs/COMBAT_RULES.md`](docs/COMBAT_RULES.md) — exact turn sequence, damage
  pipeline, cooldowns, statuses, trigger caps.
- [`docs/TECHNICAL_DESIGN.md`](docs/TECHNICAL_DESIGN.md) — module map, data flow,
  how to add content.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — why TypeScript instead of Godot 4,
  hand-discard rule, single-enemy scope, and other judgement calls.

## Structure

```
src/model      pure rules (inventory, combat, run) — no DOM
src/data       item/card/enemy/relic/map content
src/ui         screens, input, theme
tests          rules test suite
```

## Not built yet

Sound, save/load, card and item upgrades, more characters, procedural maps,
multiple enemies per fight. The logic layer is written to absorb these (see the
roadmap notes in `docs/DECISIONS.md`).
