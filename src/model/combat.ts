import { getCard } from '../data/cards';
import { getEnemyItem } from '../data/enemyItems';
import { getItem } from '../data/items';
import { getRelic } from '../data/relics';
import type {
  Ability,
  CardDef,
  Effect,
  EnemyDef,
  ItemDef,
  StatusId,
  Statuses,
  Unit,
} from './types';

export type LogKind =
  | 'beat'
  | 'item'
  | 'react'
  | 'card'
  | 'enemy'
  | 'status'
  | 'damage'
  | 'info'
  | 'warn';

export interface LogEntry {
  kind: LogKind;
  text: string;
}

export interface ItemRuntime {
  id: string;
  def: ItemDef;
  pos: [number, number];
  rotated: boolean;
  cooldownMax: number;
  cooldown: number;
  activatedThisBeat: boolean;
  bonus: { damage: number; block: number; burning: number };
  sources: string[];
  usedAbilities: Set<number>;
}

export interface Fighter {
  name: string;
  hp: number;
  maxHp: number;
  block: number;
  energy: number;
  statuses: Statuses;
}

export type Outcome = null | 'victory' | 'defeat';

export interface CombatSetup {
  items: { id: string; defId: string; pos: [number, number]; rotated: boolean }[];
  /** Map of item id -> ids of edge-adjacent items. */
  adjacency: Record<string, string[]>;
  deck: string[];
  relics: string[];
  hp: number;
  maxHp: number;
  enemy: EnemyDef;
  seed: number;
}

/** One visible consequence of resolving an effect, for the UI to animate. */
export interface FxEvent {
  kind: 'attack' | 'block' | 'status' | 'heal';
  sourceSide: Unit;
  /** Item instance id that caused it, or null for cards, relics and ticks. */
  sourceId: string | null;
  target: Unit;
  amount: number;
  text: string;
}

interface Source {
  side: Unit;
  itemId: string | null;
  label: string;
  /** Present when an item caused the effect, so adjacency bonuses can apply. */
  runtime?: ItemRuntime;
}

const HAND_SIZE = 5;
const HAND_LIMIT = 10;
const ENERGY_PER_TURN = 3;
const MAX_CHAIN_EVENTS = 40;

function emptyStatuses(): Statuses {
  return { burning: 0, vulnerable: 0 };
}

