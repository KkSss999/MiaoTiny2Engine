import type { Lifetime } from "../kernel/index.ts";
import { DataChanged } from "../db/index.ts";
import { ENTITY_SCHEMA } from "./changes.ts";
import type { ComponentType } from "./component.ts";
import type { Entity } from "./entity.ts";
import type { World } from "./world.ts";

/**
 * 实体分组：一组实体共享一个生命周期。
 *
 * 这是「房间」「关卡」「场景」这些上层概念共用的下层结构：
 * 上层只需要说明"这些实体属于这里"，销毁时不用再枚举它们的类型。
 * 作用域本身就是一个 Lifetime —— 父级销毁会级联把它也清掉。
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
    // 实体被单独销毁时从成员表剔除：走统一变更通道，不额外造机制
    this.detach = world.bus.on(DataChanged, (change) => {
      if (change.schema === ENTITY_SCHEMA && change.type === "delete") this.members.delete(change.key as Entity);
    });
    // 自己（或被父级）销毁时，清掉组内实体和资源
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
    if (this.lifetime.disposed) throw new Error("EntityScope 已销毁，不能再 spawn");
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

  /** 把外部创建的实体收进作用域（比如特效系统生成的） */
  adopt(e: Entity): Entity {
    if (this.lifetime.disposed) throw new Error("EntityScope 已销毁，不能再接纳实体");
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
