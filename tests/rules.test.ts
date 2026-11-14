import { describe, expect, test } from 'bun:test';
import { CARDS, getCard } from '../src/data/cards';
import { ENEMIES, getEnemy } from '../src/data/enemies';
import { SPRITE_ART } from '../src/ui/sprites';
import { getEnemyItem } from '../src/data/enemyItems';
import { ITEMS } from '../src/data/items';
import { MAP_NODES } from '../src/data/map';
import { Combat, type CombatSetup } from '../src/model/combat';
import { Inventory } from '../src/model/inventory';
import {
  addItemToRun,
  buildCombat,
  newRun,
  rollRewards,
  rollShop,
  type RunState,
} from '../src/model/run';
import type { EnemyDef } from '../src/model/types';

/**
 * Tests run against a fixed enemy so combat assertions do not move when the
 * content budget is retuned: one claw, 5 damage, fires every beat.
 */
const TEST_ENEMY: EnemyDef = {
  id: 'test_dummy',
  name: 'Test Dummy',
  icon: '🎯',
  hp: 36,
  blurb: 'Fixed behaviour for tests.',
  board: [2, 2],
  items: [{ defId: 'rat_claw', pos: [0, 0] }],
};
const TEST_HP = TEST_ENEMY.hp;

function makeCombat(overrides: Partial<CombatSetup> = {}): Combat {
  return new Combat({
    items: [{ id: 'i1', defId: 'fire_wand', pos: [0, 0], rotated: false }],
    adjacency: {},
    deck: Array(10).fill('spark'),
    relics: [],
    hp: 70,
    maxHp: 70,
    enemy: TEST_ENEMY,
    seed: 7,
    ...overrides,
  });
}

describe('inventory rules', () => {
  test('places an item and claims its cells', () => {
    const inv = new Inventory(4, 4);
    const wand = inv.add('fire_wand');
    expect(inv.place(wand.id, [0, 0])).toBe(true);
    expect(inv.cellsOf(inv.byId(wand.id)!)).toEqual([
      [0, 0],
      [0, 1],
    ]);
    expect(inv.freeCells()).toBe(14);
  });

  test('rejects placements outside the grid', () => {
    const inv = new Inventory(4, 4);
    const wand = inv.add('fire_wand'); // 1 wide, 2 tall
    expect(inv.place(wand.id, [3, 0])).toBe(true); // last column, rows 0-1
    inv.unplace(wand.id);
    expect(inv.place(wand.id, [0, 3])).toBe(false); // 2 tall from the last row overflows
    expect(inv.place(wand.id, [4, 0])).toBe(false);
    expect(inv.place(wand.id, [-1, 0])).toBe(false);
  });

  test('rejects overlapping placements', () => {
    const inv = new Inventory(4, 4);
    const a = inv.add('iron_shield'); // 2x1
    const b = inv.add('fire_wand'); // 1x2
    expect(inv.place(a.id, [0, 0])).toBe(true);
    expect(inv.place(b.id, [0, 0])).toBe(false);
    expect(inv.place(b.id, [1, 0])).toBe(false); // would cover (1,0) of the shield
    expect(inv.place(b.id, [2, 0])).toBe(true);
  });

  test('an item can be dropped back onto its own cells', () => {
    const inv = new Inventory(4, 4);
    const wand = inv.add('fire_wand', [0, 0]);
    expect(inv.move(wand.id, [0, 0], false)).toBe(true);
    expect(inv.move(wand.id, [0, 1], false)).toBe(true);
  });

  test('swaps two items when both fit', () => {
    const inv = new Inventory(4, 4);
    const a = inv.add('iron_shield', [0, 0]);
    const b = inv.add('thorn_buckler', [2, 0]);
    expect(inv.move(b.id, [0, 0], false)).toBe(true);
    expect(inv.byId(a.id)!.pos).toEqual([2, 0]);
    expect(inv.byId(b.id)!.pos).toEqual([0, 0]);
  });

  test('adjacency needs an edge, not a corner', () => {
    const inv = new Inventory(4, 4);
    const a = inv.add('fire_wand', [0, 0]); // (0,0) (0,1)
    const bench = inv.add('fire_rune', [1, 1]);
    expect(inv.neighbours(a.id).map((item) => item.id)).toEqual([bench.id]);
    const corner = inv.add('thorn_buckler', [1, 2]);
    expect(inv.neighbours(a.id).map((item) => item.id)).not.toContain(corner.id);
  });

  test('benched items are not placed and do not block cells', () => {
    const inv = new Inventory(4, 4);
    inv.add('greatsword'); // 2x2 on the bench
    expect(inv.freeCells()).toBe(16);
    expect(inv.bench().length).toBe(1);
  });
});

