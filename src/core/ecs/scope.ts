import type { Lifetime } from "../kernel/index.ts";
import { DataChanged } from "../db/index.ts";
import { ENTITY_SCHEMA } from "./changes.ts";
import type { ComponentType } from "./component.ts";
import type { Entity } from "./entity.ts";
import type { World } from "./world.ts";

/**
 * Entity group sharing one lifetime.
 *
 * Shared primitive underlying rooms, levels and scenes:
 * declare membership once, without enumerating entity types during destruction.
 * The scope is a Lifetime and is disposed when its parent is disposed.
 */
export class EntityScope {
  readonly lifetime: Lifetime;
  private world: World;
  private members = new Set<Entity>();
  private detach: () => void;

  constructor(world: World, parent?: Lifetime) {
    const untrack = world.trackScope(this);
    this.world = world;
    this.lifetime = (parent ?? world.lifetime).fork();
    // Remove individually destroyed entities through the shared change channel.
    this.detach = world.bus.on(DataChanged, (change) => {
      if (change.schema === ENTITY_SCHEMA && change.type === "delete") this.members.delete(change.key as Entity);
    });
    // Clear group entities/resources when disposed directly or by the parent.
    this.lifetime.onDispose(() => {
      untrack();
      this.detach();
      this.killMembers();
    });
  }

  get isDisposed(): boolean {
    return this.lifetime.disposed;
  }

  get size(): number {
    return this.members.size;
  }

  spawn(...types: ComponentType<unknown>[]): Entity {
    if (this.lifetime.disposed) throw new Error("EntityScope is disposed; cannot spawn");
    const e = this.world.spawn(...types);
    try {
      return this.adopt(e);
    } catch (error) {
      // A synchronous creation listener may dispose this scope or destroy/reset e.
      // Do not retain dead membership or leak an entity created for a dead scope.
      if (this.world.isAlive(e)) this.world.despawn(e);
      throw error;
    }
  }

  /** Adopt externally created entities, such as effects. */
  adopt(e: Entity): Entity {
    if (this.lifetime.disposed) throw new Error("EntityScope is disposed; cannot adopt entities");
    if (!this.world.isAlive(e)) throw new Error("Cannot adopt a stale entity");
    if (this.members.has(e)) return e;
    const life = this.world.entityLifetime(e);
    if (life.disposed) throw new Error("Cannot adopt an entity with a disposed lifetime");
    this.members.add(e);
    life.onDispose(() => this.members.delete(e));
    return e;
  }

  has(e: Entity): boolean {
    return this.members.has(e);
  }

  dispose(): void {
    this.lifetime.dispose();
  }

  private killMembers(): void {
    const list = [...this.members];
    this.members.clear();
    const errors: unknown[] = [];
    for (const e of list) {
      try { this.world.despawn(e); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "EntityScope cleanup failed");
  }
}
