import type { ComponentType } from "./component.ts";
import type { Entity } from "./entity.ts";
import type { World } from "./world.ts";

type Op = () => void;

/**
 * 延迟结构变更：在系统遍历过程中改 archetype 会让迭代失效，
 * 所以 add/remove/despawn 先入队，统一在帧末 flush。
 */
export class CommandBuffer {
  private world: World;
  private ops: Op[] = [];

  constructor(world: World) {
    this.world = world;
  }

  get pending(): number {
    return this.ops.length;
  }

  add<T>(e: Entity, type: ComponentType<T>, value?: Partial<T> | T): this {
    this.ops.push(() => this.world.add(e, type, value));
    return this;
  }

  remove<T>(e: Entity, type: ComponentType<T>): this {
    this.ops.push(() => this.world.remove(e, type));
    return this;
  }

  despawn(e: Entity): this {
    this.ops.push(() => this.world.despawn(e));
    return this;
  }

  run(fn: () => void): this {
    this.ops.push(fn);
    return this;
  }

  flush(): number {
    const ops = this.ops;
    this.ops = [];
    for (const op of ops) op();
    return ops.length;
  }

  clear(): void {
    this.ops = [];
  }
}