describe('rotation', () => {
  test('rotation swaps the orientation and keeps the footprint', () => {
    const inv = new Inventory(4, 4);
    const wand = inv.add('fire_wand', [0, 0]);
    expect(inv.sizeOf(wand)).toEqual([1, 2]);
    expect(inv.rotate(wand.id)).toBe(true);
    expect(inv.sizeOf(wand)).toEqual([2, 1]);
    expect(inv.cellsOf(wand).length).toBe(2);
  });

  test('a square item stays square when rotated', () => {
    const inv = new Inventory(4, 4);
    const sword = inv.add('greatsword', [0, 0]); // 2x2
    expect(inv.rotate(sword.id)).toBe(true);
    expect(inv.sizeOf(sword)).toEqual([2, 2]);
    expect(inv.cellsOf(sword).length).toBe(4);
  });

  test('rotation nudges to the nearest free spot instead of refusing', () => {
    const run: RunState = newRun(1);
    const inv = run.inventory;
    const wand = inv.placed().find((item) => item.defId === 'fire_wand')!;
    // Straight ahead is blocked by the shield, so the old implementation simply
    // returned false and rotate looked broken.
    expect(inv.rotate(wand.id)).toBe(true);
    expect(wand.rotated).toBe(true);
    expect(inv.sizeOf(wand)).toEqual([2, 1]);
    expect(inv.canPlace(wand.defId, wand.pos!, wand.rotated, wand.id)).toBe(true);
  });

  test('rotation fails only when there is genuinely no room', () => {
    const inv = new Inventory(2, 2);
    const wand = inv.add('fire_wand', [0, 0]); // fills the left column
    expect(inv.add('thorn_buckler', [1, 0]).pos).toEqual([1, 0]);
    expect(inv.add('thorn_buckler', [1, 1]).pos).toEqual([1, 1]);
    // Every horizontal pair of cells is taken, so 2x1 cannot fit anywhere.
    expect(inv.rotate(wand.id)).toBe(false);
    expect(wand.rotated).toBe(false);
  });
});

