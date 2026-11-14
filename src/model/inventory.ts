import { getItem } from '../data/items';

export interface OwnedItem {
  id: string;
  defId: string;
  rotated: boolean;
  /** Top-left cell, or null when the item sits on the bench (not placed). */
  pos: [number, number] | null;
}

export type Cell = [number, number];

/**
 * Pure inventory model: knows where items sit and whether a placement is legal.
 * It has no idea how the grid is drawn (blueprint section 9.1).
 */
export class Inventory {
  readonly cols: number;
  readonly rows: number;
  items: OwnedItem[] = [];
  private nextId = 1;

  constructor(cols = 4, rows = 3) {
    this.cols = cols;
    this.rows = rows;
  }

  sizeOf(item: OwnedItem): [number, number] {
    const [w, h] = getItem(item.defId).size;
    return item.rotated ? [h, w] : [w, h];
  }

  cellsOf(item: OwnedItem): Cell[] {
    if (!item.pos) return [];
    const [w, h] = this.sizeOf(item);
    const cells: Cell[] = [];
    for (let y = item.pos[1]; y < item.pos[1] + h; y++) {
      for (let x = item.pos[0]; x < item.pos[0] + w; x++) cells.push([x, y]);
    }
    return cells;
  }

  placed(): OwnedItem[] {
    return this.items.filter((item) => item.pos !== null);
  }

  bench(): OwnedItem[] {
    return this.items.filter((item) => item.pos === null);
  }

  byId(id: string): OwnedItem | undefined {
    return this.items.find((item) => item.id === id);
  }

  findAt(x: number, y: number): OwnedItem | undefined {
    return this.placed().find((item) => this.cellsOf(item).some(([cx, cy]) => cx === x && cy === y));
  }

  occupiedCells(ignoreId?: string): Set<string> {
    const occupied = new Set<string>();
    for (const item of this.placed()) {
      if (item.id === ignoreId) continue;
      for (const [x, y] of this.cellsOf(item)) occupied.add(`${x},${y}`);
    }
    return occupied;
  }

  canPlace(defId: string, pos: Cell, rotated: boolean, ignoreId?: string): boolean {
    const [baseW, baseH] = getItem(defId).size;
    const [w, h] = rotated ? [baseH, baseW] : [baseW, baseH];
    const [x, y] = pos;
    if (x < 0 || y < 0 || x + w > this.cols || y + h > this.rows) return false;
    const occupied = this.occupiedCells(ignoreId);
    for (let cy = y; cy < y + h; cy++) {
      for (let cx = x; cx < x + w; cx++) {
        if (occupied.has(`${cx},${cy}`)) return false;
      }
    }
    return true;
  }

  /** Adds a new owned item. Pass a position to place it, or leave it on the bench. */
  add(defId: string, pos: Cell | null = null, rotated = false): OwnedItem {
    const item: OwnedItem = { id: `item_${this.nextId++}`, defId, rotated, pos: null };
    this.items.push(item);
    if (pos) this.place(item.id, pos, rotated);
    return item;
  }

  place(id: string, pos: Cell, rotated = false): boolean {
    const item = this.byId(id);
    if (!item) return false;
    if (!this.canPlace(item.defId, pos, rotated, item.id)) return false;
    item.pos = pos;
    item.rotated = rotated;
    return true;
  }

  /**
   * Moves an item. Dropping onto another item swaps the two when both fit;
   * the moving item is temporarily lifted so it can be dropped on itself.
   */
  move(id: string, pos: Cell, rotated: boolean): boolean {
    const item = this.byId(id);
    if (!item) return false;
    const target = this.findAt(pos[0], pos[1]);
    if (target && target.id !== id) return this.swap(id, target.id);
    if (!this.canPlace(item.defId, pos, rotated, item.id)) return false;
    item.pos = pos;
    item.rotated = rotated;
    return true;
  }

  swap(firstId: string, secondId: string): boolean {
    const a = this.byId(firstId);
    const b = this.byId(secondId);
    if (!a || !b || !a.pos || !b.pos) return false;
    const aPos = a.pos;
    const aRot = a.rotated;
    const bPos = b.pos;
    const bRot = b.rotated;
    a.pos = null;
    b.pos = null;
    const placedA = this.place(a.id, bPos, aRot);
    const placedB = placedA ? this.place(b.id, aPos, bRot) : false;
    if (!placedA || !placedB) {
      a.pos = null;
      b.pos = null;
      b.pos = bPos;
      b.rotated = bRot;
      a.pos = aPos;
      a.rotated = aRot;
      return false;
    }
    return true;
  }

  unplace(id: string): void {
    const item = this.byId(id);
    if (item) item.pos = null;
  }

  /**
   * Rotates an item, keeping its shape (a 1x2 becomes 2x1, a 2x2 stays 2x2).
   * If the rotated shape does not fit where the item sits — a neighbour occupies
   * the cells it needs — the item nudges to the nearest legal cell instead of
   * silently refusing, which is what made rotate look broken.
   */
  rotate(id: string): boolean {
    const item = this.byId(id);
    if (!item) return false;
    const rotated = !item.rotated;
    if (!item.pos) {
      item.rotated = rotated;
      return true;
    }
    for (const pos of this.spotsNearestFirst(item.pos)) {
      if (this.canPlace(item.defId, pos, rotated, item.id)) {
        item.pos = pos;
        item.rotated = rotated;
        return true;
      }
    }
    return false;
  }

  /** Every board position, ordered by distance from `origin` (closest first). */
  private spotsNearestFirst(origin: Cell): Cell[] {
    const spots: { pos: Cell; distance: number }[] = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        spots.push({ pos: [x, y], distance: Math.abs(x - origin[0]) + Math.abs(y - origin[1]) });
      }
    }
    spots.sort((a, b) => a.distance - b.distance || a.pos[1] - b.pos[1] || a.pos[0] - b.pos[0]);
    return spots.map((spot) => spot.pos);
  }

  freeCells(): number {
    return this.cols * this.rows - this.placed().reduce((sum, item) => sum + this.cellsOf(item).length, 0);
  }

  /** First legal spot for a definition, used when a reward is auto-placed. */
  firstFit(defId: string): { pos: Cell; rotated: boolean } | null {
    for (const rotated of [false, true]) {
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.cols; x++) {
          if (this.canPlace(defId, [x, y], rotated)) return { pos: [x, y], rotated };
        }
      }
    }
    return null;
  }

  /** Items sharing an edge (diagonal contact does not count). */
  neighbours(id: string): OwnedItem[] {
    const item = this.byId(id);
    if (!item || !item.pos) return [];
    const own = new Set(this.cellsOf(item).map(([x, y]) => `${x},${y}`));
    const result: OwnedItem[] = [];
    for (const other of this.placed()) {
      if (other.id === id) continue;
      const touches = this.cellsOf(other).some(([x, y]) => {
        return (
          own.has(`${x + 1},${y}`) ||
          own.has(`${x - 1},${y}`) ||
          own.has(`${x},${y + 1}`) ||
          own.has(`${x},${y - 1}`)
        );
      });
      if (touches) result.push(other);
    }
    return result;
  }

  clone(): Inventory {
    const copy = new Inventory(this.cols, this.rows);
    copy.nextId = this.nextId;
    copy.items = this.items.map((item) => ({ ...item, pos: item.pos ? [item.pos[0], item.pos[1]] : null }));
    return copy;
  }
}
