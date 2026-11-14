import { CARDS, STARTER_DECK } from '../data/cards';
import { ITEMS } from '../data/items';
import { ENCOUNTER_TABLE, MAP_NODES, NODE_BY_ID } from '../data/map';
import { RELICS } from '../data/relics';
import { getEnemy } from '../data/enemies';
import { Combat } from './combat';
import { Inventory } from './inventory';
import { Rng } from './rng';
import type { CardDef, EnemyDef, ItemDef, MapNode, Rarity } from './types';

export type Screen =
  | 'title'
  | 'map'
  | 'loadout'
  | 'combat'
  | 'reward'
  | 'merchant'
  | 'rest'
  | 'treasure'
  | 'summary';

export interface RunState {
  seed: number;
  hp: number;
  maxHp: number;
  gold: number;
  inventory: Inventory;
  deck: string[];
  relics: string[];
  nodeId: string;
  visited: string[];
  floor: number;
  outcome: 'victory' | 'defeat' | null;
}

export interface RewardOption {
  kind: 'card' | 'item';
  id: string;
  rarity: Rarity;
}

export interface ShopItem {
  id: string;
  price: number;
  sold: boolean;
}

export interface ShopStock {
  items: ShopItem[];
  cards: ShopItem[];
  healAmount: number;
  healPrice: number;
  removePrice: number;
}

const RARITY_WEIGHT: Record<Rarity, number> = { common: 60, uncommon: 30, rare: 10 };

export const PRICES: Record<Rarity, { item: number; card: number }> = {
  common: { item: 42, card: 34 },
  uncommon: { item: 58, card: 48 },
  rare: { item: 78, card: 66 },
};

export function newRun(seed: number): RunState {
  const inventory = new Inventory(4, 4);
  inventory.add('fire_wand', [0, 0]);
  inventory.add('iron_shield', [1, 0]);
  inventory.add('fire_rune', [1, 1]);

  return {
    seed,
    hp: 80,
    maxHp: 80,
    gold: 50,
    inventory,
    deck: [...STARTER_DECK],
    relics: ['ember_sigil'],
    nodeId: 'start',
    visited: ['start'],
    floor: 0,
    outcome: null,
  };
}

export function currentNode(run: RunState): MapNode | null {
  return NODE_BY_ID[run.nodeId] ?? null;
}

export function availableNodes(run: RunState): MapNode[] {
  const node = currentNode(run);
  if (!node) return [];
  return node.next.map((id) => NODE_BY_ID[id]).filter((n): n is MapNode => Boolean(n));
}

export function nodeState(run: RunState, node: MapNode): 'visited' | 'current' | 'available' | 'locked' {
  if (node.id === run.nodeId) return 'current';
  if (run.visited.includes(node.id)) return 'visited';
  if (availableNodes(run).some((n) => n.id === node.id)) return 'available';
  return 'locked';
}

export function allNodes(): MapNode[] {
  return MAP_NODES;
}

export function enterNode(run: RunState, nodeId: string): MapNode {
  const node = NODE_BY_ID[nodeId];
  if (!node) throw new Error(`Unknown node: ${nodeId}`);
  run.nodeId = nodeId;
  if (!run.visited.includes(nodeId)) run.visited.push(nodeId);
  run.floor += 1;
  return node;
}

export function enemyForNode(run: RunState, node: MapNode, salt: number): EnemyDef {
  const table = ENCOUNTER_TABLE[node.type] ?? ENCOUNTER_TABLE.combat;
  const rng = new Rng(run.seed + salt * 977 + run.floor * 13);
  return getEnemy(rng.pick(table));
}

export function buildCombat(run: RunState, enemy: EnemyDef, salt: number): Combat {
  const placed = run.inventory.placed();
  const adjacency: Record<string, string[]> = {};
  for (const item of placed) {
    adjacency[item.id] = run.inventory.neighbours(item.id).map((n) => n.id);
  }
  return new Combat({
    items: placed.map((item) => ({
      id: item.id,
      defId: item.defId,
      pos: item.pos as [number, number],
      rotated: item.rotated,
    })),
    adjacency,
    deck: run.deck,
    relics: run.relics,
    hp: run.hp,
    maxHp: run.maxHp,
    enemy,
    seed: run.seed + salt * 7919 + run.floor * 31 + run.deck.length,
  });
}

function pickByRarity<T extends { rarity: Rarity }>(pool: T[], rng: Rng): T {
  const total = pool.reduce((sum, entry) => sum + RARITY_WEIGHT[entry.rarity], 0);
  let roll = rng.next() * total;
  for (const entry of pool) {
    roll -= RARITY_WEIGHT[entry.rarity];
    if (roll <= 0) return entry;
  }
  return pool[pool.length - 1];
}

/**
 * Rolls a reward selection. Cards are a little more common than items so the
 * tactical layer stays fed, and duplicates are removed.
 */
export function rollRewards(run: RunState, seed: number, count = 3, kind: 'mixed' | 'items' = 'mixed'): RewardOption[] {
  const rng = new Rng(seed);
  const options: RewardOption[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (options.length < count && guard++ < 60) {
    const wantsItem = kind === 'items' || rng.next() < 0.45;
    if (wantsItem) {
      const item = pickByRarity(ITEMS as ItemDef[], rng);
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      options.push({ kind: 'item', id: item.id, rarity: item.rarity });
    } else {
      const card = pickByRarity(CARDS as CardDef[], rng);
      if (seen.has(card.id)) continue;
      seen.add(card.id);
      options.push({ kind: 'card', id: card.id, rarity: card.rarity });
    }
  }
  return options;
}

export function goldForNode(run: RunState, node: MapNode, seed: number): number {
  const rng = new Rng(seed + 17);
  if (node.type === 'elite') return 38 + rng.int(14);
  if (node.type === 'treasure') return 25 + rng.int(16);
  if (node.type === 'boss') return 0;
  return 18 + rng.int(11);
}

export function addItemToRun(run: RunState, defId: string): 'placed' | 'bench' {
  const item = run.inventory.add(defId);
  const slot = run.inventory.firstFit(defId);
  if (slot) {
    run.inventory.place(item.id, slot.pos, slot.rotated);
    return 'placed';
  }
  return 'bench';
}

export function relicReward(run: RunState, seed: number): string | null {
  const owned = new Set(run.relics);
  const pool = RELICS.filter((relic) => !owned.has(relic.id));
  if (pool.length === 0) return null;
  const rng = new Rng(seed);
  return rng.pick(pool).id;
}

export function rollShop(seed: number): ShopStock {
  const rng = new Rng(seed);
  const items: ShopItem[] = [];
  const cards: ShopItem[] = [];
  const seen = new Set<string>();
  while (items.length < 2) {
    const def = pickByRarity(ITEMS as ItemDef[], rng);
    if (seen.has(`i:${def.id}`)) continue;
    seen.add(`i:${def.id}`);
    items.push({ id: def.id, price: PRICES[def.rarity].item, sold: false });
  }
  while (cards.length < 2) {
    const def = pickByRarity(CARDS as CardDef[], rng);
    if (seen.has(`c:${def.id}`)) continue;
    seen.add(`c:${def.id}`);
    cards.push({ id: def.id, price: PRICES[def.rarity].card, sold: false });
  }
  return {
    items,
    cards,
    healAmount: 14,
    healPrice: 26,
    removePrice: 42,
  };
}

