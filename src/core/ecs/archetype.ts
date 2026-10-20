import type { ComponentType } from "./component.ts";
import type { Entity } from "./entity.ts";

/**
 * 一组拥有完全相同组件集合的实体。
 * 列式存储：columns[i][row] 是第 i 个组件的值，row 与 entities[row] 对齐。
 */
export class Archetype {
  readonly types: ComponentType<unknown>[];
  readonly ids: number[];
  readonly signature: bigint;
  readonly entities: Entity[] = [];
  readonly columns: unknown[][];

  constructor(types: ComponentType<unknown>[]) {
    this.types = types;
    this.ids = types.map((t) => t.id);
    let sig = 0n;
    for (const id of this.ids) sig |= 1n << BigInt(id);
    this.signature = sig;
    this.columns = types.map(() => [] as unknown[]);
  }

  get size(): number {
    return this.entities.length;
  }

  indexOf(id: number): number {
    return this.ids.indexOf(id);
  }

  has(id: number): boolean {
    return (this.signature & (1n << BigInt(id))) !== 0n;
  }

  push(e: Entity, values: unknown[]): number {
    const row = this.entities.length;
    this.entities.push(e);
    for (let i = 0; i < this.columns.length; i++) this.columns[i].push(values[i]);
    return row;
  }

  readRow(row: number): unknown[] {
    return this.columns.map((c) => c[row]);
  }

  /** 把最后一行搬到 row 上，返回被搬动的实体（调用方负责更新它的 row 记录） */
  swapRemove(row: number): Entity | undefined {
    const last = this.entities.length - 1;
    const moved = row !== last ? this.entities[last] : undefined;
    if (row !== last) {
      this.entities[row] = this.entities[last];
      for (const col of this.columns) col[row] = col[last];
    }
    this.entities.pop();
    for (const col of this.columns) col.pop();
    return moved;
  }
}
