import { EntityAllocator, entityIndex, type Entity } from "./entity.ts";
import { componentName, type ComponentType } from "./component.ts";
import { Archetype } from "./archetype.ts";
import { Query } from "./query.ts";
import { CommandBuffer } from "./commands.ts";
import { Lifetime } from "../kernel/index.ts";
import { EventBus } from "../kernel/index.ts";
import { DataChanged, type Change } from "../db/index.ts";
import { componentChange, componentSchema, entityCreated, entityDestroyed, ENTITY_SCHEMA } from "./changes.ts";
import { EntityScope } from "./scope.ts";

export class World {
  readonly entities = new EntityAllocator();
  readonly commands: CommandBuffer;
  /** 世界级事件总线：生命周期事件 + 游戏自定义事件共用一条 */
  readonly bus = new EventBus();
  /** 世界根生命周期：实体 / 组件 / 订阅都挂在它下面 */
  readonly lifetime = new Lifetime().activate();

  private archetypes: Archetype[] = [];
  private bySignature = new Map<bigint, Archetype>();
  private archOf: (Archetype | undefined)[] = [];
  private rowOf: number[] = [];
  private queryCache = new Map<string, Query<ComponentType<unknown>[]>>();
  private resources = new Map<string | symbol, unknown>();
  private entityLifetimes = new Map<Entity, Lifetime>();
  private componentLifetimes = new Map<Entity, Map<number, Lifetime>>();
  private version = 0;
  private disposed = false;
  private resetting = false;
  private scopes = new Set<EntityScope>();

  get isDisposed(): boolean { return this.disposed; }

  private assertActive(): void {
    if (this.disposed || this.resetting) throw new Error("World is disposed or resetting");
  }

  /** Internal ownership registration, including directly constructed EntityScopes. */
  trackScope(scope: EntityScope): () => void {
    this.assertActive();
    this.scopes.add(scope);
    return () => this.scopes.delete(scope);
  }
  /** 开启后，带 shape 的组件在 add 时会被 @gdd/db 校验（开发期用） */
  validateComponents = false;

  constructor() {
    this.commands = new CommandBuffer(this);
  }

  get archetypeVersion(): number {
    return this.version;
  }

  get allArchetypes(): readonly Archetype[] {
    return this.archetypes;
  }

  get entityCount(): number {
    return this.entities.size;
  }

  isAlive(e: Entity): boolean {
    return this.entities.isAlive(e);
  }

  /** 工具/调试用：列出实体上的全部组件（名字 + 值）。不是热路径。 */
  snapshot(e: Entity): { name: string; value: unknown }[] | null {
    if (!this.entities.isAlive(e)) return null;
    const idx = entityIndex(e);
    const arch = this.archOf[idx];
    if (!arch) return null;
    const values = arch.readRow(this.rowOf[idx]);
    return arch.types.map((type, i) => ({ name: componentName(type), value: values[i] }));
  }

  // ---------------------------------------------------------------- entities

  spawn(...types: ComponentType<unknown>[]): Entity {
    this.assertActive();
    const e = this.entities.create();
    const idx = entityIndex(e);
    const empty = this.getOrCreate([]);
    this.archOf[idx] = empty;
    this.rowOf[idx] = empty.push(e, []);
    this.entityLifetime(e).activate();
    for (const t of types) this.add(e, t);
    this.emitChange(entityCreated(e));
    return e;
  }

  despawn(e: Entity): boolean {
    const idx = entityIndex(e);
    const arch = this.archOf[idx];
    if (!arch || !this.entities.isAlive(e)) return false;
    const row = this.rowOf[idx];
    this.removeRow(arch, row);
    this.archOf[idx] = undefined;
    this.rowOf[idx] = -1;
    const destroyed = this.entities.destroy(e);
    if (destroyed) {
      this.disposeEntityLifetime(e);
      this.emitChange(entityDestroyed(e));
    }
    return destroyed;
  }

  // -------------------------------------------------------------- components

  has<T>(e: Entity, type: ComponentType<T>): boolean {
    const arch = this.archOf[entityIndex(e)];
    return this.entities.isAlive(e) && arch !== undefined && arch.has(type.id);
  }

  get<T>(e: Entity, type: ComponentType<T>): T | undefined {
    const idx = entityIndex(e);
    const arch = this.archOf[idx];
    if (!arch || !this.entities.isAlive(e)) return undefined;
    const col = arch.indexOf(type.id);
    if (col < 0) return undefined;
    return arch.columns[col][this.rowOf[idx]] as T;
  }

  require<T>(e: Entity, type: ComponentType<T>): T {
    const v = this.get(e, type);
    if (v === undefined) throw new Error(`entity ${e} 缺少组件 ${type.name}`);
    return v;
  }