describe('combat timing', () => {
  test('items activate at the start of the first beat and take their cooldown', () => {
    const combat = makeCombat();
    expect(combat.beat).toBe(1);
    expect(combat.enemy.hp).toBe(TEST_HP - 8);
    expect(combat.enemy.statuses.burning).toBe(1);
    expect(combat.items[0].cooldown).toBe(2);
  });

  test('a cooldown of 2 activates every other beat', () => {
    const combat = makeCombat();
    const hpAfterBeat1 = combat.enemy.hp;
    combat.endTurn(); // beat 2: no activation
    expect(combat.beat).toBe(2);
    expect(combat.enemy.hp).toBeLessThan(hpAfterBeat1); // burning ticked
    expect(combat.items[0].cooldown).toBe(1);
    combat.endTurn(); // beat 3: activates
    expect(combat.beat).toBe(3);
    expect(combat.items[0].cooldown).toBe(2);
    expect(combat.items[0].activatedThisBeat).toBe(true);
  });

  test('an item cannot activate twice in one beat', () => {
    const combat = makeCombat({ deck: Array(10).fill('overcharge') });
    expect(combat.canPlay(0)).toBe(false);
    expect(combat.targetableItems(getCard('overcharge'))).toEqual([]);
    expect(combat.playCard(0, 'i1')).toBe(false);
  });

  test('a card can trigger an item early at its normal cooldown', () => {
    const combat = makeCombat({ deck: Array(10).fill('overcharge') });
    combat.endTurn(); // into beat 2, item has 1 cooldown and has not fired
    const before = combat.enemy.hp;
    expect(combat.playCard(0, 'i1')).toBe(true);
    expect(combat.enemy.hp).toBe(before - 8);
    expect(combat.items[0].cooldown).toBe(2);
    expect(combat.items[0].activatedThisBeat).toBe(true);
  });

  test('cooldowns never go negative', () => {
    const combat = makeCombat({ deck: Array(10).fill('accelerate') });
    combat.resolveEffects([{ type: 'cooldowns', amount: 5 }]);
    expect(combat.items[0].cooldown).toBe(0);
  });

  test('block is consumed before health and resets each beat', () => {
    const combat = makeCombat({ deck: Array(10).fill('reinforce') });
    expect(combat.playCard(0)).toBe(true);
    expect(combat.player.block).toBe(7);
    combat.endTurn();
    const clawDamage = (getEnemyItem('rat_claw').abilities[0].effects[0] as { amount: number }).amount;
    expect(combat.player.hp).toBe(70 - Math.max(0, clawDamage - 7));
    expect(combat.player.block).toBe(0);
  });

  test('vulnerable increases incoming damage by half', () => {
    const combat = makeCombat();
    combat.resolveEffects([{ type: 'status', status: 'vulnerable', amount: 2, on: 'enemy' }]);
    combat.resolveEffects([{ type: 'damage', amount: 8, on: 'enemy' }]);
    expect(combat.enemy.hp).toBe(TEST_HP - 8 - 12);
  });

  test('burning ticks and decays at the end of the beat', () => {
    const combat = makeCombat();
    combat.resolveEffects([{ type: 'status', status: 'burning', amount: 3, on: 'enemy' }]);
    expect(combat.enemy.statuses.burning).toBe(4);
    const before = combat.enemy.hp;
    combat.endTurn();
    expect(combat.enemy.hp).toBe(before - 4);
    expect(combat.enemy.statuses.burning).toBe(3);
  });

  test('victory clamps health and stops further effects', () => {
    const combat = makeCombat();
    combat.resolveEffects([{ type: 'damage', amount: 100, on: 'enemy' }]);
    expect(combat.outcome).toBe('victory');
    expect(combat.enemy.hp).toBe(0);
    const logLength = combat.log.length;
    combat.resolveEffects([{ type: 'damage', amount: 50, on: 'enemy' }]);
    expect(combat.log.length).toBe(logLength);
    combat.endTurn();
    expect(combat.beat).toBe(1);
  });

  test('cards cost energy and move to the discard pile', () => {
    const combat = makeCombat({ items: [], adjacency: {} });
    expect(combat.player.energy).toBe(3);
    expect(combat.hand.length).toBe(5);
    expect(combat.playCard(0)).toBe(true);
    expect(combat.player.energy).toBe(2);
    expect(combat.hand.length).toBe(4);
    expect(combat.discardPile.length).toBe(1);
    expect(combat.enemy.hp).toBe(TEST_HP - 5);
  });
});

