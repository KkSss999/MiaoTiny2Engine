export type LoopTick = {
  /** Number of fixed steps to run this frame. */
  steps: number;
  /** Render interpolation factor in [0, 1). */
  alpha: number;
  /** Clamped real elapsed time in milliseconds. */
  deltaMs: number;
};

/**
 * Fixed-step clock.
 *
 * Pure logic: no Pixi, World or global clock access.
 * Input is elapsed frame milliseconds; output is step count and interpolation.
 *
 * Usable in tests, replay plumbing and headless simulation; Game supplies ticker delta.
 */
export class Loop {
  readonly stepMs: number;
  readonly maxSteps: number;
  /** Maximum frame delta, preventing hundreds of catch-up steps after backgrounding. */
  readonly maxDeltaMs: number;

  private acc = 0;
  private frames = 0;
  private elapsedMs = 0;
  private dropped = 0;

  constructor(stepMs = 1000 / 60, maxSteps = 5, maxDeltaMs = 100) {
    if (!Number.isFinite(stepMs) || stepMs <= 0 || !Number.isInteger(maxSteps) || maxSteps < 1 || !Number.isFinite(maxDeltaMs) || maxDeltaMs <= 0) {
      throw new RangeError("Invalid fixed-step clock configuration");
    }
    this.stepMs = stepMs;
    this.maxSteps = maxSteps;
    this.maxDeltaMs = maxDeltaMs;
  }

  get frame(): number {
    return this.frames;
  }

  get elapsedSec(): number {
    return this.elapsedMs / 1000;
  }

  /** Steps discarded by catch-up limits, useful for performance/background diagnostics. */
  get droppedSteps(): number {
    return this.dropped;
  }

  advance(rawDeltaMs: number): LoopTick {
    if (!Number.isFinite(rawDeltaMs)) throw new RangeError("Delta must be finite");
    const deltaMs = Math.min(Math.max(rawDeltaMs, 0), this.maxDeltaMs);
    this.acc += deltaMs;

    const available = Math.floor(this.acc / this.stepMs);
    let steps = available;
    if (steps > this.maxSteps) {
      this.dropped += steps - this.maxSteps;
      steps = this.maxSteps;
      // Discard excess accumulation to avoid a catch-up spiral continuing into later frames.
      // Drop whole excess steps, but retain the fractional interpolation remainder.
    }

    this.acc -= available * this.stepMs;
    if (this.acc < 0) this.acc = 0;

    this.frames += steps;
    this.elapsedMs += steps * this.stepMs;

    return { steps, alpha: this.acc / this.stepMs, deltaMs };
  }

  reset(): void {
    this.acc = 0;
    this.frames = 0;
    this.elapsedMs = 0;
    this.dropped = 0;
  }
}
