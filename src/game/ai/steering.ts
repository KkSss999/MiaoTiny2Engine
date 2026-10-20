import type { Threat } from "./perception.ts";

export type Vec = { x: number; y: number };

const norm = (x: number, y: number): Vec => {
  const len = Math.hypot(x, y);
  return len < 0.0001 ? { x: 0, y: 0 } : { x: x / len, y: y / len };
};

/** 朝目标 */
export const seek = (t: Threat): Vec => ({ x: t.ux, y: t.uy });

/** 远离目标 */
export const flee = (t: Threat): Vec => ({ x: -t.ux, y: -t.uy });

/** 绕圈：与目标连线垂直 */
export const strafe = (t: Threat, sign = 1): Vec => norm(-t.uy * sign, t.ux * sign);

/**
 * 保持距离：太近退、太远进、合适就绕。
 * 这是"炮手"类敌人最常用的运动组合。
 */
export function keepDistance(t: Threat, desired: number, sign = 1): Vec {
  if (desired <= 0) return seek(t);
  if (t.dist < desired * 0.8) return flee(t);
  if (t.dist > desired * 1.15) return seek(t);
  return strafe(t, sign);
}

/** 斜向接近：保留一点侧移，避免一条直线撞上来 */
export function approachAtAngle(t: Threat, bias = 0.35): Vec {
  return norm(t.ux - t.uy * bias, t.uy + t.ux * bias);
}
