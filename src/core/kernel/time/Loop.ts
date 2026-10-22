export type LoopTick = {
  /** 本帧应该跑几个固定步 */
  steps: number;
  /** 渲染插值系数，落在 [0, 1) */
  alpha: number;
  /** 被截断后的真实耗时（毫秒） */
  deltaMs: number;
};

/**
 * 固定步长时钟。
 *
 * 纯逻辑：不碰 pixi、不碰 world、不读全局时钟。
 * 输入是"这一帧过了多少毫秒"，输出是"该跑几步、插值多少"。
 *
 * 这样它就能被单测、被回放复用、被无头模拟复用 —— 而 Game 只负责把 ticker 的 delta 喂进来。
 */
export class Loop {
  readonly stepMs: number;
  readonly maxSteps: number;
  /** 单帧最大接受耗时，防止切后台回来一次跳几百步 */
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

  /** 因为追帧上限被丢弃的步数（性能问题/切后台的指标） */
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
      // 丢掉多余累积，避免"死亡螺旋"：下一帧继续补课
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
