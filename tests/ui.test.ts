import { describe, expect, test } from 'bun:test';
import { App } from '../src/ui/app';

/** The app only needs a root element to write HTML into. */
class FakeEl {
  innerHTML = '';
  addEventListener() {}
  querySelector() {
    return null;
  }
}

function setup() {
  const root = new FakeEl();
  (globalThis as any).document = {};
  (globalThis as any).window = { addEventListener() {} };
  const app: any = new App(root as any);
  return { app, root };
}

function click(app: any, act: string, data: Record<string, string> = {}) {
  const el = { dataset: { act, ...data } };
  app.onClick({ target: { closest: () => el } });
}

function freshCombat() {
  const { app, root } = setup();
  click(app, 'start-run');
  click(app, 'begin-combat');
  // Items fire automatically on beat 1, so step to beat 2 where items are
  // targetable again before placing a controlled hand.
  app.combat.endTurn();
  app.combat.player.energy = 3;
  return { app, root };
}

describe('combat targeting UI', () => {
  test('playing another card while a targeting card is pending does not crash', () => {
    const { app, root } = freshCombat();
    app.combat.hand = ['spark', 'spark', 'spark', 'spark', 'overcharge'];

    click(app, 'card', { index: '4' }); // Overcharge asks for an item
    expect(app.pendingCard).toBe(4);

    // Regression: this played Spark, shrank the hand to four cards, and the
    // render read hand[4] === undefined before throwing inside getCard().
    expect(() => click(app, 'card', { index: '0' })).not.toThrow();
    expect(app.pendingCard).toBe(null);
    expect(root.innerHTML).not.toContain('undefined');
    expect(root.innerHTML).toContain('End turn');
    // The arena renders both fighters even though the test DOM cannot display them.
    expect(root.innerHTML).toContain('data-sprite="player"');
    expect(root.innerHTML).toContain('data-sprite="enemy"');
  });

  test('the rotate control re-orients the selected item', () => {
    const { app } = setup();
    click(app, 'start-run'); // lands on the loadout screen
    const wand = app.run.inventory.placed().find((item: any) => item.defId === 'fire_wand');
    click(app, 'select-item', { id: wand.id });
    expect(app.run.inventory.sizeOf(wand)).toEqual([1, 2]);
    expect(() => click(app, 'rotate-item')).not.toThrow();
    expect(wand.rotated).toBe(true);
    expect(app.run.inventory.sizeOf(wand)).toEqual([2, 1]);
  });

  test('a card that targets an enemy item asks for an enemy target', () => {
    const { app } = freshCombat();
    app.combat.hand = ['sabotage', 'spark', 'spark', 'spark', 'spark'];
    const target = app.combat.enemyItems[0];

    // Regression: this used to fall through to playCard(index) with no target,
    // so clicking Sabotage did nothing at all.
    click(app, 'card', { index: '0' });
    expect(app.pendingCard).toBe(0);

    click(app, 'target-enemy-item', { id: target.id });
    expect(app.pendingCard).toBe(null);
    expect(app.combat.hand).not.toContain('sabotage');
    expect(app.combat.discardPile).toContain('sabotage');
  });

  test('clicking a second targeting card switches the pending target', () => {
    const { app } = freshCombat();
    app.combat.hand = ['overcharge', 'echo', 'spark', 'spark', 'spark'];

    click(app, 'card', { index: '0' });
    expect(app.pendingCard).toBe(0);
    click(app, 'card', { index: '1' });
    expect(app.pendingCard).toBe(1);
    click(app, 'cancel-target');
    expect(app.pendingCard).toBe(null);
  });
});
