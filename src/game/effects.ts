import type { EnemyKind } from "./rooms";

/** 系统不直接造实体：把"要生成什么"丢进队列，由渲染层/编排层统一生成 */
export type Effect =
  | { type: "bullet"; x: number; y: number; angle: number; speed: number; dmg: number; friendly: boolean; color: number; r: number }
  | { type: "enemy"; kind: EnemyKind; x: number; y: number }
  | { type: "shake"; amount: number }
  | { type: "hitstop"; seconds: number };

export class EffectQueue {
  private list: Effect[] = [];

  push(effect: Effect): void {
    this.list.push(effect);
  }

  get size(): number {
    return this.list.length;
  }

  drain(): Effect[] {
    const out = this.list;
    this.list = [];
    return out;
  }
}