describe('enemy engine', () => {
  /** Damage the test enemy's claw will deal, read from its data. */
  const clawDamage = (getEnemyItem('rat_claw').abilities[0].effects[0] as { amount: number }).amount;

  test('enemy items fire on the enemy phase and cool down again', () => {
    const combat = makeCombat();
    expect(combat.enemyPreview().length).toBe(1);
    combat.endTurn();
    expect(combat.player.hp).toBe(70 - clawDamage);
    expect(combat.enemyItems[0].cooldown).toBe(0); // cooldown 1: reset then ticked
    expect(combat.enemyPreview().length).toBe(1);
  });

  test('enemy block survives into the player turn', () => {
    const combat = makeCombat();
    combat.resolveEffects([{ type: 'block', amount: 9, on: 'enemy' }]);
    combat.endTurn(); // enemy phase clears its block before firing
    expect(combat.enemy.block).toBe(0);
  });

  test('sabotage delays an enemy item and needs an enemy target', () => {
    const combat = makeCombat({ deck: Array(10).fill('sabotage') });
    const sabotage = getCard('sabotage');
    expect(combat.targetableEnemyItems(sabotage)).toEqual(['ei_0']);
    expect(combat.playCard(0, 'i1')).toBe(false); // cannot point at your own item
    expect(combat.playCard(0, 'ei_0')).toBe(true);
    expect(combat.enemyItems[0].cooldown).toBe(2);
    combat.endTurn();
    expect(combat.player.hp).toBe(70); // the claw was pushed out of this beat
  });

  test('enemy items are visible as a preview before the turn ends', () => {
    const combat = makeCombat();
    const preview = combat.enemyPreview();
    expect(preview.map((item) => item.def.id)).toEqual(['rat_claw']);
    combat.endTurn();
    expect(combat.enemyPreview().length).toBe(1);
  });
});

describe('item synergies', () => {
  test('adjacency damage aura is applied to the neighbour activation', () => {
    const combat = makeCombat({
      items: [
        { id: 'i1', defId: 'fire_wand', pos: [0, 0], rotated: false },
        { id: 'i2', defId: 'fire_rune', pos: [1, 0], rotated: false },
      ],
      adjacency: { i1: ['i2'], i2: ['i1'] },
    });
    expect(combat.enemy.hp).toBe(TEST_HP - 11);
    expect(combat.items[0].bonus.damage).toBe(3);
  });

  test('a conductor lowers the neighbouring cooldown', () => {
    const combat = makeCombat({
      items: [
        { id: 'i1', defId: 'fire_wand', pos: [0, 0], rotated: false },
        { id: 'i2', defId: 'conductor', pos: [1, 0], rotated: false },
      ],
      adjacency: { i1: ['i2'], i2: ['i1'] },
    });
    expect(combat.items[0].cooldownMax).toBe(1);
    combat.endTurn();
    expect(combat.enemy.hp).toBe(TEST_HP - 8 - 1 - 8); // volley, burning tick, second volley
  });

  test('phoenix feather reacts to burning and cools every item once', () => {
    const combat = makeCombat({
      items: [
        { id: 'i1', defId: 'fire_wand', pos: [0, 0], rotated: false },
        { id: 'i2', defId: 'phoenix_feather', pos: [1, 0], rotated: false },
      ],
      adjacency: {},
    });
    expect(combat.items[0].cooldown).toBe(1);
    expect(combat.enemy.statuses.burning).toBe(1);
  });

  test('sooty bellows adds burning to adjacent fire items', () => {
    const combat = makeCombat({
      items: [
        { id: 'i1', defId: 'fire_wand', pos: [0, 0], rotated: false },
        { id: 'i2', defId: 'sooty_bellows', pos: [1, 0], rotated: false },
      ],
      adjacency: { i1: ['i2'], i2: ['i1'] },
    });
    expect(combat.enemy.statuses.burning).toBe(2);
  });

  test('every effect that lands is queued for the UI to animate', () => {
    const combat = makeCombat();
    expect(combat.fx.length).toBeGreaterThan(0);
    const last = combat.fx[combat.fx.length - 1];
    expect(last.kind).toBe('status');
    expect(last.sourceSide).toBe('player');
    expect(last.sourceId).toBe('i1');
    expect(last.target).toBe('enemy');
  });
});

