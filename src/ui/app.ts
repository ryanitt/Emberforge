import { getCard } from '../data/cards';
import { getItem } from '../data/items';
import { NODE_BY_ID } from '../data/map';
import { getRelic } from '../data/relics';
import { Combat, type FxEvent } from '../model/combat';
import { spriteSvg } from './sprites';
import type { OwnedItem } from '../model/inventory';
import { randomSeed } from '../model/rng';
import {
  addItemToRun,
  allNodes,
  availableNodes,
  buildCombat,
  enemyForNode,
  enterNode,
  goldForNode,
  newRun,
  nodeState,
  relicReward,
  rollRewards,
  rollShop,
  type RewardOption,
  type RunState,
  type Screen,
  type ShopStock,
} from '../model/run';
import type { CardDef, MapNode } from '../model/types';
import { classNames, html, raw, type Html } from './dom';

interface DragState {
  id: string;
  startX: number;
  startY: number;
  moved: boolean;
}

const NODE_ICON: Record<string, string> = {
  combat: '⚔️',
  elite: '💀',
  boss: '🌋',
  merchant: '🛒',
  rest: '🏕️',
  treasure: '📦',
};

const NODE_BLURB: Record<string, string> = {
  combat: 'A fight.',
  elite: 'A dangerous fight. Drops a relic.',
  boss: 'The act boss.',
  merchant: 'Buy, heal, or remove a card.',
  rest: 'Heal or remove a card.',
  treasure: 'Free loot.',
};

