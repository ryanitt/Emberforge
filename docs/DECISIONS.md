# Decisions

Short record of the choices that could otherwise look accidental.

## D1 — Browser/TypeScript instead of Godot 4 (prototype stage)

The blueprint recommends Godot 4 + GDScript. This build is TypeScript running in
the browser. Reasons:

- The prototype had to be playable and reviewable immediately in the environment
  it was built in; a Godot project cannot be run or previewed there.
- Every rule the blueprint cares about (beat timing, adjacency, effect
  resolution, trigger caps, run structure) is engine-independent and now proven
  in one spec file, `docs/COMBAT_RULES.md`, with a test suite behind it.

What this cost: `Control`-node UI, Godot signals, and editor tooling. What it
kept: the architecture the blueprint asks for — a pure rules layer, data-driven
content, and presentation separated from logic. Porting the model modules to
GDScript is a translation, not a redesign; the JSON-ish content modules map onto
`Resource` definitions.

If the project continues in Godot, treat this build as the design-validated
reference implementation and port milestone by milestone.

## D2 — Items start combat ready

Blueprint section 3.2 leaves the warm-up unspecified. Items start at cooldown 0,
so the opening beat is a full engine volley. This makes the engine instantly
legible ("my machine just fired") and gives cards something to react to on beat 1.

## D3 — The hand is discarded at end of turn

The blueprint's example `turn_manager` draws up to a hand size without
discarding. Implemented instead: discard the hand, draw 5. Persistent hands let
players hoard cards and removed the "spend energy now or lose the card" tension
that makes the card layer a real decision. Energy 3 / hand 5 keeps that tension.

## D4 — Single enemy per encounter

The blueprint mentions targeting and summoning; the prototype keeps one enemy so
targeting rules, intent display, and the log stay unambiguous. Multi-enemy
support needs a target picker in the UI and `Fighter` lists in the model; it is a
contained change because effects carry explicit `on` units.

## D5 — No save/load yet

Blueprint milestone 7 lists save/load; the prototype scope (section 16) does not.
Run state lives in memory, so a page refresh ends the run. Serialising the run is
small (the inventory is a flat item list) and is the first thing to add if runs
get long.

## D6 — Hand-authored act, no procedural map

Section 5 says to hand-author first. The act is a fixed 9-node graph with a
guaranteed route (asserted by a test). `map_generator` equivalent is deferred.

## D7 — Deterministic enemy patterns, seeded randomness

Enemy patterns cycle; rewards, shops, and encounters use a seeded PRNG derived
from the run seed. Nothing uses `Math.random()` inside rules, which keeps tests
stable and lets a run be reproduced from its seed.

## D8 — Cooldown convention

"Cooldown 2" means "activates every second beat": the item resets to 2 on
activation and the end-of-beat tick brings it to 1, then 0. Displayed to the
player as a countdown badge plus a READY state rather than an abstract number.

## D9 — Enemies fight with items, not a fixed move script

The blueprint describes enemies with intent patterns. Enemies now carry items on
their own board (`src/data/enemyItems.ts`) with cooldowns that fire in the enemy
phase. Reasons: it makes the two sides legible in the same terms (the player can
see *why* the damage is coming), it makes targeting enemy items meaningful rather
than decorative, and it removes the second, parallel system that intents would
otherwise need. The cost is that enemy behaviour is now emergent from cooldowns
instead of authored as a sequence, so pacing is tuned through cooldown lengths and
verified with `bun run balance`.

## D10 — Square grid, and rotation that nudges

The player board is 4×4 with square cells. The old 4×3 board with 78px rows made
items read as rectangles and made rotation look like the item changed shape.
Rotation was also being *rejected* whenever a neighbour occupied a cell the
rotated shape needed — the item stayed put, so the control looked broken. It now
finds the nearest legal cell (keeping the item's shape and area) and only refuses
when the board is genuinely full.

## D11 — Animations replay a model-side effect stream

Rules resolve instantly; `Combat.fx` records each landed effect (source side,
source item, target, amount, text) and the UI plays new entries with a short
stagger. Animations therefore can never block, reorder or delay the rules, and
the same stream can drive sound later. The trade-off is that the underlying state
is already final while the projectiles fly, which reads fine because the floating
numbers explain the change.

## D12 — Fighters are inline pixel art, not image assets

The arena's sprites are 16x16 character grids compiled to SVG rects at render
time. Reasons: no asset pipeline or loading state, the art lives review-able in
source next to the enemy that uses it, it scales crisply to any panel size, and a
content test can validate every grid. The cost is that each sprite is hand-drawn
characters rather than a drawing tool, so detail is capped at 16x16.
