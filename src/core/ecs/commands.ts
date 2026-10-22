import type { ComponentType } from "./component.ts";
import type { Entity } from "./entity.ts";
import type { World } from "./world.ts";

type Op = () => void;

/**
 * Defer structural changes: changing archetypes during system iteration invalidates it,
 * so queue add/remove/despawn and flush them at frame end.
 */
export class CommandBuffer {
  private world: World;
  private ops: Op[] = [];
  private epoch = 0;
  private flushing = false;

  constructor(world: World) {
    this.world = world;
  }

  get pending(): number {
    return this.ops.length;
  }

  add<T>(e: Entity, type: ComponentType<T>, value?: Partial<T> | T): this {
    if (this.world.isDisposed) throw new Error("World is disposed");
    this.ops.push(() => this.world.add(e, type, value));
    return this;
  }

  remove<T>(e: Entity, type: ComponentType<T>): this {
    if (this.world.isDisposed) throw new Error("World is disposed");
    this.ops.push(() => this.world.remove(e, type));
    return this;
  }

  despawn(e: Entity): this {
    if (this.world.isDisposed) throw new Error("World is disposed");
    this.ops.push(() => this.world.despawn(e));
    return this;
  }

  run(fn: () => void): this {
    if (this.world.isDisposed) throw new Error("World is disposed");
    this.ops.push(fn);
    return this;
  }

  /** Fail fast; the failing operation is consumed, untouched operations remain queued.
   * clear() cancels the remainder even when called from inside a running operation. */
  flush(): number {
    if (this.flushing) throw new Error("CommandBuffer.flush is not reentrant");
    const ops = this.ops;
    this.ops = [];
    const epoch = this.epoch;
    let completed = 0;
    this.flushing = true;
    try {
      for (let i = 0; i < ops.length && epoch === this.epoch; i++) {
        try { ops[i](); completed++; }
        catch (error) {
          if (epoch === this.epoch) this.ops = [...ops.slice(i + 1), ...this.ops];
          throw error;
        }
      }
      return completed;
    } finally { this.flushing = false; }
  }

  clear(): void {
    this.epoch++;
    this.ops = [];
  }
}
