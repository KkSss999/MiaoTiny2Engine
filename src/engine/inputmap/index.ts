import type { InputState } from "../../core/kernel/index.ts";

/**
 * Action mapping decouples physical keys from game actions.
 *
 * Systems consume named actions, allowing bindings/platform input to change without gameplay changes.
 */
export type ActionMap = Record<string, string[]>;

export class InputActions {
  private readonly input: InputState;
  private map: ActionMap;

  // Avoid parameter properties: Node strip-only mode cannot load them in tests.
  constructor(input: InputState, map: ActionMap = {}) {
    this.input = input;
    this.map = map;
  }

  setMap(map: ActionMap): void {
    this.map = map;
  }

  /** True when any bound key is held. */
  down(action: string): boolean {
    const keys = this.map[action];
    if (!keys) return false;
    for (const key of keys) if (this.input.isDown(key)) return true;
    return false;
  }

  /** True when any bound key was newly pressed this frame; consume once. */
  pressed(action: string): boolean {
    const keys = this.map[action];
    if (!keys) return false;
    let hit = false;
    for (const key of keys) if (this.input.consume(key)) hit = true;
    return hit;
  }

  /** Combine opposing actions into -1 / 0 / 1. */
  axis(negative: string, positive: string): number {
    const n = this.down(negative) ? 1 : 0;
    const p = this.down(positive) ? 1 : 0;
    return p - n;
  }
}