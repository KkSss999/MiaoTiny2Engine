import { defineEvent, type EventBus } from "#core/kernel/index.ts";
import { ValidationError, type ObjectValue, type Shape } from "./schema.ts";
import type { SchemaDef } from "./schemaDef.ts";

export type Key = string | number;
export type ChangeType = "create" | "update" | "delete";

export type Change<T = unknown> = {
  schema: string;
  type: ChangeType;
  key: Key;
  before?: T;
  after?: T;
};

/**
 * 全栈唯一的数据变更通道。
 * DB 的行变更、ECS 的实体/组件变更，都是同一种 Change 记录。
 * 订阅方按 schema 名过滤（"weapons" / "component/Position" / "ecs/entity"）。
 */
export const DataChanged = defineEvent<Change>("db:DataChanged");

/** 兼容旧名字 */
export const StoreChanged = DataChanged;

/**
 * CRUD 总线：唯一的读写入口。
 * 每次变更都会广播 Change，索引、持久化、事件转发全部订阅它，而不是各自实现一遍。
 */
export class Store<S extends Shape> {
  readonly schema: SchemaDef<S>;
  private rowsMap = new Map<Key, ObjectValue<S>>();
  private listeners: ((change: Change<ObjectValue<S>>) => void)[] = [];

  constructor(schema: SchemaDef<S>) {
    this.schema = schema;
  }

  get name(): string {
    return this.schema.name;
  }

  get keyName(): string {
    return this.schema.key;
  }

  get size(): number {
    return this.rowsMap.size;
  }

  create(input: unknown): ObjectValue<S> {
    const row = this.schema.create(input);
    const key = this.keyOf(row);
    if (this.rowsMap.has(key)) {
      throw new ValidationError(this.name, [{ path: this.keyName, message: `主键重复：${String(key)}` }]);
    }
    this.rowsMap.set(key, row);
    this.notify({ schema: this.name, type: "create", key, after: row });
    return row;
  }

  get(key: Key): ObjectValue<S> | undefined {
    return this.rowsMap.get(key);
  }

  require(key: Key): ObjectValue<S> {
    const row = this.rowsMap.get(key);
    if (!row) throw new ValidationError(this.name, [{ path: this.keyName, message: `找不到 ${String(key)}` }]);
    return row;
  }

  has(key: Key): boolean {
    return this.rowsMap.has(key);
  }

  update(key: Key, patch: Partial<ObjectValue<S>>): ObjectValue<S> {
    const before = this.rowsMap.get(key);
    if (!before) throw new ValidationError(this.name, [{ path: this.keyName, message: `找不到 ${String(key)}` }]);
    const merged = { ...(before as Record<string, unknown>), ...(patch as Record<string, unknown>) };
    const after = this.schema.parse(merged);
    if (this.keyOf(after) !== key) {
      throw new ValidationError(this.name, [{ path: this.keyName, message: "不允许修改主键" }]);
    }
    this.rowsMap.set(key, after);
    this.notify({ schema: this.name, type: "update", key, before, after });
    return after;
  }

  delete(key: Key): boolean {
    const before = this.rowsMap.get(key);
    if (!before) return false;
    this.rowsMap.delete(key);
    this.notify({ schema: this.name, type: "delete", key, before });
    return true;
  }

  clear(): void {
    for (const key of [...this.rowsMap.keys()]) this.delete(key);
  }

  list(): ObjectValue<S>[] {
    return [...this.rowsMap.values()];
  }

  query(predicate: (row: ObjectValue<S>) => boolean): ObjectValue<S>[] {
    const out: ObjectValue<S>[] = [];
    for (const row of this.rowsMap.values()) if (predicate(row)) out.push(row);
    return out;
  }

  /** 订阅变更（copy-on-write，遍历中订阅/退订安全） */
  onChange(fn: (change: Change<ObjectValue<S>>) => void): () => void {
    const next = [...this.listeners, fn];
    this.listeners = next;
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn);
    };
  }

  /** 把变更转发到事件总线（DB 消费 Event 的方式） */
  bind(bus: EventBus): () => void {
    return this.onChange((change) => {
      bus.emit(StoreChanged, change as Change);
    });
  }

  /** 内部：给子类拿行（Table 索引维护用） */
  protected rows(): Iterable<[Key, ObjectValue<S>]> {
    return this.rowsMap.entries();
  }

  protected keyOf(row: ObjectValue<S>): Key {
    return (row as Record<string, unknown>)[this.keyName] as Key;
  }

  private notify(change: Change<ObjectValue<S>>): void {
    const list = this.listeners;
    for (const fn of list) fn(change);
  }
}
