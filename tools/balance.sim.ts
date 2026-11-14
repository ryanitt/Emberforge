/**
 * Balance harness. Run with `bun run balance`.
 *
 * Plays every route through the act with a greedy policy over fixed seeds and
 * reports fight length, health, and spending. It mirrors how the app resolves a
 * node: enter the node, run the encounter (or the merchant / rest / treasure
 * screen), take the first reward option, then move on.
 *
 * Policy (deliberately simple, slightly optimistic):
 * - spend all energy on damage, trigger items with Overcharge, delay the enemy's
 *   biggest item with Sabotage, block when the incoming hit is dangerous;
 * - take reward option 0 after a win;
 * - at a merchant: heal first if below 55% health, then buy item stock it can
 *   actually place, then cards;
 * - at a rest: heal 30%.
 *
 * Fight length is the tuning signal: a normal fight under ~4 beats never shows a
 * second cooldown cycle on either board. Treat the completion rate as an upper
 * bound for a human player.
 */
import { getCard } from '../src/data/cards';
import { getEnemy } from '../src/data/enemies';
import { NODE_BY_ID } from '../src/data/map';
import { Combat } from '../src/model/combat';
import {
  addItemToRun,
  buildCombat,
  enemyForNode,
  enterNode,
  goldForNode,
  newRun,
  relicReward,
  rollRewards,
  rollShop,
  type RunState,
  type ShopStock,
} from '../src/model/run';
import type { MapNode, NodeType } from '../src/model/types';

const SEEDS = 40;

/** Damage the enemy engine has loaded for this beat (visible in the UI). */
function incomingDamage(combat: Combat): number {
  let total = 0;
  for (const item of combat.enemyPreview()) {
    for (const ability of item.def.abilities) {
      if (ability.trigger !== 'activate') continue;
      for (const effect of ability.effects) {
        if (effect.type === 'damage') total += effect.amount * (effect.times ?? 1);
      }
    }
  }
  return total;
}

interface Action {
  index: number;
  targetId?: string;
}

