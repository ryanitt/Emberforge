# Emberforge — technical design

## Stack

| Area | Choice | Why |
| --- | --- | --- |
| Runtime | Browser, TypeScript | The prototype runs anywhere and previews instantly; see DECISIONS.md for why this replaces Godot 4 for now |
| Bundler | Vite | Instant dev server, no framework overhead |
| UI | Hand-rendered DOM + one CSS file | The screen is a control panel, not a game world; DOM gives free layout, hover and tooltips |
| Content | TypeScript data modules | Type-checked content, no loader, trivially exportable to JSON/Resources later |
| Tests | `bun test` | Fast headless checks on the pure rules |

## Module map

```
src/
  model/           pure rules — no DOM, no rendering
    types.ts       content + effect schemas
    inventory.ts   grid placement, rotation (with nudge), swapping, adjacency
    combat.ts      beat loop, both engines, effects, trigger chain, fx stream
    run.ts         run state, map progression, rewards, shop
    rng.ts         seeded PRNG
  data/            content only
    items.ts enemyItems.ts cards.ts enemies.ts relics.ts map.ts
  ui/
    app.ts         screen router, views, input handling
    dom.ts         escaping template helper
    sprites.ts     pixel-art fighters (art grids -> inline SVG)
    styles.css     theme
  main.ts          bootstrap
tests/rules.test.ts
```

## The rule that keeps this maintainable

Game rules live in `src/model` and return data. They never touch the DOM.
`src/ui` reads model state and renders it; an input handler calls one model
method and re-renders. Adding a screen or changing a layout never risks the
rules, and the rules are testable without a browser.

```
UI event → model method → mutated state → render() → HTML
```

`render()` rebuilds the current screen from state. That is deliberately
unoptimised: the DOM is small, and one-way state → HTML removes a whole class of
stale-UI bugs.

## Data flow of a fight

```
run.inventory (placed items)          run.deck
        │                                │
   buildCombat(run, enemy, salt) ────────┘
        │
        ▼
   Combat (pure)
     ├─ buildPlayerRuntimes(): auras → cooldown/bonus per item
     ├─ enemy items from enemy.items → their own runtimes
     ├─ beginBeat(): player items activate → resolve → draw
     ├─ playCard(): energy, effects, item triggers, enemy-item sabotage
     ├─ endTurn(): enemy items activate → statuses → cooldowns → next beat
     └─ log + fx: structured entries the UI renders and animates
        │
        ▼
   finishCombat(): write hp back, roll rewards
```

`fx` is an append-only list of landed effects. `App.render()` replays the entries
it has not seen yet (projectile → impact number → shake), so animation never
touches the rules. Keep it that way: the model must resolve without a DOM.

## Fighters

The arena draws one sprite per side. Each sprite is a 16x16 grid of palette keys
in `src/ui/sprites.ts`; the renderer run-length encodes rows into `<rect>`s, so
art is just data — no image files, nothing to load, and it stays crisp at any
size. `EnemyDef.sprite` names the art an enemy uses, and unknown names fall back
to the Pyromancer rather than rendering nothing. Because the art is data, the
content test can assert every sprite grid is 16x16 and that every enemy names one
that exists.

Adding an enemy item is a data-only change in `src/data/enemyItems.ts`; add its
placement to an enemy's `items` in `src/data/enemies.ts` and the harness will
pick it up automatically.

## Adding content

- **New item:** add an entry to `src/data/items.ts`. Use existing effect types
  and auras. No engine change is required for damage, block, status, draw,
  energy, cooldown, delay, and heal effects.
- **New card:** add an entry to `src/data/cards.ts` composed from `CardOp`s.
  A card needing a new op is the only reason to touch `resolveCardOp`.
- **New enemy:** add an entry to `src/data/enemies.ts` with moves and a pattern;
  point an encounter table at it in `src/data/map.ts`.
- **New effect or aura kind:** add it to the union in `types.ts`, handle it in
  `Combat.resolveEffect` / `applyAura`, then add a test.

## Tests

`bun test` covers inventory legality, adjacency (edge vs corner), cooldown
timing, the once-per-beat rule, card-triggered activations, block/vulnerable
resolution, burning decay, victory short-circuiting, item synergies, map
reachability, and reward/shop integrity. The suite is the acceptance gate for
rule changes.

## Screens

`title → loadout (first combat) → combat → reward → map → …  → summary`

Node types route to `loadout` (combat, elite, boss), `merchant`, `rest`, or the
treasure variant of the reward screen.
