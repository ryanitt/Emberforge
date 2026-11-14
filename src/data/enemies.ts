import type { EnemyDef } from '../model/types';

// Enemies are engines too: each one brings items on a small square board, and
// those items fire on their own cooldowns during the enemy phase. Nothing is
// hidden — the board shows what is about to fire, and cards can reach across to
// slow an enemy item down.
//
// Balance notes: a normal fight should last roughly five beats with the starter
// engine. Enemy health is set against the measured damage of the starter build,
// and the items' cooldowns set the pressure per beat.

export const ENEMIES: EnemyDef[] = [
  {
    id: 'cinder_rat',
    name: 'Cinder Rat',
    icon: '🐀',
    sprite: 'cinder_rat',
    hp: 104,
    blurb: 'A scavenger with a fast claw and a slow bite.',
    board: [3, 3],
    items: [
      { defId: 'rat_claw', pos: [0, 1] },
      { defId: 'rat_gnaw', pos: [1, 1] },
    ],
  },
  {
    id: 'ash_wisp',
    name: 'Ash Wisp',
    icon: '👻',
    sprite: 'ash_wisp',
    hp: 92,
    blurb: 'It smothers your hottest gear.',
    board: [3, 3],
    items: [
      { defId: 'wisp_chill', pos: [0, 1] },
      { defId: 'wisp_ash', pos: [1, 1] },
      { defId: 'wisp_smother', pos: [2, 1] },
    ],
  },
  {
    id: 'furnace_golem',
    name: 'Furnace Golem',
    icon: '🗿',
    sprite: 'furnace_golem',
    hp: 140,
    blurb: 'An elite: slow, heavy, and plated.',
    board: [3, 3],
    items: [
      { defId: 'golem_slam', pos: [0, 1] },
      { defId: 'golem_plating', pos: [2, 1] },
      { defId: 'golem_blast', pos: [0, 2] },
    ],
  },
  {
    id: 'the_bellows',
    name: 'The Bellows',
    icon: '🌋',
    sprite: 'the_bellows',
    hp: 200,
    blurb: 'The forge itself, breathing on you.',
    board: [3, 3],
    items: [
      { defId: 'bellows_gale', pos: [0, 0] },
      { defId: 'bellows_coals', pos: [2, 0] },
      { defId: 'bellows_twin', pos: [0, 1] },
      { defId: 'bellows_draft', pos: [1, 1] },
    ],
  },
];

export const ENEMY_BY_ID: Record<string, EnemyDef> = Object.fromEntries(
  ENEMIES.map((enemy) => [enemy.id, enemy]),
);

export function getEnemy(id: string): EnemyDef {
  const def = ENEMY_BY_ID[id];
  if (!def) throw new Error(`Unknown enemy: ${id}`);
  return def;
}
