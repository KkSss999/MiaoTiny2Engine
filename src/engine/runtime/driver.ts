import type { Runtime } from "./index.ts";
import { InputLatch } from "../inputmap/latch.ts";

export type DriverState = "idle" | "running" | "faulted" | "stopped";
export interface FrameView {
  readonly dt: number;
  readonly alpha: number;
  readonly simulationFrame: number;
}

/** Owns scheduling/reset/disposal of its Runtime; presentation callbacks are optional and headless. */
export class FrameDriver {
  readonly runtime: Runtime;
  readonly input: InputLatch;
  private readonly control?: () => void;
  private readonly update?: (view: FrameView) => void;
  private readonly render?: () => void;
  private busy = false;
  private settling = false;
  private stopping = false;
  private stopped = false;
  private failed = false;
  private resetPending = false;
  private stopPending = false;
  private pausePending: boolean | undefined;
  private alpha = 0;

  constructor(options: {
    runtime: Runtime; input?: InputLatch; control?: () => void;
    update?: (view: FrameView) => void; render?: () => void;
  }) {
    if (!options.runtime.faultOnEventBacklog) throw new Error("FrameDriver requires strict event backlog handling");
    if (options.runtime.isDisposed || options.runtime.faulted) throw new Error("FrameDriver requires an active Runtime");
    this.runtime = options.runtime;
    this.input = options.input ?? new InputLatch();
    this.control = options.control; this.update = options.update; this.render = options.render;
  }

  get state(): DriverState {
    return this.stopped ? "stopped" : this.failed ? "faulted" : this.busy ? "running" : "idle";
  }

  frame(deltaMs: number): void {
    if (this.busy) throw new Error("FrameDriver.frame is not reentrant");
    if (this.stopped) throw new Error("FrameDriver is stopped");
    if (this.failed) throw new Error("FrameDriver is faulted; request reset before advancing");
    if (!Number.isFinite(deltaMs)) throw new RangeError("Frame delta must be finite");
    const errors: unknown[] = [];
    this.busy = true;
    try {
      this.input.beginFrame();
      synchronous(() => this.control?.());
      this.input.finishFrame(!this.runtime.paused);
      this.applyPause();
      if (!this.lifecyclePending) {
        if (!this.runtime.paused) {
          const tick = this.runtime.advance(deltaMs, {
            beforeStep: () => this.input.beginStep(),
            finishStep: () => this.input.finishStep(),
          });
          this.alpha = tick.alpha;
        }
        // A fixed-batch pause must be visible to presentation, without interrupting catch-up.
        this.applyPause();
        if (!this.lifecyclePending) {
          synchronous(() => this.update?.({
            dt: Math.min(Math.max(deltaMs, 0), this.runtime.clock.maxDeltaMs) / 1000,
            alpha: this.alpha, simulationFrame: this.runtime.frame,
          }));
        }
        if (!this.lifecyclePending) synchronous(() => this.render?.());
      }
    } catch (error) {
      errors.push(error);
      this.failed = true;
      this.resetInput(errors);
      try { if (!this.runtime.isDisposed) this.runtime.pause(); }
      catch (pauseError) { errors.push(pauseError); }
    } finally {
      try { this.applyPause(); } catch (error) { errors.push(error); this.failed = true; }
      try { this.settle(); } catch (error) { errors.push(error); this.failed = true; }
      this.busy = false;
    }
    throwErrors(errors);
  }

  setPaused(paused: boolean): void {
    if (this.stopped || this.stopping || this.settling) return;
    this.pausePending = paused;
    if (!this.busy) this.applyPause();
  }

  requestReset(): void {
    if (this.stopped || this.stopping || this.settling) return;
    this.resetPending = true;
    if (!this.busy) this.atIdleBoundary();
  }

  /** Synchronous headless teardown, not the future native save/close handshake. */
  requestStop(): void {
    if (this.stopped || this.stopping) return;
    this.stopPending = true;
    if (!this.busy) this.atIdleBoundary();
  }

  private get lifecyclePending(): boolean { return this.stopPending || this.resetPending; }

  private applyPause(): void {
    const paused = this.pausePending;
    this.pausePending = undefined;
    if (paused === undefined || this.lifecyclePending || this.failed || this.runtime.isDisposed) return;
    if (paused !== this.runtime.paused) {
      this.input.reset();
      if (paused) this.runtime.pause(); else this.runtime.resume();
    }
  }

  private atIdleBoundary(): void {
    this.busy = true;
    try { this.settle(); }
    catch (error) { this.failed = true; throw error; }
    finally { this.busy = false; }
  }

  private settle(): void {
    this.settling = true;
    const errors: unknown[] = [];
    try {
      if (this.stopPending) this.stop(errors);
      else if (this.resetPending) {
        this.resetPending = false; this.pausePending = undefined;
        try { this.runtime.reset(); this.alpha = 0; this.failed = false; }
        catch (error) { errors.push(error); }
        finally { this.resetInput(errors); }
        // A disposal callback during reset may request terminal stop, but never recursive reset.
        if (this.stopPending) this.stop(errors);
      }
    } finally { this.settling = false; }
    throwErrors(errors);
  }

  private stop(errors: unknown[]): void {
    this.stopping = true;
    this.stopPending = false; this.resetPending = false; this.pausePending = undefined;
    try { this.runtime.dispose(); }
    catch (error) { errors.push(error); }
    finally {
      this.resetInput(errors);
      this.stopped = true; this.stopping = false;
    }
  }

  private resetInput(errors: unknown[]): void {
    try { this.input.reset(); }
    catch (error) { errors.push(error); }
  }
}

function synchronous(fn: () => unknown): void {
  const result = fn();
  if (result !== null && (typeof result === "object" || typeof result === "function")
    && typeof (result as { then?: unknown }).then === "function") {
    // Observe native Promise rejection without assimilating/executing a custom thenable.
    try { void Promise.prototype.then.call(result, undefined, () => {}); }
    catch { /* A non-Promise thenable must remain unexecuted. */ }
    throw new TypeError("FrameDriver callbacks must be synchronous");
  }
}
function throwErrors(errors: unknown[]): void {
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, "Frame and lifecycle failures");
}
