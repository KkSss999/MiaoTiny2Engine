import { defineEvent, type EventBus } from "../kernel/index.ts";
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
 * Notification channel for explicit CRUD/ECS structural changes; no tracking of in-place ECS hot-path writes.
 * DB row and ECS entity/component changes use the same Change record.
 * Subscribers filter by schema name ("weapons" / "component/Position" / "ecs/entity").
 */
export const DataChanged = defineEvent<Change>("db:DataChanged");

/** Legacy name compatibility. */
export const StoreChanged = DataChanged;

/**
 * DB writes pass through CRUD. Reads and notifications return detached structured-cloneable values.
 * Indexes update before observers. Observer failures are reported after the change commits.
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
    const row = structuredClone(this.schema.create(input));
    const key = this.keyOf(row);
    if (this.rowsMap.has(key)) {
      throw new ValidationError(this.name, [{ path: this.keyName, message: `Duplicate primary key: ${String(key)}` }]);
    }
    this.rowsMap.set(key, row);
    this.notify({ schema: this.name, type: "create", key, after: row });
    return structuredClone(row);
  }

  get(key: Key): ObjectValue<S> | undefined {
    const row = this.rowsMap.get(key);
    return row === undefined ? undefined : structuredClone(row);
  }

  require(key: Key): ObjectValue<S> {
    const row = this.rowsMap.get(key);
    if (!row) throw new ValidationError(this.name, [{ path: this.keyName, message: `Cannot find ${String(key)}` }]);
    return structuredClone(row);
  }

  has(key: Key): boolean {
    return this.rowsMap.has(key);
  }

  update(key: Key, patch: Partial<ObjectValue<S>>): ObjectValue<S> {
    const before = this.rowsMap.get(key);
    if (!before) throw new ValidationError(this.name, [{ path: this.keyName, message: `Cannot find ${String(key)}` }]);
    const merged = { ...(before as Record<string, unknown>), ...(patch as Record<string, unknown>) };
    const after = structuredClone(this.schema.parse(merged));
    if (this.keyOf(after) !== key) {
      throw new ValidationError(this.name, [{ path: this.keyName, message: "Cannot modify the primary key" }]);
    }
    this.rowsMap.set(key, after);
    this.notify({ schema: this.name, type: "update", key, before, after });
    return structuredClone(after);
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
    return structuredClone([...this.rowsMap.values()]);
  }

  query(predicate: (row: ObjectValue<S>) => boolean): ObjectValue<S>[] {
    const out: ObjectValue<S>[] = [];
    for (const row of this.rowsMap.values()) {
      const copy = structuredClone(row);
      if (predicate(copy)) out.push(copy);
    }
    return out;
  }

  /** Subscribe to changes; copy-on-write makes subscription changes safe during iteration. */
  onChange(fn: (change: Change<ObjectValue<S>>) => void): () => void {
    const next = [...this.listeners, fn];
    this.listeners = next;
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn);
    };
  }

  /** Forward changes to the event bus, integrating DB with Event. */
  bind(bus: EventBus): () => void {
    return this.onChange((change) => {
      bus.emit(StoreChanged, change as Change);
    });
  }

  /** Internal row access for subclasses, used by Table index maintenance. */
  protected rows(): Iterable<[Key, ObjectValue<S>]> {
    return this.rowsMap.entries();
  }

  protected keyOf(row: ObjectValue<S>): Key {
    const key = (row as Record<string, unknown>)[this.keyName];
    if (typeof key !== "string" && !(typeof key === "number" && Number.isFinite(key))) {
      throw new ValidationError(this.name, [{ path: this.keyName, message: "Primary key must be a string or finite number" }]);
    }
    return key as Key;
  }

  /** Stage validation without touching live rows. Database commits all stages before publishing. */
  prepareReplacement(inputs: unknown[]): { commit(): void; publish(): void } {
    const next = new Map<Key, ObjectValue<S>>();
    for (const input of inputs) {
      const row = structuredClone(this.schema.parse(input));
      const key = this.keyOf(row);
      if (next.has(key)) throw new ValidationError(this.name, [{ path: this.keyName, message: `Duplicate primary key: ${String(key)}` }]);
      next.set(key, row);
    }
    const changes: Change<ObjectValue<S>>[] = [];
    for (const [key, before] of this.rowsMap) changes.push({ schema: this.name, type: "delete", key, before });
    for (const [key, after] of next) changes.push({ schema: this.name, type: "create", key, after });
    let committed = false;
    let published = false;
    return {
      commit: () => {
        if (committed) throw new Error("Replacement already committed");
        this.rowsMap = next;
        this.rebuildIndexes();
        committed = true;
      },
      publish: () => {
        if (!committed || published) throw new Error("Replacement is not pending publication");
        published = true;
        const errors: unknown[] = [];
        for (const change of changes) {
          try { this.notify(change, false); } catch (error) { errors.push(error); }
        }
        if (errors.length) throw new AggregateError(errors, "Replacement committed; change listeners failed");
      },
    };
  }

  protected rebuildIndexes(): void {}
  protected applyChange(_change: Change<ObjectValue<S>>): void {}

  private notify(change: Change<ObjectValue<S>>, updateIndexes = true): void {
    if (updateIndexes) this.applyChange(change);
    const errors: unknown[] = [];
    for (const fn of this.listeners) {
      try { fn(structuredClone(change)); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "Change committed; listeners failed");
  }
}
