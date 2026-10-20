import { defineSchema, type SchemaDef } from "./schemaDef.ts";
import { Store, type Change, type Key } from "./store.ts";
import type { ObjectValue, Shape } from "./schema.ts";

/**
 * Table = Store + 二级索引。
 * 索引不是自己维护的：订阅 CRUD 总线的变更，统一在 applyChange 里更新。
 */
export class Table<S extends Shape> extends Store<S> {
  private indexMap = new Map<string, Map<unknown, Set<Key>>>();

  constructor(name: string, shape: S) {
    super(defineSchema(name, shape));
    this.onChange((change) => this.applyChange(change));
  }

  // ---- 兼容旧 API 的别名 ----
  insert(row: unknown): ObjectValue<S> {
    return this.create(row);
  }

  remove(key: Key): boolean {
    return this.delete(key);
  }

  all(): ObjectValue<S>[] {
    return this.list();
  }

  where(predicate: (row: ObjectValue<S>) => boolean): ObjectValue<S>[] {
    return this.query(predicate);
  }

  validate(input: unknown): ObjectValue<S> {
    return this.schema.parse(input);
  }

  upsert(input: unknown): ObjectValue<S> {
    const row = this.schema.create(input);
    const key = this.keyOf(row);
    if (this.has(key)) return this.update(key, row);
    return this.create(row);
  }

  // ---- 二级索引 ----
  indexBy(field: string): this {
    if (field === this.keyName || this.indexMap.has(field)) return this;
    const index = new Map<unknown, Set<Key>>();
    this.indexMap.set(field, index);
    for (const [key, row] of this.rows()) {
      for (const value of valuesOf(row, field)) {
        let bucket = index.get(value);
        if (!bucket) {
          bucket = new Set();
          index.set(value, bucket);
        }
        bucket.add(key);
      }
    }
    return this;
  }

  find(field: string, value: unknown): ObjectValue<S>[] {
    const index = this.indexMap.get(field);
    if (!index) return this.query((row) => valuesOf(row, field).includes(value));
    const bucket = index.get(value);
    if (!bucket) return [];
    const out: ObjectValue<S>[] = [];
    for (const key of bucket) {
      const row = this.get(key);
      if (row) out.push(row);
    }
    return out;
  }

  private applyChange(change: Change<ObjectValue<S>>): void {
    if (this.indexMap.size === 0) return;
    if (change.type === "create") {
      if (change.after) this.addIndex(change.key, change.after);
      return;
    }
    if (change.type === "update") {
      if (change.before) this.dropIndex(change.key, change.before);
      if (change.after) this.addIndex(change.key, change.after);
      return;
    }
    if (change.before) this.dropIndex(change.key, change.before);
  }

  private addIndex(key: Key, row: ObjectValue<S>): void {
    for (const [field, index] of this.indexMap) {
      for (const value of valuesOf(row, field)) {
        let bucket = index.get(value);
        if (!bucket) {
          bucket = new Set();
          index.set(value, bucket);
        }
        bucket.add(key);
      }
    }
  }

  private dropIndex(key: Key, row: ObjectValue<S>): void {
    for (const [field, index] of this.indexMap) {
      for (const value of valuesOf(row, field)) {
        const bucket = index.get(value);
        if (!bucket) continue;
        bucket.delete(key);
        if (bucket.size === 0) index.delete(value);
      }
    }
  }
}

export function defineTable<S extends Shape>(name: string, shape: S): Table<S> {
  return new Table(name, shape);
}

function valuesOf(row: unknown, field: string): unknown[] {
  const value = (row as Record<string, unknown>)[field];
  if (Array.isArray(value)) return value;
  return [value];
}

export type { SchemaDef };