export class App {
  private root: HTMLElement;
  private screen: Screen = 'title';
  private run: RunState | null = null;
  private node: MapNode | null = null;
  private combat: Combat | null = null;
  private rewardOptions: RewardOption[] = [];
  private rewardGold = 0;
  private rewardTitle = '';
  private shop: ShopStock | null = null;
  private pendingCard: number | null = null;
  private selected: string | null = null;
  private note: string | null = null;
  private removeMode = false;
  private fxPlayed = 0;
  private drag: DragState | null = null;
  private ghost: HTMLElement | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    this.render();
  }

  // ------------------------------------------------------------- rendering ---

  private render(): void {
    this.root.innerHTML = this.view().value;
    const log = this.root.querySelector('.log-list') as HTMLElement | null;
    if (log) log.scrollTop = log.scrollHeight;
    if (this.combat) this.playFx(this.combat);
    this.revealOutcome();
  }

  /**
   * The result card covers the arena, so hold it back briefly: the killing blow
   * and the loser toppling over should be visible before the outcome lands.
   */
  private revealOutcome(): void {
    const combat = this.combat;
    if (!combat?.outcome || this.outcomeShown || this.outcomePending) return;
    this.outcomePending = true;
    globalThis.setTimeout(() => {
      this.outcomePending = false;
      this.outcomeShown = true;
      if (this.combat === combat) this.render();
    }, 900);
  }

  // ------------------------------------------------------------ animation ---

  /** Per-panel cascade slot, so numbers that land together never overlap. */
  private fxSlots = new Map<string, number>();
  /** Whether the victory/defeat card may cover the arena yet. */
  private outcomeShown = false;
  private outcomePending = false;

  /** Replays every effect the model resolved since the last render. */
  private playFx(combat: Combat): void {
    this.fxSlots.clear();
    if (this.screen !== 'combat') {
      this.fxPlayed = combat.fx.length;
      return;
    }
    const pending = combat.fx.slice(this.fxPlayed);
    this.fxPlayed = combat.fx.length;
    pending.slice(0, 14).forEach((event, index) => {
      globalThis.setTimeout(() => this.animateFx(event), index * 140);
    });
  }

  private animateFx(event: FxEvent): void {
    const panel = this.root.querySelector(`[data-fx-panel="${event.target}"]`) as HTMLElement | null;
    const attacker = this.fighterEl(event.sourceSide);
    const victim = this.fighterEl(event.target);
    // Attacks fly between the fighters; everything else still starts at the item
    // that caused it, falling back to the panel when there is no arena.
    const source =
      attacker ??
      (this.root.querySelector(
        event.sourceId ? `[data-fx-item="${event.sourceId}"]` : `[data-fx-panel="${event.sourceSide}"]`,
      ) as HTMLElement | null);
    const target = victim ?? panel;
    if (!source || !target) return;
    if (attacker && (event.kind === 'attack' || event.kind === 'status')) {
      this.react(attacker, 'is-attacking', 340);
    }
    const from = source.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);

    // Only the item tile flashes; a fighter gets the lunge above instead.
    if (source.dataset.fxItem) {
      source.classList.add('fx-firing');
      globalThis.setTimeout(() => source.classList.remove('fx-firing'), 280);
    }

    const bolt = document.createElement('div');
    bolt.className = `fx-bolt fx-bolt-${event.kind}`;
    bolt.textContent = event.kind === 'attack' ? '✦' : event.kind === 'block' ? '🛡' : '✧';
    bolt.style.left = `${from.left + from.width / 2}px`;
    bolt.style.top = `${from.top + from.height / 2}px`;
    document.body.appendChild(bolt);
    const flight = bolt.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0.3 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.25)`, opacity: 1 },
      ],
      { duration: 260, easing: 'cubic-bezier(.35,.05,.9,.45)', fill: 'forwards' },
    );
    flight.onfinish = () => {
      bolt.remove();
      if (panel) this.impact(panel, event);
      // Gaining block already shows a "+N" number and updates the chip; only
      // damage should make the fighter flinch.
      if (victim && event.kind !== 'block') this.react(victim, 'is-hurt', 320);
    };
  }

  private impact(target: HTMLElement, event: FxEvent): void {
    const rect = target.getBoundingClientRect();
    // Several effects land on the same panel in one beat ("blocked", "2 burning",
    // the hit itself), so each one gets its own slot in a fan instead of stacking
    // on top of the last.
    const side = target.dataset.fxPanel ?? 'event';
    const slot = this.fxSlots.get(side) ?? 0;
    this.fxSlots.set(side, (slot + 1) % 4);
    const drift = [0, 96, -96, 192][slot];
    const lift = slot * 22;
    const float = document.createElement('div');
    float.className = `fx-float fx-float-${event.kind}`;
    float.textContent = event.text;
    // Near the panel's bottom edge, so the numbers rise through empty space
    // instead of over the name and health bar.
    float.style.left = `${rect.left + rect.width / 2 + drift}px`;
    float.style.top = `${rect.bottom - 46 - lift}px`;
    document.body.appendChild(float);
    globalThis.setTimeout(() => float.remove(), 950);
    target.classList.add('fx-hit');
    globalThis.setTimeout(() => target.classList.remove('fx-hit'), 260);
  }

  private view(): Html {
    if (this.screen === 'title' || !this.run) {
      return html`<div class="shell">${this.titleView()}</div>`;
    }
    return html`
      <div class="shell">
        ${this.topbar()}
        ${this.note ? this.noteBar() : ''}
        <main class="screen">${this.screenView()}</main>
      </div>
    `;
  }

  private noteBar(): Html {
    return html`<div class="note">
      <span>${this.note}</span>
      <button class="note-close" data-act="dismiss-note" aria-label="Dismiss">×</button>
    </div>`;
  }

  private topbar(): Html {
    const run = this.run!;
    const hpPct = Math.max(0, Math.min(100, (run.hp / run.maxHp) * 100));
    return html`
      <header class="topbar">
        <div class="brand"><span class="brand-mark">🔨</span> Emberforge</div>
        <div class="topbar-stats">
          <div class="stat hp-stat" title="Health">
            <span class="stat-label">HP</span>
            <div class="hp-track"><div class="hp-fill" style="width:${hpPct}%"></div></div>
            <span class="stat-value">${run.hp}/${run.maxHp}</span>
          </div>
          <div class="stat" title="Gold"><span class="stat-icon">🪙</span><span class="stat-value">${run.gold}</span></div>
          <div class="stat" title="Deck size"><span class="stat-icon">🃏</span><span class="stat-value">${run.deck.length}</span></div>
          <div class="relics">
            ${run.relics.map((id) => {
              const relic = getRelic(id);
              return html`<span class="relic" title="${relic.name}: ${relic.text}">${relic.icon}</span>`;
            })}
          </div>
        </div>
      </header>
    `;
  }

  private screenView(): Html {
    switch (this.screen) {
      case 'map':
        return this.mapView();
      case 'loadout':
        return this.loadoutView();
      case 'combat':
        return this.combatView();
      case 'reward':
        return this.rewardView();
      case 'treasure':
        return this.rewardView();
      case 'merchant':
        return this.merchantView();
      case 'rest':
        return this.restView();
      case 'summary':
        return this.summaryView();
      default:
        return this.titleView();
    }
  }

  // ----------------------------------------------------------------- title ---

  private titleView(): Html {
    return html`
      <section class="title-screen">
        <div class="title-card">
          <p class="eyebrow">A tactical engine-building roguelite</p>
          <h1>Emberforge</h1>
          <p class="tagline">
            Build a machine out of items. Wire them together on the grid. Then use your deck to
            pull the machine's levers at exactly the right moment.
          </p>
          <div class="pillars">
            <div class="pillar">
              <h3>🔧 Items define the machine</h3>
              <p>Placed items fire automatically at the start of every beat. Edge-adjacent items share bonuses, so arrangement is your build.</p>
            </div>
            <div class="pillar">
              <h3>🃏 Cards control the machine</h3>
              <p>Trigger an item early, accelerate cooldowns, or double the next activation. Every card bends your engine's timing.</p>
            </div>
            <div class="pillar">
              <h3>🗺️ Runs make the story</h3>
              <p>Climb a short act, take elite fights for relics, and put out The Bellows before it burns you down.</p>
            </div>
          </div>
          <button class="btn btn-primary btn-large" data-act="start-run">Begin a run</button>
          <p class="hint">
            How to play: energy 3 · hand 5 · block resets each beat · 12 items · 13 cards · 3 relics
          </p>
        </div>
      </section>
    `;
  }

  // ------------------------------------------------------------------- map ---

  private mapView(): Html {
    const run = this.run!;
    const nodes = allNodes();
    const cols = 3;
    const rows = 5;
    return html`
      <div class="map-layout">
        <section class="panel map-panel">
          <h2 class="panel-title">The Act</h2>
          <div class="map" style="--rows:${rows};--cols:${cols}">
            <svg class="map-lines" viewBox="0 0 ${cols * 100} ${rows * 100}" preserveAspectRatio="none">
              ${nodes.map((node) =>
                node.next.map((nextId) => {
                  const next = NODE_BY_ID[nextId];
                  if (!next) return '';
                  const state = nodeState(run, node);
                  const nextState = nodeState(run, next);
                  const walked = state === 'visited' || state === 'current';
                  const lit = walked && (nextState === 'available' || nextState === 'visited' || nextState === 'current');
                  return raw(
                    `<line x1="${node.col * 100 + 50}" y1="${node.row * 100 + 50}" x2="${
                      next.col * 100 + 50
                    }" y2="${next.row * 100 + 50}" class="${lit ? 'line lit' : 'line'}" />`,
                  );
                }),
              )}
            </svg>
            ${nodes.map((node) => {
              const state = nodeState(run, node);
              const clickable = state === 'available';
              return html`
                <button
                  class="${classNames('map-node', `node-${node.type}`, `state-${state}`)}"
                  style="grid-column:${node.col + 1};grid-row:${node.row + 1}"
                  data-act="${clickable ? 'node' : 'inspect-node'}"
                  data-node="${node.id}"
                  title="${node.label} — ${NODE_BLURB[node.type]}"
                >
                  <span class="node-icon">${NODE_ICON[node.type] ?? '❔'}</span>
                  <span class="node-label">${node.label}</span>
                  ${state === 'current' ? html`<span class="node-tag">HERE</span>` : ''}
                </button>
              `;
            })}
          </div>
          <p class="hint">Pick any glowing node connected to your position.</p>
        </section>

        <aside class="map-side">
          ${this.buildPanel()}
          <section class="panel">
            <h2 class="panel-title">Run</h2>
            <dl class="facts">
              <div><dt>Seed</dt><dd>${run.seed}</dd></div>
              <div><dt>Nodes cleared</dt><dd>${Math.max(0, run.visited.length - 1)}</dd></div>
              <div><dt>Inventory</dt><dd>${run.inventory.placed().length} placed · ${run.inventory.bench().length} benched</dd></div>
              <div><dt>Free cells</dt><dd>${run.inventory.freeCells()}</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    `;
  }

  private buildPanel(): Html {
    const run = this.run!;
    return html`
      <section class="panel">
        <h2 class="panel-title">Your build</h2>
        <div class="mini-board">
          ${run.inventory.placed().map((item) => {
            const def = getItem(item.defId);
            const [w, h] = run.inventory.sizeOf(item);
            const [x, y] = item.pos!;
            return html`<div
              class="mini-tile"
              style="grid-column:${x + 1} / span ${w};grid-row:${y + 1} / span ${h}"
              title="${def.name}: ${def.text}"
            >
              ${def.icon}
            </div>`;
          })}
        </div>
        <button class="btn btn-secondary full" data-act="open-loadout">Arrange inventory & deck</button>
      </section>
    `;
  }

  // --------------------------------------------------------------- loadout ---

  private loadoutView(): Html {
    const run = this.run!;
    const node = this.node;
    const title = node ? node.label : 'Prepare';
    const selected = this.selected ? run.inventory.byId(this.selected) : null;
    return html`
      <div class="loadout-layout">
        <section class="panel">
          <h2 class="panel-title">${title} — arrange your engine</h2>
          <p class="hint">Drag items onto the grid. Edge contact (not diagonal) shares bonuses. Press <kbd>R</kbd> to rotate.</p>
          ${this.editBoard()}
          ${selected ? this.selectedToolbar(selected) : ''}
          <h3 class="sub-title">Bench</h3>
          <div class="bench">
            ${run.inventory.bench().length === 0
              ? html`<p class="hint">Nothing benched. Items that do not fit here are not active in combat.</p>`
              : run.inventory.bench().map((item) => this.benchTile(item))}
          </div>
        </section>

        <aside class="loadout-side">
          <section class="panel">
            <h2 class="panel-title">Deck · ${run.deck.length}</h2>
            <div class="deck-list">
              ${this.deckGroups().map((group) => {
                const card = getCard(group.id);
                return html`<div class="deck-row">
                  <span class="deck-count">${group.count}×</span>
                  <span class="deck-cost">${card.cost}</span>
                  <span class="deck-name">${card.name}</span>
                  <span class="deck-text">${card.text}</span>
                </div>`;
              })}
            </div>
          </section>
          <section class="panel">
            <h2 class="panel-title">Relics</h2>
            ${run.relics.map((id) => {
              const relic = getRelic(id);
              return html`<div class="relic-row"><span class="relic-icon">${relic.icon}</span><div><strong>${relic.name}</strong><p>${relic.text}</p></div></div>`;
            })}
          </section>
          <div class="actions">
            <button class="btn btn-primary full" data-act="begin-combat">Enter combat</button>
            ${
              this.reachedMap
                ? html`<button class="btn btn-ghost full" data-act="back-to-map">Back to map</button>`
                : ''
            }
          </div>
        </aside>
      </div>
    `;
  }

  private selectedToolbar(item: OwnedItem): Html {
    const def = getItem(item.defId);
    const canRotate = def.size[0] !== def.size[1];
    return html`
      <div class="selected-bar">
        <span class="selected-name">${def.icon} ${def.name} — ${def.text}</span>
        <div class="selected-actions">
          ${canRotate ? html`<button class="btn btn-small" data-act="rotate-item">Rotate</button>` : ''}
          ${item.pos ? html`<button class="btn btn-small" data-act="bench-item">Bench it</button>` : ''}
        </div>
      </div>
    `;
  }

  private benchTile(item: OwnedItem): Html {
    const def = getItem(item.defId);
    return html`
      <div class="bench-tile" data-drag="${item.id}" data-act="select-item" data-id="${item.id}" title="${def.name}: ${def.text}">
        <span class="bench-icon">${def.icon}</span>
        <span class="bench-name">${def.name}</span>
      </div>
    `;
  }

  private editBoard(): Html {
    const run = this.run!;
    const inv = run.inventory;
    const cells: Html[] = [];
    for (let y = 0; y < inv.rows; y++) {
      for (let x = 0; x < inv.cols; x++) {
        cells.push(
          html`<div class="cell" data-cell="${x},${y}" style="grid-column:${x + 1};grid-row:${y + 1}"></div>`,
        );
      }
    }
    return html`
      <div class="board-wrap">
        <div class="board" style="--cols:${inv.cols};--rows:${inv.rows}">
          ${cells}
          ${inv.placed().map((item) => {
            const def = getItem(item.defId);
            const [w, h] = inv.sizeOf(item);
            const [x, y] = item.pos!;
            return html`<div
              class="${classNames('tile', `rarity-${def.rarity}`, this.selected === item.id && 'tile-selected', w * h === 1 && 'tile-small')}"
              style="grid-column:${x + 1} / span ${w};grid-row:${y + 1} / span ${h}"
              data-drag="${item.id}"
              data-act="select-item"
              data-id="${item.id}"
              data-cell="${x},${y}"
              title="${def.name} — ${def.text} · cooldown ${def.cooldown}"
            >
              <span class="tile-icon">${def.icon}</span>
              <span class="tile-name">${def.name}</span>
            </div>`;
          })}
        </div>
      </div>
    `;
  }

  private deckGroups(): { id: string; count: number }[] {
    const groups = new Map<string, number>();
    for (const id of this.run!.deck) groups.set(id, (groups.get(id) ?? 0) + 1);
    return [...groups.entries()]
      .sort((a, b) => getCard(a[0]).name.localeCompare(getCard(b[0]).name))
      .map(([id, count]) => ({ id, count }));
  }

  // ---------------------------------------------------------------- combat ---

  /**
   * The card waiting for an item target. Returns null when no targeting choice is
   * pending *or* when the hand shifted underneath it (a stale index must never
   * crash the screen).
   */
  private pendingCardDef(): { index: number; card: CardDef } | null {
    const combat = this.combat;
    if (!combat || this.pendingCard === null) return null;
    const cardId = combat.hand[this.pendingCard];
    if (!cardId) return null;
    return { index: this.pendingCard, card: getCard(cardId) };
  }

  private combatView(): Html {
    const combat = this.combat!;
    const pending = this.pendingCardDef();
    const needsEnemy = pending?.card.needsEnemyItem ?? false;
    const playerTargets =
      pending && !needsEnemy ? new Set(combat.targetableItems(pending.card)) : new Set<string>();
    const enemyTargets =
      pending && needsEnemy ? new Set(combat.targetableEnemyItems(pending.card)) : new Set<string>();
    return html`
      <div class="combat-layout">
        <div class="combat-main">
          ${this.enemyPanel(combat, enemyTargets)} ${this.arenaPanel(combat)}
          ${this.playerPanel(combat, playerTargets)}
          <section class="panel hand-panel">
            <div class="hand-head">
              <span class="energy">⚡ ${combat.player.energy}<span class="energy-max">/3</span></span>
              <span class="block-chip ${combat.player.block > 0 ? 'active' : ''}" title="Block absorbs damage and resets at the start of each beat">🛡️ ${combat.player.block}</span>
              <span class="piles">Draw ${combat.drawPile.length} · Discard ${combat.discardPile.length}</span>
              <button class="btn btn-primary" data-act="end-turn" ${combat.outcome ? 'disabled' : ''}>End turn</button>
            </div>
            ${pending ? this.targetHint(pending.card) : ''}
            <div class="hand">
              ${combat.hand.map((cardId, index) => this.handCard(cardId, index, combat))}
              ${combat.hand.length === 0 ? html`<p class="hint">No cards in hand.</p>` : ''}
            </div>
          </section>
        </div>
        <aside class="panel log-panel">
          <h2 class="panel-title">Combat log</h2>
          <div class="log-list">
            ${combat.log.map(
              (entry) => html`<div class="log-entry log-${entry.kind}">${entry.text}</div>`,
            )}
          </div>
        </aside>
        ${combat.outcome && this.outcomeShown ? this.outcomeOverlay(combat) : ''}
      </div>
    `;
  }

  /**
   * The two fighters facing each other. Purely presentational — the model knows
   * nothing about it; the animation classes are applied from the fx stream.
   */
  private arenaPanel(combat: Combat): Html {
    return html`
      <section class="panel arena-panel" aria-label="Battle">
        <div class="arena" data-tier="${this.node?.type ?? 'combat'}">
          <div class="fighter ${combat.player.hp <= 0 ? 'is-down' : ''}" data-sprite="player">
            <span class="fighter-shadow"></span>
            <div class="fighter-bob">${spriteSvg('pyromancer')}</div>
          </div>
          <div class="fighter fighter-enemy ${combat.enemy.hp <= 0 ? 'is-down' : ''}" data-sprite="enemy">
            <span class="fighter-shadow"></span>
            <div class="fighter-bob">${spriteSvg(combat.enemy.def.sprite)}</div>
          </div>
        </div>
      </section>
    `;
  }

  private fighterEl(side: string | undefined): HTMLElement | null {
    if (!side) return null;
    return this.root.querySelector(
      `.arena .fighter[data-sprite="${side}"]`,
    ) as HTMLElement | null;
  }

  /** Restarts a one-shot animation class, even if it is already running. */
  private react(el: HTMLElement, className: string, ms: number): void {
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
    globalThis.setTimeout(() => el.classList.remove(className), ms);
  }

  private enemyPanel(combat: Combat, targets: Set<string>): Html {
    const enemy = combat.enemy;
    const hpPct = Math.max(0, (enemy.hp / enemy.maxHp) * 100);
    const preview = combat.enemyPreview();
    return html`
      <section class="panel duel-panel enemy-panel" data-fx-panel="enemy">
        <div class="duel-body">
          <div class="duel-info">
            <div class="fighter-head">
              <span class="fighter-icon">${enemy.def.icon}</span>
              <div class="fighter-id">
                <h2>${enemy.name}</h2>
                <p class="hint">${enemy.def.blurb}</p>
              </div>
            </div>
            <div class="bar-row">
              <div class="bar-track"><div class="bar-fill bar-enemy" style="width:${hpPct}%"></div></div>
              <span class="bar-value">${enemy.hp}/${enemy.maxHp}</span>
            </div>
            <div class="bar-row">
              <span class="block-chip ${enemy.block > 0 ? 'active' : ''}" title="Enemy Block absorbs your damage and clears when its engine fires">🛡️ ${enemy.block}</span>
              ${statusChips(enemy.statuses)}
            </div>
            <div class="intent" title="Enemy items that will fire when you end your turn">
              <span class="intent-label">Firing next</span>
              ${preview.length === 0
                ? html`<span class="intent-text dim">Nothing this beat</span>`
                : preview.map((item) => html`<span class="intent-text">${item.def.icon} ${item.def.text}</span>`)}
            </div>
          </div>
          ${this.enemyBoardView(combat, targets)}
        </div>
      </section>
    `;
  }

  private playerPanel(combat: Combat, targets: Set<string>): Html {
    const player = combat.player;
    const hpPct = Math.max(0, (player.hp / player.maxHp) * 100);
    return html`
      <section class="panel duel-panel player-panel" data-fx-panel="player">
        <div class="duel-body">
          <div class="duel-info">
            <div class="fighter-head">
              <span class="fighter-icon">🧙</span>
              <div class="fighter-id">
                <h2>${player.name}</h2>
                <p class="hint">Your engine fires at the start of every beat.</p>
              </div>
            </div>
            <div class="bar-row">
              <div class="bar-track"><div class="bar-fill" style="width:${hpPct}%"></div></div>
              <span class="bar-value">${player.hp}/${player.maxHp}</span>
            </div>
            <div class="bar-row">
              <span class="block-chip ${player.block > 0 ? 'active' : ''}" title="Block absorbs damage and resets at the start of each beat">🛡️ ${player.block}</span>
              ${statusChips(player.statuses)}
              <span class="energy-chip" title="Energy this turn">⚡ ${player.energy}/3</span>
            </div>
          </div>
          ${this.playerBoardView(combat, targets)}
        </div>
      </section>
    `;
  }

  private playerBoardView(combat: Combat, targetable: Set<string>): Html {
    const run = this.run!;
    const inv = run.inventory;
    const cells: Html[] = [];
    for (let y = 0; y < inv.rows; y++) {
      for (let x = 0; x < inv.cols; x++) {
        cells.push(html`<div class="cell" data-cell="${x},${y}" style="grid-column:${x + 1};grid-row:${y + 1}"></div>`);
      }
    }
    return html`
      <div class="board-wrap board-wrap-combat">
        <div class="board" style="--cols:${inv.cols};--rows:${inv.rows}">
          ${cells}
          ${combat.items.map((item) => {
            const def = item.def;
            const [w, h] = item.rotated ? [def.size[1], def.size[0]] : def.size;
            const [x, y] = item.pos;
            const passive = !combat.canActivate(item);
            const ready = !passive && item.cooldown <= 0;
            const isTarget = targetable.has(item.id);
            const badge = passive ? 'PASSIVE' : ready ? 'READY' : `${item.cooldown}`;
            const tooltip = [
              `${def.name} — ${def.text}`,
              passive ? 'Passive: always on.' : `Cooldown ${item.cooldownMax} beats, currently ${item.cooldown}.`,
              item.sources.length ? `Bonuses: ${item.sources.join(', ')}` : '',
              item.activatedThisBeat ? 'Already activated this beat.' : '',
            ]
              .filter(Boolean)
              .join(' · ');
            return html`<div
              class="${classNames(
                'tile',
                'tile-combat',
                `rarity-${def.rarity}`,
                w * h === 1 && 'tile-small',
                passive && 'tile-passive',
                ready && !passive && 'tile-ready',
                item.activatedThisBeat && 'tile-fired',
                isTarget && 'tile-target',
              )}"
              style="grid-column:${x + 1} / span ${w};grid-row:${y + 1} / span ${h}"
              data-cell="${x},${y}"
              data-fx-item="${item.id}"
              title="${tooltip}"
              data-act="${isTarget ? 'target-item' : 'inspect'}"
              data-id="${item.id}"
            >
              <span class="tile-icon">${def.icon}</span>
              <span class="tile-name">${def.name}</span>
              <span class="tile-badge ${ready ? 'badge-ready' : ''}">${badge}</span>
            </div>`;
          })}
        </div>
      </div>
    `;
  }

  private enemyBoardView(combat: Combat, targetable: Set<string>): Html {
    const [cols, rows] = combat.enemyBoard;
    const cells: Html[] = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        cells.push(html`<div class="cell" data-cell="${x},${y}" style="grid-column:${x + 1};grid-row:${y + 1}"></div>`);
      }
    }
    return html`
      <div class="board-wrap board-wrap-enemy">
        <div class="board" style="--cols:${cols};--rows:${rows}">
          ${cells}
          ${combat.enemyItems.map((item) => {
            const def = item.def;
            const [w, h] = def.size;
            const [x, y] = item.pos;
            const ready = item.cooldown <= 0;
            const isTarget = targetable.has(item.id);
            return html`<div
              class="${classNames(
                'tile',
                'tile-combat',
                'tile-enemy',
                w * h === 1 && 'tile-small',
                ready && 'tile-ready',
                item.activatedThisBeat && 'tile-fired',
                isTarget && 'tile-target',
              )}"
              style="grid-column:${x + 1} / span ${w};grid-row:${y + 1} / span ${h}"
              data-fx-item="${item.id}"
              title="${def.name} — ${def.text} · cooldown ${item.cooldownMax}, currently ${item.cooldown}"
              data-act="${isTarget ? 'target-enemy-item' : 'inspect'}"
              data-id="${item.id}"
            >
              <span class="tile-icon">${def.icon}</span>
              <span class="tile-badge ${ready ? 'badge-ready' : ''}">${ready ? 'READY' : item.cooldown}</span>
            </div>`;
          })}
        </div>
      </div>
    `;
  }

  private targetHint(card: CardDef): Html {
    return html`<div class="target-hint">
      <span>${card.name}: choose ${card.needsEnemyItem ? "an enemy item" : 'one of your items'} on a glowing tile.</span>
      <button class="btn btn-small" data-act="cancel-target">Cancel</button>
    </div>`;
  }

  private handCard(cardId: string, index: number, combat: Combat): Html {
    const card = getCard(cardId);
    const playable = combat.canPlay(index);
    const active = this.pendingCard === index;
    return html`
      <button
        class="${classNames('card', `rarity-${card.rarity}`, !playable && 'card-disabled', active && 'card-active')}"
        data-act="card"
        data-index="${index}"
        title="${card.text}"
        ${playable ? '' : 'disabled'}
      >
        <span class="card-cost">${card.cost}</span>
        <span class="card-name">${card.name}</span>
        <span class="card-text">${card.text}</span>
        ${card.needsEnemyItem
          ? html`<span class="card-tag">targets enemy item</span>`
          : card.needsItem
            ? html`<span class="card-tag">targets item</span>`
            : ''}
      </button>
    `;
  }

  private outcomeOverlay(combat: Combat): Html {
    const victory = combat.outcome === 'victory';
    return html`
      <div class="overlay">
        <div class="overlay-card">
          <h2>${victory ? 'Victory' : 'Defeat'}</h2>
          <p>
            ${victory
              ? `You put down ${combat.enemy.name} in ${combat.beat} beats with ${combat.player.hp} HP left.`
              : `${combat.enemy.name} outlasted your engine.`}
          </p>
          ${victory
            ? html`<button class="btn btn-primary" data-act="continue">Claim rewards</button>`
            : html`<button class="btn btn-primary" data-act="defeat-continue">See run summary</button>`}
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------- rewards ---

  private rewardView(): Html {
    const run = this.run!;
    const treasure = this.screen === 'treasure';
    return html`
      <section class="panel reward-panel">
        <h2 class="panel-title">${this.rewardTitle}</h2>
        <p class="hint">
          ${treasure ? 'Take one item.' : 'Choose one card or item.'}
          ${this.rewardGold > 0 ? ` You also found ${this.rewardGold} gold.` : ''}
        </p>
        <div class="reward-grid">
          ${this.rewardOptions.map((option, index) => this.rewardCard(option, index))}
        </div>
        <div class="actions">
          <button class="btn btn-ghost" data-act="skip-reward">
            ${treasure ? 'Leave the vault' : 'Skip the reward'}
          </button>
        </div>
        <p class="hint">Gold ${run.gold} · items that do not fit on the grid go to the bench.</p>
      </section>
    `;
  }

  private rewardCard(option: RewardOption, index: number): Html {
    if (option.kind === 'item') {
      const def = getItem(option.id);
      return html`
        <button class="reward-card card rarity-${def.rarity}" data-act="pick-reward" data-index="${index}">
          <span class="reward-icon">${def.icon}</span>
          <span class="reward-name">${def.name}</span>
          <span class="reward-kind">Item · ${def.rarity}</span>
          <span class="reward-text">${def.text}</span>
          <span class="reward-text dim">Size ${def.size[0]}×${def.size[1]} · cooldown ${def.cooldown} · ${def.tags.join(', ')}</span>
        </button>
      `;
    }
    const card = getCard(option.id);
    return html`
      <button class="reward-card card rarity-${card.rarity}" data-act="pick-reward" data-index="${index}">
        <span class="reward-icon">🃏</span>
        <span class="reward-name">${card.name}</span>
        <span class="reward-kind">Card · cost ${card.cost} · ${card.rarity}</span>
        <span class="reward-text">${card.text}</span>
      </button>
    `;
  }

  // -------------------------------------------------------------- merchant ---

  private merchantView(): Html {
    const run = this.run!;
    const shop = this.shop!;
    return html`
      <div class="shop-layout">
        <section class="panel">
          <h2 class="panel-title">Tinker’s Cart</h2>
          <p class="hint">You have 🪙 ${run.gold}. Stock does not restock.</p>
          <h3 class="sub-title">Items</h3>
          ${shop.items.map(
            (entry, index) => html`
              <div class="shop-row">
                <span class="shop-icon">${getItem(entry.id).icon}</span>
                <div class="shop-body">
                  <strong>${getItem(entry.id).name}</strong>
                  <p>${getItem(entry.id).text}</p>
                </div>
                <button
                  class="btn btn-small"
                  data-act="buy-item"
                  data-index="${index}"
                  ${entry.sold || run.gold < entry.price ? 'disabled' : ''}
                >
                  ${entry.sold ? 'Sold' : `🪙 ${entry.price}`}
                </button>
              </div>
            `,
          )}
          <h3 class="sub-title">Cards</h3>
          ${shop.cards.map(
            (entry, index) => html`
              <div class="shop-row">
                <span class="shop-icon">🃏</span>
                <div class="shop-body">
                  <strong>${getCard(entry.id).name}</strong>
                  <p>${getCard(entry.id).text}</p>
                </div>
                <button
                  class="btn btn-small"
                  data-act="buy-card"
                  data-index="${index}"
                  ${entry.sold || run.gold < entry.price ? 'disabled' : ''}
                >
                  ${entry.sold ? 'Sold' : `🪙 ${entry.price}`}
                </button>
              </div>
            `,
          )}
          <h3 class="sub-title">Services</h3>
          <div class="shop-row">
            <span class="shop-icon">🔥</span>
            <div class="shop-body">
              <strong>Warm up</strong>
              <p>Heal ${shop.healAmount} HP.</p>
            </div>
            <button class="btn btn-small" data-act="buy-heal" ${run.gold < shop.healPrice || run.hp >= run.maxHp ? 'disabled' : ''}>
              🪙 ${shop.healPrice}
            </button>
          </div>
          <div class="shop-row">
            <span class="shop-icon">✂️</span>
            <div class="shop-body">
              <strong>Prune the deck</strong>
              <p>Remove one card from your deck.</p>
            </div>
            <button class="btn btn-small" data-act="buy-remove" ${run.gold < shop.removePrice ? 'disabled' : ''}>
              🪙 ${shop.removePrice}
            </button>
          </div>
          ${this.removeMode ? this.removeList('shop-remove') : ''}
          <div class="actions">
            <button class="btn btn-ghost" data-act="leave-shop">Leave</button>
          </div>
        </section>
        ${this.buildPanel()}
      </div>
    `;
  }

  private removeList(mode: 'shop-remove' | 'rest-remove'): Html {
    const run = this.run!;
    return html`
      <div class="remove-list">
        <p class="hint">Choose a card to remove.</p>
        ${run.deck.map(
          (cardId, index) => html`<button class="remove-row" data-act="${mode}" data-index="${index}">
            <span class="deck-cost">${getCard(cardId).cost}</span>
            <span>${getCard(cardId).name}</span>
            <span class="deck-text">${getCard(cardId).text}</span>
          </button>`,
        )}
        <button class="btn btn-small" data-act="cancel-remove">Cancel</button>
      </div>
    `;
  }

  // ------------------------------------------------------------------ rest ---

  private restView(): Html {
    const run = this.run!;
    const healAmount = Math.round(run.maxHp * 0.3);
    return html`
      <div class="shop-layout">
        <section class="panel">
          <h2 class="panel-title">Cold Hearth</h2>
          <p class="hint">A quiet moment. Choose one thing to do before the climb continues.</p>
          <div class="rest-options">
            <button class="rest-card" data-act="rest-heal" ${run.hp >= run.maxHp ? 'disabled' : ''}>
              <span class="rest-icon">🔥</span>
              <strong>Rest</strong>
              <p>Heal ${healAmount} HP.</p>
            </button>
            <button class="rest-card" data-act="rest-remove">
              <span class="rest-icon">✂️</span>
              <strong>Smith</strong>
              <p>Remove one card from your deck.</p>
            </button>
          </div>
          ${this.removeMode ? this.removeList('rest-remove') : ''}
          <div class="actions">
            <button class="btn btn-ghost" data-act="leave-rest">Move on</button>
          </div>
        </section>
        ${this.buildPanel()}
      </div>
    `;
  }

  // --------------------------------------------------------------- summary ---

  private summaryView(): Html {
    const run = this.run!;
    const victory = run.outcome === 'victory';
    return html`
      <section class="panel summary-panel">
        <p class="eyebrow">${victory ? 'Run complete' : 'Run ended'}</p>
        <h2 class="summary-title">${victory ? 'The Bellows is silent.' : 'The forge claims you.'}</h2>
        <p class="hint">
          ${victory
            ? 'You built an engine good enough to survive the act.'
            : `You fell at ${this.node?.label ?? 'the forge'} after ${Math.max(0, run.visited.length - 1)} nodes.`}
        </p>
        <dl class="facts summary-facts">
          <div><dt>Nodes cleared</dt><dd>${Math.max(0, run.visited.length - 1)}</dd></div>
          <div><dt>Health</dt><dd>${run.hp}/${run.maxHp}</dd></div>
          <div><dt>Gold</dt><dd>${run.gold}</dd></div>
          <div><dt>Deck</dt><dd>${run.deck.length} cards</dd></div>
          <div><dt>Items</dt><dd>${run.inventory.items.length}</dd></div>
          <div><dt>Relics</dt><dd>${run.relics.length}</dd></div>
          <div><dt>Seed</dt><dd>${run.seed}</dd></div>
        </dl>
        <div class="actions">
          <button class="btn btn-primary" data-act="new-run">Start a new run</button>
        </div>
      </section>
    `;
  }

  // ----------------------------------------------------------------- events ---

  private onClick = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement | null)?.closest('[data-act]') as HTMLElement | null;
    if (!target) return;
    const act = target.dataset.act;
    if (!act) return;

    if (this.drag?.moved) return;

    switch (act) {
      case 'start-run':
        this.startRun();
        break;
      case 'new-run':
        this.screen = 'title';
        this.run = null;
        this.combat = null;
        this.render();
        break;
      case 'node':
        this.chooseNode(target.dataset.node ?? '');
        break;
      case 'open-loadout':
        this.screen = 'loadout';
        this.render();
        break;
      case 'back-to-map':
        this.screen = 'map';
        this.selected = null;
        this.render();
        break;
      case 'begin-combat':
        this.beginCombat();
        break;
      case 'select-item':
        this.selected = target.dataset.id ?? null;
        this.render();
        break;
      case 'rotate-item':
        if (this.selected && this.run) {
          if (!this.run.inventory.rotate(this.selected)) this.note = 'No room to rotate there.';
          this.render();
        }
        break;
      case 'bench-item':
        if (this.selected && this.run) {
          this.run.inventory.unplace(this.selected);
          this.render();
        }
        break;
      case 'card':
        this.playCard(Number(target.dataset.index));
        break;
      case 'target-item':
      case 'target-enemy-item':
        this.playCardOnItem(target.dataset.id ?? '');
        break;
      case 'cancel-target':
        this.pendingCard = null;
        this.render();
        break;
      case 'end-turn':
        this.endTurn();
        break;
      case 'continue':
        this.finishCombat();
        break;
      case 'defeat-continue':
        this.run!.outcome = 'defeat';
        this.screen = 'summary';
        this.render();
        break;
      case 'pick-reward':
        this.pickReward(Number(target.dataset.index));
        break;
      case 'skip-reward':
        this.leaveReward();
        break;
      case 'buy-item':
        this.buy('item', Number(target.dataset.index));
        break;
      case 'buy-card':
        this.buy('card', Number(target.dataset.index));
        break;
      case 'buy-heal':
        this.buyHeal();
        break;
      case 'buy-remove':
        this.removeMode = true;
        this.render();
        break;
      case 'cancel-remove':
        this.removeMode = false;
        this.render();
        break;
      case 'shop-remove':
        this.removeCard(Number(target.dataset.index), this.shop!.removePrice, 'shop');
        break;
      case 'rest-remove':
        this.removeCard(Number(target.dataset.index), 0, 'rest');
        break;
      case 'leave-shop':
        this.removeMode = false;
        this.screen = 'map';
        this.render();
        break;
      case 'rest-heal': {
        const run = this.run!;
        run.hp = Math.min(run.maxHp, run.hp + Math.round(run.maxHp * 0.3));
        this.screen = 'map';
        this.note = 'You rest by the hearth.';
        this.render();
        break;
      }
      case 'leave-rest':
        this.removeMode = false;
        this.screen = 'map';
        this.render();
        break;
      case 'dismiss-note':
        this.note = null;
        this.render();
        break;
      default:
        break;
    }
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key.toLowerCase() !== 'r') return;
    if (this.screen !== 'loadout' || !this.run) return;
    const id = this.drag?.id ?? this.selected;
    if (!id) return;
    if (!this.run.inventory.rotate(id)) this.note = 'No room to rotate there.';
    this.render();
  };

  // ------------------------------------------------------------ drag & drop ---

  private onPointerDown = (event: PointerEvent): void => {
    if (this.screen !== 'loadout') return;
    const tile = (event.target as HTMLElement | null)?.closest('[data-drag]') as HTMLElement | null;
    if (!tile) return;
    const id = tile.dataset.drag;
    if (!id) return;
    this.drag = { id, startX: event.clientX, startY: event.clientY, moved: false };
    this.selected = id;
  };

  private onPointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || !this.run) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      const source = this.root.querySelector(`[data-drag="${drag.id}"]`) as HTMLElement | null;
      if (source) {
        const ghost = source.cloneNode(true) as HTMLElement;
        ghost.classList.add('drag-ghost');
        ghost.style.width = `${source.offsetWidth}px`;
        ghost.style.height = `${source.offsetHeight}px`;
        document.body.appendChild(ghost);
        this.ghost = ghost;
        source.classList.add('tile-lifted');
      }
    }
    if (this.ghost) {
      this.ghost.style.left = `${event.clientX}px`;
      this.ghost.style.top = `${event.clientY}px`;
    }
  };

  private onPointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    this.drag = null;
    if (!drag || !drag.moved) {
      if (!drag) return;
      this.render();
      return;
    }
    if (this.ghost) {
      this.ghost.remove();
      this.ghost = null;
    }
    const run = this.run;
    if (!run) return;
    const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
    const cell = element?.closest('[data-cell]') as HTMLElement | null;
    if (cell?.dataset.cell) {
      const [x, y] = cell.dataset.cell.split(',').map(Number);
      const item = run.inventory.byId(drag.id);
      if (item) {
        const ok = item.pos ? run.inventory.move(drag.id, [x, y], item.rotated) : run.inventory.place(drag.id, [x, y], item.rotated);
        if (!ok) this.note = `${getItem(item.defId).name} does not fit there.`;
      }
    }
    this.render();
  };

  // ---------------------------------------------------------------- actions ---

  private get reachedMap(): boolean {
    return this.run !== null && this.run.visited.length > 1;
  }

  private startRun(): void {
    const run = newRun(randomSeed());
    this.run = run;
    this.node = NODE_BY_ID['start'] ?? null;
    this.note = null;
    this.selected = null;
    this.screen = 'loadout';
    this.render();
  }

  private chooseNode(nodeId: string): void {
    const run = this.run!;
    const node = enterNode(run, nodeId);
    this.node = node;
    this.removeMode = false;
    this.selected = null;
    this.note = null;
    switch (node.type) {
      case 'combat':
      case 'elite':
      case 'boss':
        this.screen = 'loadout';
        break;
      case 'merchant':
        this.shop = rollShop(run.seed + run.floor * 53 + 7);
        this.screen = 'merchant';
        break;
      case 'rest':
        this.screen = 'rest';
        break;
      case 'treasure':
        this.rewardOptions = rollRewards(run, run.seed + run.floor * 131, 2, 'items');
        this.rewardGold = goldForNode(run, node, run.seed);
        run.gold += this.rewardGold;
        this.rewardTitle = 'Sealed Vault';
        this.screen = 'treasure';
        break;
    }
    this.render();
  }

  private beginCombat(): void {
    const run = this.run!;
    const node = this.node ?? NODE_BY_ID['start'];
    const enemy = enemyForNode(run, node, run.floor + 1);
    this.combat = buildCombat(run, enemy, run.floor + 1);
    this.pendingCard = null;
    this.fxPlayed = 0;
    this.outcomeShown = false;
    this.outcomePending = false;
    this.note = null;
    this.screen = 'combat';
    this.render();
  }

  private playCard(index: number): void {
    const combat = this.combat;
    if (!combat) return;
    const cardId = combat.hand[index];
    if (!cardId) return;
    const card = getCard(cardId);
    // Choosing a card always cancels a pending item target, so a hand that
    // shrinks under us can never leave a dangling index behind.
    this.pendingCard = null;
    if (!combat.canPlay(index)) {
      this.note = combat.player.energy < card.cost ? 'Not enough energy.' : 'That card has no legal target.';
      this.render();
      return;
    }
    if (card.needsItem || card.needsEnemyItem) {
      this.pendingCard = index;
      this.render();
      return;
    }
    combat.playCard(index);
    this.render();
  }

  private playCardOnItem(itemId: string): void {
    const combat = this.combat;
    const pending = this.pendingCardDef();
    if (!combat || !pending) {
      this.pendingCard = null;
      this.render();
      return;
    }
    const ok = combat.playCard(pending.index, itemId);
    if (!ok) this.note = 'That item cannot be targeted right now.';
    this.pendingCard = null;
    this.render();
  }

  private endTurn(): void {
    const combat = this.combat;
    if (!combat) return;
    this.pendingCard = null;
    combat.endTurn();
    this.render();
  }

  private finishCombat(): void {
    const combat = this.combat;
    const run = this.run!;
    const node = this.node;
    if (!combat || !node) return;
    run.hp = combat.player.hp;
    if (combat.outcome !== 'victory') {
      run.outcome = 'defeat';
      this.screen = 'summary';
      this.render();
      return;
    }
    if (node.type === 'boss') {
      run.outcome = 'victory';
      this.screen = 'summary';
      this.combat = null;
      this.render();
      return;
    }
    const gold = goldForNode(run, node, run.seed);
    run.gold += gold;
    this.rewardGold = gold;
    this.rewardOptions = rollRewards(run, run.seed + run.floor * 197 + run.gold, 3);
    this.rewardTitle = node.type === 'elite' ? 'Elite spoils' : 'Spoils';
    if (node.type === 'elite') {
      const relic = relicReward(run, run.seed + run.floor * 71);
      if (relic) {
        run.relics.push(relic);
        this.note = `${getRelic(relic).icon} ${getRelic(relic).name} claimed.`;
      }
    }
    this.screen = 'reward';
    this.render();
  }

  private pickReward(index: number): void {
    const run = this.run!;
    const option = this.rewardOptions[index];
    if (!option) return;
    if (option.kind === 'card') {
      run.deck.push(option.id);
      this.note = `${getCard(option.id).name} added to your deck.`;
    } else {
      const where = addItemToRun(run, option.id);
      this.note =
        where === 'placed'
          ? `${getItem(option.id).name} placed in your inventory.`
          : `${getItem(option.id).name} went to the bench — arrange it on the grid to use it.`;
    }
    this.leaveReward();
  }

  private leaveReward(): void {
    this.rewardOptions = [];
    this.rewardGold = 0;
    this.screen = 'map';
    this.render();
  }

  private buy(kind: 'item' | 'card', index: number): void {
    const run = this.run!;
    const shop = this.shop!;
    const entry = kind === 'item' ? shop.items[index] : shop.cards[index];
    if (!entry || entry.sold || run.gold < entry.price) return;
    run.gold -= entry.price;
    entry.sold = true;
    if (kind === 'item') {
      const where = addItemToRun(run, entry.id);
      this.note =
        where === 'placed'
          ? `${getItem(entry.id).name} placed in your inventory.`
          : `${getItem(entry.id).name} went to the bench.`;
    } else {
      run.deck.push(entry.id);
      this.note = `${getCard(entry.id).name} added to your deck.`;
    }
    this.render();
  }

  private buyHeal(): void {
    const run = this.run!;
    const shop = this.shop!;
    if (run.gold < shop.healPrice || run.hp >= run.maxHp) return;
    run.gold -= shop.healPrice;
    run.hp = Math.min(run.maxHp, run.hp + shop.healAmount);
    this.note = `Healed ${shop.healAmount} HP.`;
    this.render();
  }

  private removeCard(index: number, price: number, mode: 'shop' | 'rest'): void {
    const run = this.run!;
    if (run.gold < price) return;
    const removed = run.deck[index];
    run.deck.splice(index, 1);
    if (mode === 'shop') {
      run.gold -= price;
      this.removeMode = false;
      this.screen = 'merchant';
    } else {
      this.removeMode = false;
      this.screen = 'map';
    }
    this.note = `${getCard(removed).name} removed from your deck.`;
    this.render();
  }
}

// ------------------------------------------------------------------ format ---

function statusChips(statuses: { burning: number; vulnerable: number }): Html {
  return html`
    ${statuses.burning > 0 ? html`<span class="status-chip burning" title="Burning: takes damage at the end of the beat, then decays">🔥 ${statuses.burning}</span>` : ''}
    ${statuses.vulnerable > 0 ? html`<span class="status-chip vulnerable" title="Vulnerable: takes 50% more damage">💢 ${statuses.vulnerable}</span>` : ''}
  `;
}

