// Shared data types for all game content. Everything the rules need is data;
// nothing in this file knows about the DOM.

export type Unit = 'player' | 'enemy';
export type Rarity = 'common' | 'uncommon' | 'rare';
export type StatusId = 'burning' | 'vulnerable';
export type Statuses = Record<StatusId, number>;

export type Effect =
  | { type: 'damage'; amount: number; times?: number; on: Unit }
  | { type: 'block'; amount: number; on: Unit }
  | { type: 'status'; status: StatusId; amount: number; on: Unit }
  | { type: 'draw'; amount: number }
  | { type: 'energy'; amount: number }
  | { type: 'cooldowns'; amount: number }
  | { type: 'delay'; amount: number; count?: number }
  | { type: 'heal'; amount: number; on: Unit };

export interface EventSpec {
  name: 'status_applied';
  status?: StatusId;
  on?: Unit;
  oncePerBeat?: boolean;
}

export interface Ability {
  trigger: 'activate' | 'event';
  event?: EventSpec;
  effects: Effect[];
}

/**
 * An aura is a static bonus.
 * - `aura` on an item is granted TO edge-adjacent items.
 * - `scaling` on an item is gained BY itself, once per adjacent item matching
 *   `requireTag` (omit the tag to count every neighbour).
 * `cooldown` auras are subtracted from the receiver's cooldown (min 1).
 */
export interface Aura {
  stat: 'damage' | 'block' | 'burning' | 'cooldown';
  amount: number;
  requireTag?: string;
}

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  rarity: Rarity;
  tags: string[];
  /** [width, height] in grid cells, unrotated. Rotation swaps the two. */
  size: [number, number];
  cooldown: number;
  text: string;
  abilities: Ability[];
  aura?: Aura[];
  scaling?: Aura[];
}

export type CardOp =
  | { op: 'damage'; amount: number; drawIfBurning?: number }
  | { op: 'block'; amount: number }
  | { op: 'status'; status: StatusId; amount: number }
  | { op: 'draw'; amount: number; extraIfItemActivated?: boolean }
  | { op: 'energy'; amount: number }
  | { op: 'cooldowns'; amount: number }
  | { op: 'trigger'; scope: 'chosen' | 'fire'; bypassLimit?: boolean }
  | { op: 'item_ready' }
  | { op: 'item_cooldown'; amount: number }
  | { op: 'enemy_item_delay'; amount: number }
  | { op: 'double_next' };

export interface CardDef {
  id: string;
  name: string;
  cost: number;
  rarity: Rarity;
  text: string;
  ops: CardOp[];
  /** The card asks the player to pick one of their own items on the board. */
  needsItem?: boolean;
  /** The card asks the player to pick one of the enemy's items. */
  needsEnemyItem?: boolean;
}

export interface EnemyItemPlacement {
  defId: string;
  pos: [number, number];
}

export interface EnemyDef {
  id: string;
  name: string;
  icon: string;
  /** Key into the UI's sprite art. Rules never read it. */
  sprite: string;
  hp: number;
  blurb: string;
  /** Enemy grid size, [columns, rows]. Items are placed once and never moved. */
  board: [number, number];
  items: EnemyItemPlacement[];
}

export interface RelicDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  combatStart?: Effect[];
  beatStart?: Effect[];
}

export type NodeType = 'combat' | 'elite' | 'merchant' | 'rest' | 'treasure' | 'boss';

export interface MapNode {
  id: string;
  row: number;
  col: number;
  type: NodeType;
  label: string;
  next: string[];
}
