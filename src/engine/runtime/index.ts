import { World } from "../../core/ecs/world.ts";
import { Schedule } from "../../core/ecs/schedule.ts";
import { Loop, type LoopTick } from "../../core/kernel/time/Loop.ts";

/** Headless composition root. Owns its World; no browser or wall-clock dependency.
 * Each step: systems -> commands -> queued events. Commands posted by events wait
 * until the next step. A failed step is NOT rolled back: pending work is discarded
 * and runtime faults until reset, preventing accidental partial-step replay.
 */
export class Runtime {
  readonly world: World;
  readonly schedule: Schedule;
  /** Accumulator clock counts scheduled steps; frame/elapsed above report completed steps. */
  readonly clock: Loop;
  private frames = 0;
  private pausedState = false;
  private faultedState = false;
  private disposed = false;
  private advancing = false;

  constructor(options: { world?: World; schedule?: Schedule; clock?: Loop } = {}) {
    this.world = options.world ?? new World();
    this.schedule = options.schedule ?? new Schedule();
    this.clock = options.clock ?? new Loop();
  }

  get frame(): number { return this.frames; }
  get elapsed(): number { return this.frames * this.clock.stepMs / 1000; }
  get paused(): boolean { return this.pausedState; }
  get faulted(): boolean { return this.faultedState; }

  /** Pause takes effect at the next advance boundary, after the current catch-up batch. */
  pause(): void { this.assertActive(); this.pausedState = true; }
  resume(): void {
    this.assertActive();
    if (this.faultedState) throw new Error("Runtime faulted; reset before resuming");
    this.pausedState = false;
  }

  advance(deltaMs: number): LoopTick {
    this.assertActive();
    if (this.faultedState) throw new Error("Runtime faulted; reset before advancing");
    if (this.pausedState) return { steps: 0, alpha: 0, deltaMs: 0 };
    if (this.advancing) throw new Error("Runtime.advance is not reentrant");
    const tick = this.clock.advance(deltaMs);
    this.advancing = true;
    try {
    for (let i = 0; i < tick.steps; i++) {
      const frame = this.frames + 1;
      try {
        this.schedule.run(this.world, { dt: this.clock.stepMs / 1000, frame, elapsed: frame * this.clock.stepMs / 1000 });
        this.world.commands.flush();
        this.world.bus.drain();
        this.frames = frame;
      } catch (error) {
        this.world.commands.clear();
        this.world.bus.clearPending();
        this.faultedState = true;
        this.pausedState = true;
        throw error;
      }
    }
    return tick;
    } finally { this.advancing = false; }
  }

  /** Clear world state, subscriptions and queued work; retain registered systems. */
  reset(): void {
    this.assertActive();
    if (this.advancing) throw new Error("Cannot reset during a simulation tick");
    this.world.clear();
    this.clock.reset();
    this.frames = 0;
    this.faultedState = false;
    this.pausedState = false;
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.advancing) throw new Error("Cannot dispose during a simulation tick");
    this.disposed = true;
    this.world.dispose();
    this.schedule.clear();
  }

  private assertActive(): void {
    if (this.disposed || this.world.isDisposed) throw new Error("Runtime is disposed");
  }
}
