import { World } from "../../core/ecs/world.ts";
import { Schedule, type SystemContext } from "../../core/ecs/schedule.ts";
import { Loop, type LoopTick } from "../../core/kernel/time/Loop.ts";

export interface StepHooks {
  beforeStep?: (context: SystemContext) => void;
  /** Runs once for every entered step, even if beforeStep or simulation work fails. */
  finishStep?: (context: SystemContext) => void;
}

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
  readonly eventPassLimit: number;
  readonly faultOnEventBacklog: boolean;
  private frames = 0;
  private pausedState = false;
  private faultedState = false;
  private disposed = false;
  private advancing = false;

  constructor(options: {
    world?: World; schedule?: Schedule; clock?: Loop;
    eventPassLimit?: number; faultOnEventBacklog?: boolean;
  } = {}) {
    const limit = options.eventPassLimit ?? 32;
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError("Event pass limit must be a positive integer");
    if (options.faultOnEventBacklog !== undefined && typeof options.faultOnEventBacklog !== "boolean") {
      throw new TypeError("Invalid event backlog policy");
    }
    this.eventPassLimit = limit;
    this.faultOnEventBacklog = options.faultOnEventBacklog ?? false;
    this.world = options.world ?? new World();
    this.schedule = options.schedule ?? new Schedule();
    this.clock = options.clock ?? new Loop();
  }

  get isDisposed(): boolean { return this.disposed || this.world.isDisposed; }
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

  advance(deltaMs: number, hooks: StepHooks = {}): LoopTick {
    this.assertActive();
    if (this.advancing) throw new Error("Runtime.advance is not reentrant");
    if (this.faultedState) throw new Error("Runtime faulted; reset before advancing");
    if (this.pausedState) return { steps: 0, alpha: 0, deltaMs: 0 };
    const tick = this.clock.advance(deltaMs);
    this.advancing = true;
    try {
      for (let i = 0; i < tick.steps; i++) {
        const frame = this.frames + 1;
        const context = { dt: this.clock.stepMs / 1000, frame, elapsed: frame * this.clock.stepMs / 1000 };
        const errors: unknown[] = [];
        try {
          synchronous(() => hooks.beforeStep?.(context));
          this.schedule.run(this.world, context);
          this.world.commands.flush();
          this.world.bus.drain(this.eventPassLimit);
          if (this.faultOnEventBacklog && this.world.bus.pending > 0) {
            throw new Error(`Event backlog after ${this.eventPassLimit} passes: ${this.world.bus.pending}`);
          }
        } catch (error) {
          errors.push(error);
        } finally {
          try { synchronous(() => hooks.finishStep?.(context)); }
          catch (error) { errors.push(error); }
        }
        if (errors.length) {
          this.world.commands.clear();
          this.world.bus.clearPending();
          this.faultedState = true;
          this.pausedState = true;
          if (errors.length === 1) throw errors[0];
          throw new AggregateError(errors, "Simulation step and cleanup failed");
        }
        this.frames = frame;
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
    try { this.world.dispose(); }
    finally { this.schedule.clear(); }
  }

  private assertActive(): void {
    if (this.disposed || this.world.isDisposed) throw new Error("Runtime is disposed");
  }
}

/** A void TS callback can still be async; reject rather than awaiting inside a tick. */
function synchronous(fn: () => unknown): void {
  const result = fn();
  if (result !== null && (typeof result === "object" || typeof result === "function")
    && typeof (result as { then?: unknown }).then === "function") {
    // Observe native Promise rejection without assimilating/executing a custom thenable.
    try { void Promise.prototype.then.call(result, undefined, () => {}); }
    catch { /* A non-Promise thenable must remain unexecuted. */ }
    throw new TypeError("Runtime step hooks must be synchronous");
  }
}

export { FrameDriver, type FrameView, type DriverState } from "./driver.ts";
