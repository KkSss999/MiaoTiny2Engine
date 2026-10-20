import type { World } from "./world.ts";

export type SystemContext = { dt: number; elapsed: number; frame: number };
export type SystemFn = (world: World, ctx: SystemContext) => void;

export type SystemOptions = {
  /** 小的先跑；同相位按加入顺序 */
  phase?: number;
};

type Entry = { name: string; fn: SystemFn; phase: number; order: number };

export class Schedule {
  private entries: Entry[] = [];
  private seq = 0;

  add(name: string, fn: SystemFn, options: SystemOptions = {}): this {
    this.entries.push({ name, fn, phase: options.phase ?? 0, order: this.seq++ });
    return this;
  }

  remove(name: string): boolean {
    const i = this.entries.findIndex((e) => e.name === name);
    if (i < 0) return false;
    this.entries.splice(i, 1);
    return true;
  }

  clear(): void {
    this.entries = [];
    this.seq = 0;
  }

  get names(): string[] {
    return [...this.entries].sort((a, b) => a.phase - b.phase || a.order - b.order).map((e) => e.name);
  }

  run(world: World, ctx: SystemContext): void {
    const ordered = [...this.entries].sort((a, b) => a.phase - b.phase || a.order - b.order);
    for (const entry of ordered) entry.fn(world, ctx);
  }
}
