import type { CardDef } from '../model/types';

// Cards are the tactical layer: they manipulate the item engine (triggering,
// cooling down, amplifying) rather than being a second damage system.

export const CARDS: CardDef[] = [
  {
    id: 'spark',
    name: 'Spark',
    cost: 1,
    rarity: 'common',
    text: 'Deal 5 damage.',
    ops: [{ op: 'damage', amount: 5 }],
  },
  {
    id: 'stoke',
    name: 'Stoke',
    cost: 0,
    rarity: 'common',
    text: 'Deal 3 damage. Draw 1 card if the enemy is Burning.',
    ops: [{ op: 'damage', amount: 3, drawIfBurning: 1 }],
  },
  {
    id: 'overcharge',
    name: 'Overcharge',
    cost: 1,
    rarity: 'common',
    text: 'Trigger a chosen item. It gains its normal cooldown.',
    ops: [{ op: 'trigger', scope: 'chosen' }],
    needsItem: true,
  },
  {
    id: 'accelerate',
    name: 'Accelerate',
    cost: 1,
    rarity: 'uncommon',
    text: 'Reduce all item cooldowns by 1.',
    ops: [{ op: 'cooldowns', amount: 1 }],
  },
  {
    id: 'ignition',
    name: 'Ignition',
    cost: 2,
    rarity: 'rare',
    text: 'Trigger every fire item that has not activated this beat.',
    ops: [{ op: 'trigger', scope: 'fire' }],
  },
  {
    id: 'reinforce',
    name: 'Reinforce',
    cost: 1,
    rarity: 'common',
    text: 'Gain 7 Block.',
    ops: [{ op: 'block', amount: 7 }],
  },
  {
    id: 'oil_the_target',
    name: 'Oil the Target',
    cost: 1,
    rarity: 'common',
    text: 'Apply 2 Burning.',
    ops: [{ op: 'status', status: 'burning', amount: 2 }],
  },
  {
    id: 'scavenge',
    name: 'Scavenge',
    cost: 0,
    rarity: 'common',
    text: 'Draw 1 card. Draw 1 more if an item activated this beat.',
    ops: [{ op: 'draw', amount: 1, extraIfItemActivated: true }],
  },
  {
    id: 'flourish',
    name: 'Flourish',
    cost: 1,
    rarity: 'uncommon',
    text: 'The next item to activate this beat deals double damage.',
    ops: [{ op: 'double_next' }],
  },
  {
    id: 'interrupt',
    name: 'Interrupt',
    cost: 1,
    rarity: 'common',
    text: 'Apply 2 Vulnerable.',
    ops: [{ op: 'status', status: 'vulnerable', amount: 2 }],
  },
  {
    id: 'unwind',
    name: 'Unwind',
    cost: 1,
    rarity: 'uncommon',
    text: "A chosen item's cooldown becomes 0.",
    ops: [{ op: 'item_ready' }],
    needsItem: true,
  },
  {
    id: 'echo',
    name: 'Echo',
    cost: 1,
    rarity: 'rare',
    text: 'Trigger a chosen item again, ignoring the once-per-beat limit.',
    ops: [{ op: 'trigger', scope: 'chosen', bypassLimit: true }],
    needsItem: true,
  },
  {
    id: 'sabotage',
    name: 'Sabotage',
    cost: 1,
    rarity: 'common',
    text: "Increase a chosen enemy item's cooldown by 2.",
    ops: [{ op: 'enemy_item_delay', amount: 2 }],
    needsEnemyItem: true,
  },
];

export const CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(
  CARDS.map((card) => [card.id, card]),
);

export function getCard(id: string): CardDef {
  const def = CARD_BY_ID[id];
  if (!def) throw new Error(`Unknown card: ${id}`);
  return def;
}

/** Pyromancer starter deck: mostly basic attacks plus a little engine control. */
export const STARTER_DECK: string[] = [
  'spark',
  'spark',
  'spark',
  'reinforce',
  'reinforce',
  'reinforce',
  'overcharge',
  'oil_the_target',
  'scavenge',
  'sabotage',
];
