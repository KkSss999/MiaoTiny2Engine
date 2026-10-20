import type { InputState } from "#core/kernel/index.ts";

/**
 * 动作映射：把"物理键"和"游戏动作"解耦。
 *
 * 系统里只写 input.action("move.up")，改键、手柄、多平台都不用动玩法代码。
 */
export type ActionMap = Record<string, string[]>;

export class InputActions {
  private readonly input: InputState;
  private map: ActionMap;

  // 不用参数属性：node 的 strip-only 模式不支持，测试里会直接加载失败
  constructor(input: InputState, map: ActionMap = {}) {
    this.input = input;
    this.map = map;
  }

  setMap(map: ActionMap): void {
    this.map = map;
  }

  /** 任一绑定键按住即真 */
  down(action: string): boolean {
    const keys = this.map[action];
    if (!keys) return false;
    for (const key of keys) if (this.input.isDown(key)) return true;
    return false;
  }

  /** 任一绑定键本帧刚按下（消费一次） */
  pressed(action: string): boolean {
    const keys = this.map[action];
    if (!keys) return false;
    let hit = false;
    for (const key of keys) if (this.input.consume(key)) hit = true;
    return hit;
  }

  /** 一对反义动作合成 -1 / 0 / 1 */
  axis(negative: string, positive: string): number {
    const n = this.down(negative) ? 1 : 0;
    const p = this.down(positive) ? 1 : 0;
    return p - n;
  }
}