/** Greedy single action choice: defend when threatened, else push damage. */
function chooseAction(combat: Combat): Action | null {
  const incoming = incomingDamage(combat);
  const net = Math.max(0, incoming - combat.player.block);
  const scared = net >= combat.player.hp || (net > 9 && combat.player.hp < combat.player.maxHp * 0.6);

  if (scared) {
    const index = combat.hand.findIndex((id, i) => id === 'reinforce' && combat.canPlay(i));
    if (index >= 0) return { index };
  }

  const sabotage = combat.hand.findIndex((id, i) => id === 'sabotage' && combat.canPlay(i));
  if (sabotage >= 0) {
    const target = combat
      .targetableEnemyItems(getCard('sabotage'))
      .map((id) => combat.enemyItem(id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => a.cooldown - b.cooldown)[0];
    if (target) return { index: sabotage, targetId: target.id };
  }

  const overcharge = combat.hand.findIndex((id, i) => {
    if (id !== 'overcharge') return false;
    return combat.canPlay(i) && combat.targetableItems(getCard(id)).length > 0;
  });
  if (overcharge >= 0) {
    return { index: overcharge, targetId: combat.targetableItems(getCard('overcharge'))[0] };
  }

  for (const wanted of ['spark', 'stoke', 'interrupt', 'oil_the_target', 'scavenge', 'reinforce', 'accelerate']) {
    const index = combat.hand.findIndex((id, i) => id === wanted && combat.canPlay(i));
    if (index >= 0) return { index };
  }
  return null;
}

/** Plays one player phase, then ends the turn. */
function playTurn(combat: Combat): void {
  let actions = 0;
  while (actions++ < 12) {
    const action = chooseAction(combat);
    if (!action) break;
    if (!combat.playCard(action.index, action.targetId)) break;
  }
  combat.endTurn();
}

function runFight(run: RunState, node: MapNode): { won: boolean; beats: number; enemy: string } {
  const enemy = enemyForNode(run, node, run.floor + 1);
  const combat = buildCombat(run, enemy, run.floor + 1);
  let turns = 0;
  while (!combat.outcome && turns < 80) {
    turns += 1;
    playTurn(combat);
  }
  run.hp = combat.player.hp;
  return { won: combat.outcome === 'victory', beats: turns, enemy: enemy.id };
}

function visitShop(run: RunState, shop: ShopStock): { spent: number; benched: number } {
  let spent = 0;
  let benched = 0;
  if (run.hp < run.maxHp * 0.55 && run.gold >= shop.healPrice) {
    run.gold -= shop.healPrice;
    spent += shop.healPrice;
    run.hp = Math.min(run.maxHp, run.hp + shop.healAmount);
  }
  for (const entry of shop.items) {
    if (entry.sold || run.gold < entry.price) continue;
    if (!run.inventory.firstFit(entry.id)) continue; // will not buy what cannot be placed
    const where = addItemToRun(run, entry.id);
    run.gold -= entry.price;
    spent += entry.price;
    entry.sold = true;
    if (where === 'bench') benched += 1;
  }
  for (const entry of shop.cards) {
    if (entry.sold || run.gold < entry.price) continue;
    run.gold -= entry.price;
    spent += entry.price;
    entry.sold = true;
    run.deck.push(entry.id);
  }
  return { spent, benched };
}

interface FightRecord {
  node: string;
  type: NodeType;
  enemy: string;
  beats: number;
}

interface RouteResult {
  won: boolean;
  cleared: number;
  reachedBoss: boolean;
  hpAtBoss: number;
  goldAtBoss: number;
  fights: FightRecord[];
  spent: number;
  benched: number;
}

/** Walks one route exactly the way the app does. */
function playRoute(seed: number, route: string[]): RouteResult {
  const run = newRun(seed * 7919);
  const result: RouteResult = {
    won: false,
    cleared: 0,
    reachedBoss: false,
    hpAtBoss: 0,
    goldAtBoss: 0,
    fights: [],
    spent: 0,
    benched: 0,
  };

  for (const nodeId of route) {
    const node = enterNode(run, nodeId);

    if (node.type === 'rest') {
      run.hp = Math.min(run.maxHp, run.hp + Math.round(run.maxHp * 0.3));
      result.cleared += 1;
      continue;
    }

    if (node.type === 'merchant') {
      const shop = rollShop(run.seed + run.floor * 53 + 7);
      const shopResult = visitShop(run, shop);
      result.spent += shopResult.spent;
      result.benched += shopResult.benched;
      result.cleared += 1;
      continue;
    }

    if (node.type === 'treasure') {
      run.gold += goldForNode(run, node, run.seed);
      const options = rollRewards(run, run.seed + run.floor * 131, 2, 'items');
      const where = addItemToRun(run, options[0].id);
      if (where === 'bench') result.benched += 1;
      result.cleared += 1;
      continue;
    }

    if (node.type === 'boss') {
      result.reachedBoss = true;
      result.hpAtBoss = run.hp;
      result.goldAtBoss = run.gold;
    }

    const fight = runFight(run, node);
    result.fights.push({ node: nodeId, type: node.type, enemy: fight.enemy, beats: fight.beats });
    if (!fight.won) return result;

    result.cleared += 1;
    if (node.type === 'boss') {
      result.won = true;
      return result;
    }

    run.gold += goldForNode(run, node, run.seed);
    if (node.type === 'elite') {
      const relic = relicReward(run, run.seed + run.floor * 71);
      if (relic) run.relics.push(relic);
    }
    const options = rollRewards(run, run.seed + run.floor * 197 + run.gold, 3);
    const pick = options[0];
    const where = pick.kind === 'item' ? addItemToRun(run, pick.id) : (run.deck.push(pick.id), 'placed');
    if (where === 'bench') result.benched += 1;
  }

  return result;
}

/** Every path from the start node to the boss, as the map defines them. */
function allRoutes(): string[][] {
  const routes: string[][] = [];
  const walk = (id: string, path: string[]) => {
    const node = NODE_BY_ID[id];
    if (!node) return;
    const next = [...path, id];
    if (node.type === 'boss') {
      routes.push(next);
      return;
    }
    for (const child of node.next) walk(child, next);
  };
  walk('start', []);
  return routes;
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

// ---------------------------------------------------------------- baseline ---

console.log('Starter engine, single encounter (fight length is the signal):');
for (const enemyId of ['cinder_rat', 'ash_wisp']) {
  const beats: number[] = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const run = newRun(seed * 7919);
    const combat = buildCombat(run, getEnemy(enemyId), 1);
    let turns = 0;
    while (!combat.outcome && turns < 80) {
      turns += 1;
      playTurn(combat);
    }
    beats.push(turns);
  }
  console.log(
    `  ${pad(enemyId, 14)} ${average(beats).toFixed(1)} beats (${Math.min(...beats)}-${Math.max(...beats)})`,
  );
}

// ------------------------------------------------------------------ routes ---

const routes = allRoutes();
const allResults: RouteResult[] = [];
const beatsByType = new Map<NodeType, number[]>();

console.log(`\n${routes.length} routes through the act, ${SEEDS} runs each:`);
for (const route of routes) {
  const results = Array.from({ length: SEEDS }, (_, i) => playRoute(i + 1, route));
  allResults.push(...results);

  const wins = results.filter((r) => r.won);
  const fights = results.flatMap((r) => r.fights);
  for (const fight of fights) {
    const list = beatsByType.get(fight.type) ?? [];
    list.push(fight.beats);
    beatsByType.set(fight.type, list);
  }
  const bossBeats = wins.flatMap((r) => r.fights.filter((f) => f.type === 'boss').map((f) => f.beats));
  const hpAtBoss = results.filter((r) => r.reachedBoss).map((r) => r.hpAtBoss);
  console.log(
    `  ${pad(route.join(' → '), 44)} won ${String(wins.length).padStart(2)}/${SEEDS}` +
      `  boss ${average(bossBeats).toFixed(1)} beats` +
      `  hp@boss ${average(hpAtBoss).toFixed(0)}` +
      `  gold@boss ${average(results.filter((r) => r.reachedBoss).map((r) => r.goldAtBoss)).toFixed(0)}`,
  );
}

// --------------------------------------------------------------- aggregate ---

const wins = allResults.filter((r) => r.won).length;
const cleared = allResults.map((r) => r.cleared);
const hpAtBoss = allResults.filter((r) => r.reachedBoss).map((r) => r.hpAtBoss);
const benched = allResults.map((r) => r.benched);
const spent = allResults.map((r) => r.spent);

console.log('\nAggregate:');
console.log(`  runs won:        ${wins}/${allResults.length} (${((wins / allResults.length) * 100).toFixed(0)}%)`);
console.log(`  nodes cleared:   ${average(cleared).toFixed(1)} of ${routes[0].length}`);
console.log(`  hp at boss:      ${average(hpAtBoss).toFixed(0)}`);
console.log(`  gold spent:      ${average(spent).toFixed(0)} per run`);
console.log(`  items benched:   ${average(benched).toFixed(2)} per run`);
for (const type of ['combat', 'elite', 'boss'] as NodeType[]) {
  const beats = beatsByType.get(type) ?? [];
  if (beats.length === 0) continue;
  console.log(
    `  ${pad(type, 16)} ${average(beats).toFixed(1)} beats (${Math.min(...beats)}-${Math.max(...beats)}, n=${beats.length})`,
  );
}
