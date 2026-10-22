import { InputState } from "../../core/kernel/input/index.ts";
import type { ActionMap } from "./index.ts";

/** Headless physical-control latch. One press survives display frames until a fixed step. */
export class InputLatch {
  private readonly raw = new InputState();
  private readonly map: Map<string, readonly string[]>;
  private held = new Set<string>();
  private frameEdges = new Set<string>();
  private pending = new Set<string>();
  private tickEdges = new Set<string>();
  private frameOpen = false;
  private stepOpen = false;

  constructor(map: ActionMap = {}) {
    this.map = new Map(Object.entries(map).map(([action, codes]) => [action, [...codes]]));
  }

  /** Use neutral codes for keys or buttons; no DOM binding or game semantics. */
  press(code: string, repeat = false): void {
    if (repeat || this.raw.isDown(code)) return;
    this.raw.press(code);
  }

  release(code: string): void { this.raw.release(code); }

  beginFrame(): void {
    if (this.frameOpen || this.stepOpen) throw new Error("Input frame overlaps an active frame or step");
    this.held = new Set(this.raw.keys);
    this.frameEdges = new Set(this.raw.pressed);
    this.raw.clearFrame();
    this.frameOpen = true;
  }

  /** Control edges expire here; unconsumed gameplay edges survive zero-step frames. */
  finishFrame(gameplay = true): void {
    if (!this.frameOpen) throw new Error("No input frame is active");
    if (gameplay) for (const code of this.frameEdges) this.pending.add(code);
    else this.pending.clear();
    this.frameEdges.clear();
    this.frameOpen = false;
  }

  takeControlPress(action: string): boolean {
    if (!this.frameOpen) throw new Error("Control consumption requires an input frame");
    // A control can also suppress the matching edge retained from a zero-step frame.
    const codes = this.map.get(action) ?? [];
    let hit = false;
    for (const code of codes) {
      if (this.frameEdges.delete(code)) { this.pending.delete(code); hit = true; }
    }
    return hit;
  }

  beginStep(): void {
    if (this.stepOpen || this.frameOpen) throw new Error("Input step overlaps an active step or frame");
    this.tickEdges = this.pending;
    this.pending = new Set();
    this.stepOpen = true;
  }

  finishStep(): void {
    this.tickEdges.clear();
    this.stepOpen = false;
  }

  down(action: string): boolean { return (this.map.get(action) ?? []).some(code => this.held.has(code)); }

  takePress(action: string): boolean {
    if (!this.stepOpen) throw new Error("Gameplay consumption requires an input step");
    let hit = false;
    for (const code of this.map.get(action) ?? []) if (this.tickEdges.delete(code)) hit = true;
    return hit;
  }

  /** Focus/pause/reset boundary: discard raw, retained and in-flight input. */
  reset(): void {
    this.raw.reset();
    this.held.clear(); this.frameEdges.clear(); this.pending.clear(); this.tickEdges.clear();
    this.frameOpen = false; this.stepOpen = false;
  }
}
