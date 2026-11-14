import type { ItemDef } from '../model/types';

// Enemy items use the same data shape as player items: they sit on a grid, have
// a cooldown, and fire automatically once per cycle. Effects name their target
// explicitly, so an enemy item can hurt the player, shield its owner, or slow
// the player's engine.
//
// These are deliberately simple stat blocks: the interesting decisions on the
// enemy side come from which items are about to fire and what you do about it.

export const ENEMY_ITEMS: ItemDef[] = [
  {
    id: 'rat_claw',
    name: 'Claw',
    icon: '🩸',
    rarity: 'common',
    tags: ['weapon', 'beast'],
    size: [1, 1],
    cooldown: 1,
    text: 'Deal 6 damage.',
    abilities: [{ trigger: 'activate', effects: [{ type: 'damage', amount: 6, on: 'player' }] }],
  },
  {
    id: 'rat_gnaw',
    name: 'Gnaw',
    icon: '🦷',
    rarity: 'common',
    tags: ['weapon', 'beast'],
    size: [1, 1],
    cooldown: 3,
    text: 'Deal 5 damage. Apply 1 Vulnerable.',
    abilities: [
      {
        trigger: 'activate',
        effects: [
          { type: 'damage', amount: 5, on: 'player' },
          { type: 'status', status: 'vulnerable', amount: 1, on: 'player' },
        ],
      },
    ],
  },
  {
    id: 'wisp_chill',
    name: 'Chill Touch',
    icon: '❄️',
    rarity: 'common',
    tags: ['spell', 'ash'],
    size: [1, 1],
    cooldown: 2,
    text: 'Deal 5 damage.',
    abilities: [{ trigger: 'activate', effects: [{ type: 'damage', amount: 5, on: 'player' }] }],
  },
  {
    id: 'wisp_ash',
    name: 'Ashen Veil',
    icon: '🌫️',
    rarity: 'common',
    tags: ['spell', 'ash', 'fire'],
    size: [1, 1],
    cooldown: 3,
    text: 'Apply 2 Burning.',
    abilities: [{ trigger: 'activate', effects: [{ type: 'status', status: 'burning', amount: 2, on: 'player' }] }],
  },
  {
    id: 'wisp_smother',
    name: 'Smother',
    icon: '🕸️',
    rarity: 'uncommon',
    tags: ['spell', 'ash'],
    size: [1, 1],
    cooldown: 4,
    text: 'Slow your fastest item. Deal 4 damage.',
    abilities: [
      {
        trigger: 'activate',
        effects: [
          { type: 'delay', amount: 1, count: 1 },
          { type: 'damage', amount: 4, on: 'player' },
        ],
      },
    ],
  },
  {
    id: 'golem_slam',
    name: 'Iron Slam',
    icon: '🔨',
    rarity: 'uncommon',
    tags: ['weapon', 'steel'],
    size: [2, 1],
    cooldown: 2,
    text: 'Deal 13 damage.',
    abilities: [{ trigger: 'activate', effects: [{ type: 'damage', amount: 13, on: 'player' }] }],
  },
  {
    id: 'golem_plating',
    name: 'Hot Plating',
    icon: '🧱',
    rarity: 'common',
    tags: ['armour', 'steel'],
    size: [1, 1],
    cooldown: 3,
    text: 'Gain 9 Block.',
    abilities: [{ trigger: 'activate', effects: [{ type: 'block', amount: 9, on: 'enemy' }] }],
  },
  {
    id: 'golem_blast',
    name: 'Furnace Blast',
    icon: '💥',
    rarity: 'uncommon',
    tags: ['spell', 'fire'],
    size: [1, 1],
    cooldown: 4,
    text: 'Deal 7 damage. Apply 2 Burning.',
    abilities: [
      {
        trigger: 'activate',
        effects: [
          { type: 'damage', amount: 7, on: 'player' },
          { type: 'status', status: 'burning', amount: 2, on: 'player' },
        ],
      },
    ],
  },
  {
    id: 'bellows_gale',
    name: 'Gale Hammer',
    icon: '🌪️',
    rarity: 'rare',
    tags: ['weapon', 'storm'],
    size: [2, 1],
    cooldown: 3,
    text: 'Deal 16 damage.',
    abilities: [{ trigger: 'activate', effects: [{ type: 'damage', amount: 16, on: 'player' }] }],
  },
  {
    id: 'bellows_coals',
    name: 'Banked Coals',
    icon: '🔥',
    rarity: 'uncommon',
    tags: ['armour', 'fire'],
    size: [1, 1],
    cooldown: 3,
    text: 'Gain 10 Block. Apply 2 Burning.',
    abilities: [
      {
        trigger: 'activate',
        effects: [
          { type: 'block', amount: 10, on: 'enemy' },
          { type: 'status', status: 'burning', amount: 2, on: 'player' },
        ],
      },
    ],
  },
  {
    id: 'bellows_twin',
    name: 'Twin Blast',
    icon: '⚡',
    rarity: 'uncommon',
    tags: ['weapon', 'storm'],
    size: [1, 1],
    cooldown: 2,
    text: 'Deal 6 damage twice.',
    abilities: [{ trigger: 'activate', effects: [{ type: 'damage', amount: 6, times: 2, on: 'player' }] }],
  },
  {
    id: 'bellows_draft',
    name: 'Smothering Draft',
    icon: '🌬️',
    rarity: 'rare',
    tags: ['spell', 'storm'],
    size: [1, 1],
    cooldown: 4,
    text: 'Slow two of your items. Deal 6 damage.',
    abilities: [
      {
        trigger: 'activate',
        effects: [
          { type: 'delay', amount: 1, count: 2 },
          { type: 'damage', amount: 6, on: 'player' },
        ],
      },
    ],
  },
];

export const ENEMY_ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(
  ENEMY_ITEMS.map((item) => [item.id, item]),
);

export function getEnemyItem(id: string): ItemDef {
  const def = ENEMY_ITEM_BY_ID[id];
  if (!def) throw new Error(`Unknown enemy item: ${id}`);
  return def;
}
