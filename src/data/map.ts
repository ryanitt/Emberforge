import type { MapNode } from '../model/types';

// A short hand-authored act. Procedural generation comes after the core loop is
// proven (blueprint section 5).
//
//        start
//        /    \
//      a1      b1
//      / \    /  \
//   elite   c1    shop
//      \   /  \   /
//        rest  treasure
//           \   /
//           boss

export const MAP_NODES: MapNode[] = [
  { id: 'start', row: 0, col: 1, type: 'combat', label: 'Cinder Gate', next: ['a1', 'b1'] },
  { id: 'a1', row: 1, col: 0, type: 'combat', label: 'Ash Pit', next: ['elite1', 'c1'] },
  { id: 'b1', row: 1, col: 2, type: 'combat', label: 'Slag Row', next: ['c1', 'shop1'] },
  { id: 'elite1', row: 2, col: 0, type: 'elite', label: 'Golem Works', next: ['rest1'] },
  { id: 'c1', row: 2, col: 1, type: 'combat', label: 'Bellows Yard', next: ['rest1', 'treasure1'] },
  { id: 'shop1', row: 2, col: 2, type: 'merchant', label: 'Tinker’s Cart', next: ['treasure1'] },
  { id: 'rest1', row: 3, col: 0, type: 'rest', label: 'Cold Hearth', next: ['boss'] },
  { id: 'treasure1', row: 3, col: 2, type: 'treasure', label: 'Sealed Vault', next: ['boss'] },
  { id: 'boss', row: 4, col: 1, type: 'boss', label: 'The Bellows', next: [] },
];

export const NODE_BY_ID: Record<string, MapNode> = Object.fromEntries(
  MAP_NODES.map((node) => [node.id, node]),
);

/** Enemy chosen per node type, in act order. */
export const ENCOUNTER_TABLE: Record<string, string[]> = {
  combat: ['cinder_rat', 'ash_wisp'],
  elite: ['furnace_golem'],
  boss: ['the_bellows'],
};
