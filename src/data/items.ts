import type { ItemDef } from '../model/types';

// Prototype item catalogue. Six to twelve items that interact, rather than a
// large pool: the point is that combinations are readable and distinct.
//
// Tags in use: weapon, shield, fire, lightning, steel, thorn, rune, trinket,
// alchemy, gear.

export const ITEMS: ItemDef[] = [
  {
    id: 'fire_wand',
    name: 'Fire Wand',
    icon: '🔥',
    rarity: 'common',
    tags: ['weapon', 'fire'],
    size: [1, 2],
    cooldown: 2,
    text: 'Deal 8 damage. Apply 1 Burning.',
    abilities: [
      {
        trigger: 'activate',
        effects: [
          { type: 'damage', amount: 8, on: 'enemy' },
          { type: 'status', status: 'burning', amount: 1, on: 'enemy' },
        ],
      },
    ],
  },
  {
    id: 'greatsword',
    name: 'Greatsword',
    icon: '⚔️',
    rarity: 'uncommon',
    tags: ['weapon', 'steel'],
    size: [2, 2],
    cooldown: 3,
    text: 'Deal 16 damage.',
    abilities: [
      { trigger: 'activate', effects: [{ type: 'damage', amount: 16, on: 'enemy' }] },
    ],
  },
  {
    id: 'storm_coil',
    name: 'Storm Coil',
    icon: '⚡',
    rarity: 'uncommon',
    tags: ['weapon', 'lightning'],
    size: [1, 2],
    cooldown: 3,
    text: 'Deal 4 damage twice.',
    abilities: [
      { trigger: 'activate', effects: [{ type: 'damage', amount: 4, times: 2, on: 'enemy' }] },
    ],
  },
  {
    id: 'iron_shield',
    name: 'Iron Shield',
    icon: '🛡️',
    rarity: 'common',
    tags: ['shield', 'steel'],
    size: [2, 1],
    cooldown: 3,
    text: 'Gain 8 Block.',
    abilities: [
      { trigger: 'activate', effects: [{ type: 'block', amount: 8, on: 'player' }] },
    ],
  },
  {
    id: 'thorn_buckler',
    name: 'Thorn Buckler',
    icon: '🌵',
    rarity: 'common',
    tags: ['shield', 'thorn'],
    size: [1, 1],
    cooldown: 2,
    text: 'Gain 4 Block. Deal 2 damage.',
    abilities: [
      {
        trigger: 'activate',
        effects: [
          { type: 'block', amount: 4, on: 'player' },
          { type: 'damage', amount: 2, on: 'enemy' },
        ],
      },
    ],
  },
  {
    id: 'fire_rune',
    name: 'Fire Rune',
    icon: '🧿',
    rarity: 'uncommon',
    tags: ['rune', 'fire'],
    size: [1, 1],
    cooldown: 0,
    text: 'Adjacent weapons deal +3 damage.',
    abilities: [],
    aura: [{ stat: 'damage', amount: 3, requireTag: 'weapon' }],
  },
  {
    id: 'conductor',
    name: 'Conductor',
    icon: '🔗',
    rarity: 'uncommon',
    tags: ['trinket', 'lightning'],
    size: [1, 1],
    cooldown: 0,
    text: 'Adjacent items activate 1 beat faster.',
    abilities: [],
    aura: [{ stat: 'cooldown', amount: 1 }],
  },
  {
    id: 'sooty_bellows',
    name: 'Sooty Bellows',
    icon: '🌬️',
    rarity: 'common',
    tags: ['trinket', 'fire'],
    size: [1, 1],
    cooldown: 0,
    text: 'Adjacent fire items apply +1 Burning.',
    abilities: [],
    aura: [{ stat: 'burning', amount: 1, requireTag: 'fire' }],
  },
  {
    id: 'ember_lantern',
    name: 'Ember Lantern',
    icon: '🏮',
    rarity: 'common',
    tags: ['trinket', 'fire'],
    size: [1, 1],
    cooldown: 3,
    text: 'Apply 2 Burning.',
    abilities: [
      { trigger: 'activate', effects: [{ type: 'status', status: 'burning', amount: 2, on: 'enemy' }] },
    ],
  },
  {
    id: 'alchemist_flask',
    name: "Alchemist's Flask",
    icon: '🧪',
    rarity: 'uncommon',
    tags: ['trinket', 'alchemy'],
    size: [1, 1],
    cooldown: 4,
    text: 'Draw 1 card. Gain 4 Block.',
    abilities: [
      {
        trigger: 'activate',
        effects: [
          { type: 'draw', amount: 1 },
          { type: 'block', amount: 4, on: 'player' },
        ],
      },
    ],
  },
  {
    id: 'clockwork_heart',
    name: 'Clockwork Heart',
    icon: '⚙️',
    rarity: 'rare',
    tags: ['gear'],
    size: [2, 1],
    cooldown: 4,
    text: 'Reduce all item cooldowns by 1.',
    abilities: [
      { trigger: 'activate', effects: [{ type: 'cooldowns', amount: 1 }] },
    ],
  },
  {
    id: 'phoenix_feather',
    name: 'Phoenix Feather',
    icon: '🪶',
    rarity: 'rare',
    tags: ['trinket', 'fire'],
    size: [1, 1],
    cooldown: 0,
    text: 'When Burning is applied to the enemy, reduce all cooldowns by 1 (once per beat).',
    abilities: [
      {
        trigger: 'event',
        event: { name: 'status_applied', status: 'burning', on: 'enemy', oncePerBeat: true },
        effects: [{ type: 'cooldowns', amount: 1 }],
      },
    ],
  },
];

export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(
  ITEMS.map((item) => [item.id, item]),
);

export function getItem(id: string): ItemDef {
  const def = ITEM_BY_ID[id];
  if (!def) throw new Error(`Unknown item: ${id}`);
  return def;
}