function mixSeed(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function readingOrder(a: ItemRuntime, b: ItemRuntime): number {
  return a.pos[1] * 100 + a.pos[0] - (b.pos[1] * 100 + b.pos[0]);
}

/**
 * Beat-based combat between two engines. Player items and enemy items both have
 * cooldowns and fire automatically: the player's at the start of a beat, the
 * enemy's when the player ends their turn. Cards bend the player's engine and
 * can reach across to slow the enemy's.
 *
 * Timing convention (COMBAT_RULES.md): an item that activates sets its cooldown
 * back to its maximum, and every cooldown ticks down by one at the end of the
 * beat. Cooldown 2 therefore means "activates every second beat".
 */
export class Combat {
  player: Fighter;
  enemy: Fighter & { def: EnemyDef };
  items: ItemRuntime[] = [];
  enemyItems: ItemRuntime[] = [];
  enemyBoard: [number, number];
  hand: string[] = [];
  drawPile: string[] = [];
  discardPile: string[] = [];
  exhaustPile: string[] = [];
  relics: string[] = [];
  log: LogEntry[] = [];
  /** Append-only stream of resolved effects; the UI animates what is new. */
  fx: FxEvent[] = [];

  beat = 0;
  phase: 'player' | 'enemy' = 'player';
  outcome: Outcome = null;
  pendingDouble = false;

  private rand: () => number;
  private eventQueue: { item: ItemRuntime; ability: Ability; index: number }[] = [];
  private draining = false;
  private eventCount = 0;
  /** Set when one of the player's items activated during the current beat. */
  anyItemActivatedThisBeat = false;

  constructor(setup: CombatSetup) {
    this.rand = mixSeed(setup.seed);
    this.relics = [...setup.relics];
    this.player = {
      name: 'Pyromancer',
      hp: setup.hp,
      maxHp: setup.maxHp,
      block: 0,
      energy: ENERGY_PER_TURN,
      statuses: emptyStatuses(),
    };
    this.enemy = {
      name: setup.enemy.name,
      hp: setup.enemy.hp,
      maxHp: setup.enemy.hp,
      block: 0,
      energy: 0,
      statuses: emptyStatuses(),
      def: setup.enemy,
    };
    this.enemyBoard = setup.enemy.board;
    this.items = this.buildPlayerRuntimes(setup);
    this.enemyItems = setup.enemy.items.map((placement, index) => {
      const def = getEnemyItem(placement.defId);
      return {
        id: `ei_${index}`,
        def,
        pos: placement.pos,
        rotated: false,
        cooldownMax: def.cooldown,
        cooldown: 0,
        activatedThisBeat: false,
        bonus: { damage: 0, block: 0, burning: 0 },
        sources: [],
        usedAbilities: new Set<number>(),
      };
    });
    this.drawPile = shuffleWith(setup.deck.map((id) => getCard(id).id), this.rand);
    this.discardPile = [];

    for (const relicId of this.relics) {
      const relic = getRelic(relicId);
      if (relic.combatStart) {
        this.addLog('info', `${relic.icon} ${relic.name} stirs.`);
        this.resolveEffects(relic.combatStart, {
          side: 'player',
          itemId: null,
          label: relic.name,
        });
      }
    }
    this.beginBeat();
  }

  // ---------------------------------------------------------------- setup ----

  private buildPlayerRuntimes(setup: CombatSetup): ItemRuntime[] {
    const runtimes: ItemRuntime[] = setup.items.map((placed) => {
      const def = getItem(placed.defId);
      return {
        id: placed.id,
        def,
        pos: placed.pos,
        rotated: placed.rotated,
        cooldownMax: def.cooldown,
        cooldown: 0,
        activatedThisBeat: false,
        bonus: { damage: 0, block: 0, burning: 0 },
        sources: [],
        usedAbilities: new Set<number>(),
      };
    });
    const byId = new Map(runtimes.map((rt) => [rt.id, rt]));

    for (const rt of runtimes) {
      let cooldownCut = 0;
      for (const neighbourId of setup.adjacency[rt.id] ?? []) {
        const neighbour = byId.get(neighbourId);
        if (!neighbour) continue;
        for (const aura of neighbour.def.aura ?? []) {
          if (aura.requireTag && !rt.def.tags.includes(aura.requireTag)) continue;
          this.applyAura(rt, aura.stat, aura.amount, neighbour.def.name);
          if (aura.stat === 'cooldown') cooldownCut += aura.amount;
        }
      }
      for (const scaling of rt.def.scaling ?? []) {
        const neighbours = (setup.adjacency[rt.id] ?? [])
          .map((id) => byId.get(id))
          .filter((n): n is ItemRuntime => Boolean(n));
        const matching = scaling.requireTag
          ? neighbours.filter((n) => n.def.tags.includes(scaling.requireTag!))
          : neighbours;
        if (matching.length === 0) continue;
        this.applyAura(
          rt,
          scaling.stat,
          scaling.amount * matching.length,
          `${scaling.requireTag ?? 'nearby'} neighbours`,
        );
        if (scaling.stat === 'cooldown') cooldownCut += scaling.amount * matching.length;
      }
      rt.cooldownMax = rt.def.cooldown > 0 ? Math.max(1, rt.def.cooldown - cooldownCut) : 0;
      rt.cooldown = 0;
    }
    return runtimes;
  }

  private applyAura(rt: ItemRuntime, stat: string, amount: number, sourceName: string): void {
    if (stat === 'damage') {
      rt.bonus.damage += amount;
      rt.sources.push(`${sourceName} +${amount} damage`);
    } else if (stat === 'block') {
      rt.bonus.block += amount;
      rt.sources.push(`${sourceName} +${amount} block`);
    } else if (stat === 'burning') {
      rt.bonus.burning += amount;
      rt.sources.push(`${sourceName} +${amount} burning`);
    } else if (stat === 'cooldown') {
      rt.sources.push(`${sourceName} −${amount} cooldown`);
    }
  }

  // ------------------------------------------------------------- beat loop ---

  private beginBeat(): void {
    if (this.outcome) return;
    this.beat += 1;
    this.player.block = 0;
    this.player.energy = ENERGY_PER_TURN;
    this.pendingDouble = false;
    this.eventCount = 0;
    this.anyItemActivatedThisBeat = false;
    for (const item of [...this.items, ...this.enemyItems]) {
      item.activatedThisBeat = false;
      item.usedAbilities.clear();
    }
    this.addLog('beat', `— Beat ${this.beat} —`);

    for (const relicId of this.relics) {
      const relic = getRelic(relicId);
      if (relic.beatStart) {
        this.resolveEffects(relic.beatStart, { side: 'player', itemId: null, label: relic.name });
      }
    }

    this.activateReadyPlayerItems();
    if (this.outcome) return;

    this.drawTo(HAND_SIZE);
    this.phase = 'player';
  }

  private activateReadyPlayerItems(): void {
    const ready = this.items
      .filter((item) => this.canActivate(item) && item.cooldown <= 0)
      .sort(readingOrder);
    for (const item of ready) {
      if (this.outcome) return;
      this.activate(item, 'player');
    }
  }

  private advanceCooldowns(): void {
    let ticked = false;
    for (const item of [...this.items, ...this.enemyItems]) {
      if (item.cooldown > 0) {
        item.cooldown -= 1;
        ticked = true;
      }
    }
    if (ticked) this.addLog('info', 'Cooldowns tick down.');
  }

  /** End of the player's turn: enemy engine fires, statuses tick, cooldowns advance. */
  endTurn(): void {
    if (this.outcome || this.phase !== 'player') return;
    this.phase = 'enemy';
    this.pendingDouble = false;
    if (this.hand.length > 0) {
      this.discardPile.push(...this.hand);
      this.hand = [];
    }
    // Enemy Block only has to survive the player's turn, so it is cleared right
    // before the enemy engine fires again.
    this.enemy.block = 0;
    this.resolveEnemyItems();
    if (!this.outcome) this.tickStatuses();
    if (!this.outcome) this.advanceCooldowns();
    if (!this.outcome) this.beginBeat();
    if (this.outcome) this.phase = 'player';
  }

  private resolveEnemyItems(): void {
    const ready = this.enemyItems
      .filter((item) => this.canActivate(item) && item.cooldown <= 0)
      .sort(readingOrder);
    for (const item of ready) {
      if (this.outcome) return;
      this.activate(item, 'enemy');
    }
  }

  private tickStatuses(): void {
    for (const unit of [this.player, this.enemy]) {
      if (unit.hp <= 0) continue;
      if (unit.statuses.burning > 0) {
        const dmg = unit.statuses.burning;
        unit.hp -= dmg;
        this.addLog('status', `${unit.name} burns for ${dmg}.`);
        this.fx.push({
          kind: 'status',
          sourceSide: unit === this.player ? 'enemy' : 'player',
          sourceId: null,
          target: unit === this.player ? 'player' : 'enemy',
          amount: dmg,
          text: `🔥 ${dmg}`,
        });
        unit.statuses.burning -= 1;
        this.checkDeaths();
        if (this.outcome) return;
      }
      if (unit.statuses.vulnerable > 0) unit.statuses.vulnerable -= 1;
    }
  }

  // ----------------------------------------------------------------- cards ---

  get energy(): number {
    return this.player.energy;
  }

  cardCost(handIndex: number): number {
    return getCard(this.hand[handIndex]).cost;
  }

  canPlay(handIndex: number): boolean {
    if (this.outcome || this.phase !== 'player') return false;
    const id = this.hand[handIndex];
    if (!id) return false;
    const card = getCard(id);
    if (card.cost > this.player.energy) return false;
    if (card.needsEnemyItem) return this.targetableEnemyItems(card).length > 0;
    if (card.needsItem) return this.targetableItems(card).length > 0;
    return true;
  }

  needsEnemyTarget(handIndex: number): boolean {
    const id = this.hand[handIndex];
    return id ? Boolean(getCard(id).needsEnemyItem) : false;
  }

  /** The player's own items a card may be pointed at. */
  targetableItems(card: CardDef): string[] {
    const wantsTrigger = card.ops.some((op) => op.op === 'trigger' && op.scope === 'chosen');
    const bypass = card.ops.some(
      (op) => op.op === 'trigger' && op.scope === 'chosen' && op.bypassLimit,
    );
    return this.items
      .filter((item) => {
        if (!this.canActivate(item)) return false;
        if (wantsTrigger && !bypass && item.activatedThisBeat) return false;
        return true;
      })
      .map((item) => item.id);
  }

  /** The enemy's items a card may be pointed at. */
  targetableEnemyItems(_card: CardDef): string[] {
    return this.enemyItems.filter((item) => this.canActivate(item)).map((item) => item.id);
  }

  playCard(handIndex: number, targetId?: string): boolean {
    if (!this.canPlay(handIndex)) return false;
    const cardId = this.hand[handIndex];
    const card = getCard(cardId);
    if (card.needsItem && (!targetId || !this.targetableItems(card).includes(targetId))) {
      return false;
    }
    if (card.needsEnemyItem && (!targetId || !this.targetableEnemyItems(card).includes(targetId))) {
      return false;
    }
    this.player.energy -= card.cost;
    this.hand.splice(handIndex, 1);
    this.discardPile.push(cardId);
    this.addLog('card', `You play ${card.name}.`);
    const source: Source = { side: 'player', itemId: null, label: card.name };
    for (const op of card.ops) {
      if (this.outcome) break;
      this.resolveCardOp(card, op, source, targetId);
    }
    return true;
  }

  private resolveCardOp(
    card: CardDef,
    op: CardDef['ops'][number],
    source: Source,
    targetId?: string,
  ): void {
    switch (op.op) {
      case 'damage': {
        this.damage('enemy', op.amount, source);
        if (op.drawIfBurning && this.enemy.statuses.burning > 0) this.drawCards(op.drawIfBurning);
        break;
      }
      case 'block':
        this.gainBlock('player', op.amount, source);
        break;
      case 'status':
        this.applyStatus('enemy', op.status, op.amount, source);
        break;
      case 'draw':
        this.drawCards(op.amount + (op.extraIfItemActivated && this.anyItemActivatedThisBeat ? 1 : 0));
        break;
      case 'energy':
        this.player.energy += op.amount;
        break;
      case 'cooldowns':
        this.reduceAllCooldowns(op.amount);
        break;
      case 'double_next':
        this.pendingDouble = true;
        this.addLog('info', 'The next item activation this beat deals double damage.');
        break;
      case 'item_ready': {
        const item = this.items.find((rt) => rt.id === targetId);
        if (item) {
          item.cooldown = 0;
          this.addLog('info', `${item.def.name} is ready.`);
        }
        break;
      }
      case 'item_cooldown': {
        const item = this.items.find((rt) => rt.id === targetId);
        if (item) {
          item.cooldown = Math.max(0, item.cooldown - op.amount);
          this.addLog('info', `${item.def.name} cools by ${op.amount}.`);
        }
        break;
      }
      case 'enemy_item_delay': {
        const item = this.enemyItems.find((rt) => rt.id === targetId);
        if (item) {
          item.cooldown += op.amount;
          this.addLog('warn', `${item.def.icon} ${item.def.name} is sabotaged (+${op.amount} cooldown).`);
        }
        break;
      }
      case 'trigger': {
        if (op.scope === 'chosen') {
          const item = this.items.find((rt) => rt.id === targetId);
          if (item) this.activate(item, 'player', { bypassLimit: op.bypassLimit });
        } else {
          const fireItems = this.items.filter(
            (rt) => rt.def.tags.includes('fire') && this.canActivate(rt) && !rt.activatedThisBeat,
          );
          for (const item of fireItems) {
            if (this.outcome) break;
            this.activate(item, 'player');
          }
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------ activation ---

  canActivate(item: ItemRuntime): boolean {
    return item.def.abilities.some((ability) => ability.trigger === 'activate');
  }

  activate(item: ItemRuntime, side: Unit, opts: { bypassLimit?: boolean } = {}): boolean {
    if (this.outcome) return false;
    if (!this.canActivate(item)) return false;
    if (!opts.bypassLimit && item.activatedThisBeat) {
      this.addLog('warn', `${item.def.name} has already activated this beat.`);
      return false;
    }
    item.activatedThisBeat = true;
    item.cooldown = item.cooldownMax;
    const doubled = side === 'player' && this.pendingDouble;
    if (doubled) this.pendingDouble = false;
    if (side === 'player') this.anyItemActivatedThisBeat = true;
    this.addLog(
      side === 'player' ? 'item' : 'enemy',
      `${item.def.icon} ${item.def.name} activates${doubled ? ' — empowered!' : ''}.`,
    );
    const source: Source = { side, itemId: item.id, label: item.def.name, runtime: item };
    for (const ability of item.def.abilities) {
      if (ability.trigger !== 'activate') continue;
      this.resolveEffects(ability.effects, source, doubled);
      if (this.outcome) break;
    }
    return true;
  }

  // --------------------------------------------------------------- effects ---

  resolveEffects(
    effects: Effect[],
    source: Source = { side: 'player', itemId: null, label: 'Effect' },
    doubled = false,
  ): void {
    for (const effect of effects) {
      if (this.outcome) return;
      this.resolveEffect(effect, source, doubled);
    }
  }

  private resolveEffect(effect: Effect, source: Source, doubled = false): void {
    switch (effect.type) {
      case 'damage': {
        const times = effect.times ?? 1;
        for (let i = 0; i < times; i++) {
          if (this.outcome) return;
          let amount = effect.amount;
          if (source.runtime && source.side === 'player' && effect.on === 'enemy') {
            amount += source.runtime.bonus.damage;
          }
          if (doubled) amount *= 2;
          this.damage(effect.on, amount, source);
        }
        break;
      }
      case 'block': {
        let amount = effect.amount;
        if (source.runtime && source.side === 'player' && effect.on === 'player') {
          amount += source.runtime.bonus.block;
        }
        this.gainBlock(effect.on, amount, source);
        break;
      }
      case 'status': {
        let amount = effect.amount;
        if (source.runtime && source.side === 'player' && effect.status === 'burning') {
          amount += source.runtime.bonus.burning;
        }
        if (amount === 0) break;
        this.applyStatus(effect.on, effect.status, amount, source);
        break;
      }
      case 'draw':
        this.drawCards(effect.amount);
        break;
      case 'energy':
        this.player.energy += effect.amount;
        break;
      case 'cooldowns':
        this.reduceAllCooldowns(effect.amount);
        break;
      case 'delay':
        this.delayPlayerItems(effect.amount, effect.count ?? 1);
        break;
      case 'heal': {
        const unit = effect.on === 'player' ? this.player : this.enemy;
        unit.hp = Math.min(unit.maxHp, unit.hp + effect.amount);
        this.addLog('info', `${unit.name} recovers ${effect.amount} health.`);
        this.fx.push({
          kind: 'heal',
          sourceSide: source.side,
          sourceId: source.itemId,
          target: effect.on,
          amount: effect.amount,
          text: `+${effect.amount}`,
        });
        break;
      }
    }
  }

  private damage(target: Unit, amount: number, source: Source): void {
    const unit = target === 'player' ? this.player : this.enemy;
    if (unit.hp <= 0) return;
    let dmg = amount;
    if (unit.statuses.vulnerable > 0) dmg = Math.floor(dmg * 1.5);
    const absorbed = Math.min(unit.block, dmg);
    unit.block -= absorbed;
    const dealt = dmg - absorbed;
    unit.hp -= dealt;
    const parts = [`${source.label} hits ${unit.name} for ${dealt}`];
    if (absorbed > 0) parts.push(`(${absorbed} blocked)`);
    if (unit.statuses.vulnerable > 0) parts.push('[vulnerable]');
    this.addLog('damage', parts.join(' '));
    this.fx.push({
      kind: 'attack',
      sourceSide: source.side,
      sourceId: source.itemId,
      target,
      amount: dealt,
      text: dealt > 0 ? `-${dealt}` : 'blocked',
    });
    this.checkDeaths();
  }

  private gainBlock(target: Unit, amount: number, source: Source): void {
    const unit = target === 'player' ? this.player : this.enemy;
    unit.block += amount;
    this.addLog('info', `${unit.name} gains ${amount} Block.`);
    this.fx.push({
      kind: 'block',
      sourceSide: source.side,
      sourceId: source.itemId,
      target,
      amount,
      text: `+${amount}`,
    });
  }

  private applyStatus(target: Unit, status: StatusId, amount: number, source: Source): void {
    const unit = target === 'player' ? this.player : this.enemy;
    unit.statuses[status] += amount;
    this.addLog('status', `${unit.name} gains ${amount} ${status}.`);
    this.fx.push({
      kind: 'status',
      sourceSide: source.side,
      sourceId: source.itemId,
      target,
      amount,
      text: `${amount} ${status}`,
    });
    if (status === 'burning') this.emitStatusApplied(status, target);
  }

  private reduceAllCooldowns(amount: number): void {
    const affected = this.items.filter((item) => item.cooldownMax > 0 && item.cooldown > 0);
    for (const item of affected) item.cooldown = Math.max(0, item.cooldown - amount);
    if (affected.length > 0) {
      this.addLog('info', `Cooldowns of ${affected.length} item(s) reduced by ${amount}.`);
    }
  }

  private delayPlayerItems(amount: number, count: number): void {
    const targets = this.items
      .filter((item) => item.cooldownMax > 0)
      .sort((a, b) => a.cooldown - b.cooldown)
      .slice(0, count);
    for (const item of targets) {
      item.cooldown += amount;
      this.addLog('warn', `${item.def.name} is slowed (+${amount} cooldown).`);
    }
  }

  private drawCards(amount: number): void {
    for (let i = 0; i < amount; i++) {
      if (this.hand.length >= HAND_LIMIT) {
        this.addLog('warn', 'Hand is full.');
        return;
      }
      if (this.drawPile.length === 0) {
        if (this.discardPile.length === 0) return;
        this.drawPile = shuffleWith(this.discardPile, this.rand);
        this.discardPile = [];
        this.addLog('info', 'Discard pile reshuffled into the draw pile.');
      }
      const card = this.drawPile.pop();
      if (card) this.hand.push(card);
    }
  }

  private drawTo(size: number): void {
    const missing = Math.max(0, size - this.hand.length);
    if (missing > 0) this.drawCards(missing);
  }

  private checkDeaths(): void {
    if (this.enemy.hp <= 0) {
      this.enemy.hp = 0;
      this.outcome = 'victory';
      this.addLog('beat', `${this.enemy.name} is defeated.`);
    } else if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.outcome = 'defeat';
      this.addLog('beat', 'You collapse. The forge goes dark.');
    }
  }

  // ---------------------------------------------------------- trigger chain ---

  private emitStatusApplied(status: StatusId, on: Unit): void {
    for (const item of this.items) {
      item.def.abilities.forEach((ability, index) => {
        if (ability.trigger !== 'event' || !ability.event) return;
        const spec = ability.event;
        if (spec.name !== 'status_applied') return;
        if (spec.status && spec.status !== status) return;
        if (spec.on && spec.on !== on) return;
        if (spec.oncePerBeat && item.usedAbilities.has(index)) return;
        this.eventQueue.push({ item, ability, index });
      });
    }
    this.drainEvents();
  }

  private drainEvents(): void {
    if (this.draining) return;
    this.draining = true;
    while (this.eventQueue.length > 0) {
      if (this.outcome) {
        this.eventQueue = [];
        break;
      }
      this.eventCount += 1;
      if (this.eventCount > MAX_CHAIN_EVENTS) {
        this.addLog('warn', 'Trigger limit reached — chain stopped.');
        this.eventQueue = [];
        break;
      }
      const next = this.eventQueue.shift();
      if (!next) break;
      const spec = next.ability.event;
      if (spec?.oncePerBeat) {
        if (next.item.usedAbilities.has(next.index)) continue;
        next.item.usedAbilities.add(next.index);
      }
      this.addLog('react', `${next.item.def.icon} ${next.item.def.name} reacts.`);
      this.resolveEffects(next.ability.effects, {
        side: 'player',
        itemId: next.item.id,
        label: next.item.def.name,
        runtime: next.item,
      });
    }
    this.draining = false;
  }

  // --------------------------------------------------------------- helpers ---

  /** Enemy items that will fire when the player ends their turn. */
  enemyPreview(): ItemRuntime[] {
    return this.enemyItems
      .filter((item) => this.canActivate(item) && item.cooldown <= 0)
      .sort(readingOrder);
  }

  item(id: string): ItemRuntime | undefined {
    return this.items.find((rt) => rt.id === id);
  }

  enemyItem(id: string): ItemRuntime | undefined {
    return this.enemyItems.find((rt) => rt.id === id);
  }

  private addLog(kind: LogKind, text: string): void {
    this.log.push({ kind, text });
  }
}

function shuffleWith<T>(list: T[], rand: () => number): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