  set<T>(e: Entity, type: ComponentType<T>, value: T): void {
    const idx = entityIndex(e);
    const arch = this.archOf[idx];
    if (!arch || !this.entities.isAlive(e)) throw new Error(`entity ${e} 已销毁`);
    const col = arch.indexOf(type.id);
    if (col < 0) throw new Error(`entity ${e} 缺少组件 ${type.name}`);
    const row = this.rowOf[idx];
    const before = arch.columns[col][row];
    arch.columns[col][row] = value;
    this.emitChange({ schema: componentSchema(type), type: "update", key: e, before, after: value });
  }

  add<T>(e: Entity, type: ComponentType<T>, value?: Partial<T> | T): void {
    const idx = entityIndex(e);
    const arch = this.archOf[idx];
    if (!arch || !this.entities.isAlive(e)) throw new Error(`entity ${e} 已销毁`);

    const col = arch.indexOf(type.id);
    if (col >= 0) {
      const row = this.rowOf[idx];
      const before = arch.columns[col][row];
      arch.columns[col][row] = this.checked(type, value);
      this.emitChange({ schema: componentSchema(type), type: "update", key: e, before, after: arch.columns[col][row] });
      return;
    }

    const row = this.rowOf[idx];
    const values = arch.readRow(row);
    const types = [...arch.types, type as ComponentType<unknown>];
    const target = this.getOrCreate(types);
    const targetValues = target.types.map((t) =>
      t.id === type.id ? this.checked(type, value) : values[arch.indexOf(t.id)],
    );

    this.removeRow(arch, row);
    const newRow = target.push(e, targetValues);
    this.archOf[idx] = target;
    this.rowOf[idx] = newRow;
    this.componentLifetime(e, type).activate();
    this.emitChange(componentChange(type, "create", e, targetValues[target.indexOf(type.id)]));
  }

  remove<T>(e: Entity, type: ComponentType<T>): void {
    const idx = entityIndex(e);
    const arch = this.archOf[idx];
    if (!arch || !this.entities.isAlive(e)) return;
    const col = arch.indexOf(type.id);
    if (col < 0) return;

    const row = this.rowOf[idx];
    const values = arch.readRow(row);
    const removed = values[col];
    const types = arch.types.filter((t) => t.id !== type.id);
    const target = this.getOrCreate(types);
    const targetValues = target.types.map((t) => values[arch.indexOf(t.id)]);

    this.removeRow(arch, row);
    const newRow = target.push(e, targetValues);
    this.archOf[idx] = target;
    this.rowOf[idx] = newRow;
    this.disposeComponentLifetime(e, type.id);
    this.emitChange(componentChange(type, "delete", e, removed));
  }

  // ------------------------------------------------------------------ query

  query<T extends ComponentType<unknown>[]>(...types: T): Query<T> {
    const key = "q|" + types.map((t) => t.id).join(",");
    let q = this.queryCache.get(key);
    if (!q) {
      q = new Query(this, types);
      this.queryCache.set(key, q);
    }
    return q as unknown as Query<T>;
  }

  queryExcluding<T extends ComponentType<unknown>[]>(excluded: ComponentType<unknown>[], ...types: T): Query<T> {
    const ex = excluded.map((t) => t.id).sort((a, b) => a - b);
    const key = "x|" + ex.join(",") + "|" + types.map((t) => t.id).join(",");
    let q = this.queryCache.get(key);
    if (!q) {
      q = new Query(this, types, excluded);
      this.queryCache.set(key, q);
    }
    return q as unknown as Query<T>;
  }

  // -------------------------------------------------------------- resources

  setResource<T>(key: string | symbol, value: T): T {
    this.assertActive();
    this.resources.set(key, value);
    return value;
  }

  resource<T>(key: string | symbol): T {
    const v = this.resources.get(key);
    if (v === undefined) throw new Error(`未注册 resource: ${String(key)}`);
    return v as T;
  }

  tryResource<T>(key: string | symbol): T | undefined {
    return this.resources.get(key) as T | undefined;
  }

  // ------------------------------------------------------------------ hooks

  /** 组件出现：过滤统一变更通道得到，不是另一套机制 */
  onAdd<T>(type: ComponentType<T>, fn: (e: Entity, value: T) => void): () => void {
    this.assertActive();
    const schema = componentSchema(type);
    return this.bus.on(DataChanged, (change) => {
      if (change.schema !== schema || change.type !== "create") return;
      fn(change.key as Entity, change.after as T);
    });
  }

