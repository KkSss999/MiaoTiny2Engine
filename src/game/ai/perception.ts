import type { Entity, World } from "#core/ecs/index.ts";
import { Position } from "../components.ts";
import { hitsWall } from "../combat.ts";
import type { Rect } from "../rooms.ts";

/** 视野判定：沿线段采样，撞墙就看不见 */
export function hasLineOfSight(
  walls: Rect[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  step = 28,
): boolean {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  if (dist < 1) return true;
  const n = Math.ceil(dist / step);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (hitsWall(walls, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 1)) return false;
  }
  return true;
}

/**
 * 感知结果：所有行为共享的输入。
 * 行为里不再自己算 dx/dy/dist。
 */
export type Threat = {
  target: Entity | null;
  dx: number;
  dy: number;
  dist: number;
  ux: number;
  uy: number;
  /** 是否有视线 */
  los: boolean;
  /** 实际接近方向：无视线时由流场解析，带绕障 */
  dir: { x: number; y: number };
};

export const NO_THREAT: Threat = { target: null, dx: 0, dy: 0, dist: Infinity, ux: 0, uy: 0, los: false, dir: { x: 0, y: 0 } };

export function sense(
  world: World,
  self: { x: number; y: number },
  target: Entity | undefined,
  walls: Rect[],
): Threat {
  if (target === undefined) return NO_THREAT;
  const tp = world.get(target, Position);
  if (!tp) return NO_THREAT;
  const dx = tp.x - self.x;
  const dy = tp.y - self.y;
  const dist = Math.hypot(dx, dy) || 1;
  return {
    target,
    dx,
    dy,
    dist,
    ux: dx / dist,
    uy: dy / dist,
    los: hasLineOfSight(walls, self.x, self.y, tp.x, tp.y),
    dir: { x: dx / dist, y: dy / dist },
  };
}