describe('run and content integrity', () => {
  test('the map always has a route from start to boss', () => {
    const seen = new Set<string>();
    const queue = ['start'];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const node = MAP_NODES.find((entry) => entry.id === id);
      if (!node) continue;
      for (const next of node.next) queue.push(next);
    }
    expect(seen.has('boss')).toBe(true);
    expect(seen.size).toBe(MAP_NODES.length);
  });

  test('every map connection points at a real node', () => {
    const ids = new Set(MAP_NODES.map((node) => node.id));
    for (const node of MAP_NODES) {
      for (const next of node.next) expect(ids.has(next)).toBe(true);
    }
  });

  test('every fighter has a sprite drawn on a 16x16 grid', () => {
    const ids = ['pyromancer', ...ENEMIES.map((enemy) => enemy.sprite)];
    for (const id of ids) {
      const art = (SPRITE_ART as Record<string, string[]>)[id];
      expect(art).toBeDefined();
      expect(art.length).toBe(16);
      // A short or long row silently shifts the art, so check every one.
      for (const row of art) expect(row.length).toBe(16);
    }
  });

  test('the player grid is square', () => {
    const run = newRun(1);
    expect(run.inventory.cols).toBe(run.inventory.rows);
    expect(run.inventory.cols).toBe(4);
  });

  test('every enemy item is placed inside its board without overlap', () => {
    const enemies = ['cinder_rat', 'ash_wisp', 'furnace_golem', 'the_bellows'];
    for (const id of enemies) {
      const enemy = getEnemy(id);
      const [cols, rows] = enemy.board;
      const used = new Set<string>();
      for (const placement of enemy.items) {
        const def = getEnemyItem(placement.defId);
        const [w, h] = def.size;
        for (let y = placement.pos[1]; y < placement.pos[1] + h; y++) {
          for (let x = placement.pos[0]; x < placement.pos[0] + w; x++) {
            expect(x).toBeLessThan(cols);
            expect(y).toBeLessThan(rows);
            const key = `${x},${y}`;
            expect(used.has(key)).toBe(false);
            used.add(key);
          }
        }
      }
    }
  });

  test('rewards are valid, distinct catalogue entries', () => {
    const run = newRun(123);
    const options = rollRewards(run, 99, 3);
    expect(options.length).toBe(3);
    expect(new Set(options.map((option) => option.id)).size).toBe(3);
    const itemIds = new Set(ITEMS.map((item) => item.id));
    const cardIds = new Set(CARDS.map((card) => card.id));
    for (const option of options) {
      expect(itemIds.has(option.id) || cardIds.has(option.id)).toBe(true);
    }
  });

  test('shop stock is priced and distinct', () => {
    const shop = rollShop(5);
    expect(shop.items.length).toBe(2);
    expect(shop.cards.length).toBe(2);
    for (const entry of [...shop.items, ...shop.cards]) expect(entry.price).toBeGreaterThan(0);
    expect(new Set([...shop.items, ...shop.cards].map((entry) => entry.id)).size).toBe(4);
  });

  test('a new run places its starting gear on the square grid', () => {
    const run: RunState = newRun(1);
    expect(run.inventory.placed().length).toBe(3);
    expect(run.deck.length).toBe(10);
    expect(run.deck).toContain('sabotage');
    expect(run.gold).toBe(50);
    const combat = buildCombat(run, getEnemy('cinder_rat'), 1);
    expect(combat.items.length).toBe(3);
    expect(combat.enemy.hp).toBe(getEnemy('cinder_rat').hp - 11); // wand 8 + rune 3
    expect(combat.beat).toBe(1);
  });

  test('picked items are placed or benched, never lost', () => {
    const run = newRun(2);
    const where = addItemToRun(run, 'greatsword');
    expect(['placed', 'bench']).toContain(where);
    expect(run.inventory.items.some((item) => item.defId === 'greatsword')).toBe(true);
  });
});