  /** 组件移除：同样来自统一变更通道 */
  onRemove<T>(type: ComponentType<T>, fn: (e: Entity, value: T) => void): () => void {
    this.assertActive();
    const schema = componentSchema(type);
    return this.bus.on(DataChanged, (change) => {
      if (change.schema !== schema || change.type !== "delete") return;
      fn(change.key as Entity, change.before as T);
    });
  }

  /** 实体创建/销毁订阅（同一条通道） */
  onEntity(fn: (change: { type: "create" | "delete"; entity: Entity }) => void): () => void {
    this.assertActive();
    return this.bus.on(DataChanged, (change) => {
      if (change.schema !== ENTITY_SCHEMA) return;
      fn({ type: change.type === "delete" ? "delete" : "create", entity: change.key as Entity });
    });
  }

  private emitChange(change: Change): void {
    if (this.bus.hasListeners(DataChanged)) this.bus.emit(DataChanged, change);
  }

  /** 创建一个实体分组（房间/关卡/场景用它管理生命周期） */
  createScope(parent?: Lifetime): EntityScope {
    this.assertActive();
    return new EntityScope(this, parent);
  }

  /** 实体生命周期：随实体销毁级联 */
  entityLifetime(e: Entity): Lifetime {
    this.assertActive();
    if (!this.entities.isAlive(e)) throw new Error(`entity ${e} 已销毁`);
    const existing = this.entityLifetimes.get(e);
    if (existing) return existing;
    const life = this.lifetime.fork();
    this.entityLifetimes.set(e, life);
    return life;
  }

  /** 某个组件的作用域：组件被移除或实体销毁时级联 */
  componentLifetime<T>(e: Entity, type: ComponentType<T>): Lifetime {
    this.assertActive();
    if (!this.has(e, type)) throw new Error(`entity ${e} 缺少组件 ${type.name}`);
    let map = this.componentLifetimes.get(e);
    if (!map) {
      map = new Map();
      this.componentLifetimes.set(e, map);
    }
    const existing = map.get(type.id);
    if (existing) return existing;
    const life = this.entityLifetime(e).fork();
    map.set(type.id, life);
    return life;
  }

  /** 销毁世界：级联销毁所有实体作用域和订阅 */
  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.lifetime.dispose();
    this.bus.clear();
    this.commands.clear();
  }

  // ---------------------------------------------------------------- internal

  private getOrCreate(types: ComponentType<unknown>[]): Archetype {
    const sorted = [...types].sort((a, b) => a.id - b.id);
    let sig = 0n;
    for (const t of sorted) sig |= 1n << BigInt(t.id);
    const existing = this.bySignature.get(sig);
    if (existing) return existing;
    const arch = new Archetype(sorted);
    this.bySignature.set(sig, arch);
    this.archetypes.push(arch);
    this.version++;
    return arch;
  }

  private disposeEntityLifetime(e: Entity): void {
    const life = this.entityLifetimes.get(e);
    this.entityLifetimes.delete(e);
    this.componentLifetimes.delete(e);
    life?.dispose();
  }

  private disposeComponentLifetime(e: Entity, typeId: number): void {
    const map = this.componentLifetimes.get(e);
    const life = map?.get(typeId);
    if (!life) return;
    map?.delete(typeId);
    life.dispose();
  }

  private checked<T>(type: ComponentType<T>, value?: Partial<T> | T): T {
    const coerced = coerce(type, value);
    if (!this.validateComponents || !type.shape) return coerced;
    return type.shape.parse(coerced) as T;
  }

  private removeRow(arch: Archetype, row: number): void {
    const moved = arch.swapRemove(row);
    if (moved !== undefined) {
      const mi = entityIndex(moved);
      this.archOf[mi] = arch;
      this.rowOf[mi] = row;
    }
  }

  /** Reusable reset: clears all data, scopes, subscriptions and queued work. */
  clear(): void {
    this.assertActive();
    this.resetting = true;
    try {
      // Stop callbacks observing half-reset state; scope cleanup still destroys members.
      this.bus.clear();
      this.commands.clear();
      for (const scope of [...this.scopes]) scope.dispose();
      this.scopes.clear();
      for (const e of [...this.entityLifetimes.keys()]) this.disposeEntityLifetime(e);
      this.componentLifetimes.clear();
      this.archetypes = [];
      this.bySignature.clear();
      this.archOf = [];
      this.rowOf = [];
      this.queryCache.clear();
      this.resources.clear();
      this.entities.clear();
      this.version++;
    } finally {
      this.bus.clear();
      this.commands.clear();
      this.resetting = false;
    }
  }
}

function coerce<T>(type: ComponentType<T>, value?: Partial<T> | T): T {
  if (value === undefined) return type.create();
  if (typeof value === "object" && value !== null) return Object.assign(type.create() as object, value) as T;
  return value as T;
}