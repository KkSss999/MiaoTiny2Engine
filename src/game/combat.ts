import type { Entity, World } from "@core/ecs/index.ts";
import { Circle, EnemyTag, Health, PlayerTag, Position } from "./components.ts";
import { EFFECTS } from "./resources.ts";
import type { EffectQueue } from "./effects.ts";
import { dealDamage } from "./damage.ts";
import { PlayerDamaged } from "./events.ts";
import { playerEntity, roomCtx, runCtx } from "./query.ts";

export { playerEntity, roomCtx, runCtx };

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function hitsWall(walls: { x: number; y: number; w: number; h: number }[], x: number, y: number, r: number): boolean {
  for (const w of walls) {
    const nx = clamp(x, w.x, w.x + w.w);
    const ny = clamp(y, w.y, w.y + w.h);
    const dx = x - nx;
    const dy = y - ny;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

export function moveWithWalls(
  walls: { x: number; y: number; w: number; h: number }[],
  pos: { x: number; y: number },
  r: number,
  dx: number,
  dy: number,
): void {
  if (dx !== 0 && !hitsWall(walls, pos.x + dx, pos.y, r)) pos.x += dx;
  if (dy !== 0 && !hitsWall(walls, pos.x, pos.y + dy, r)) pos.y += dy;
}

export const effects = (w: World) => w.resource<EffectQueue>(EFFECTS);

export const shake = (w: World, amount: number) => {
  const run = runCtx(w);
  run.trauma = clamp(run.trauma + amount, 0, 1);
};

/** 对敌人造成伤害：负责表现（闪白/震屏/顿帧），数值走统一管线 */
export function damageEnemy(w: World, target: Entity, amount: number, source: Entity | null = null): void {
  const hp = w.get(target, Health);
  if (!hp || hp.hp <= 0) return;
  const tag = w.get(target, EnemyTag);
  if (tag) tag.flash = 0.09;
  shake(w, 0.04);
  const run = runCtx(w);
  run.freeze = Math.max(run.freeze, 0.022);
  dealDamage(w, { source, target, amount, kind: "bullet", tags: [] });
}

/** 对玩家造成伤害：无敌帧、受击反馈在这里，数值同样走管线 */
export function damagePlayer(w: World, amount: number): void {
  const run = runCtx(w);
  if (run.over) return;
  const player = playerEntity(w);
  if (player === undefined) return;
  const pt = w.get(player, PlayerTag);
  const hp = w.get(player, Health);
  if (!pt || !hp || pt.invuln > 0) return;

  pt.invuln = 0.45;
  shake(w, 0.3);
  run.freeze = 0.05;
  w.bus.emit(PlayerDamaged, { amount, hp: hp.hp - amount });
  dealDamage(w, { source: null, target: player, amount, kind: "contact", tags: [] });
}

export function explode(w: World, x: number, y: number, radius: number, dmg: number): void {
  shake(w, 0.6);
  const run = runCtx(w);
  run.freeze = Math.max(run.freeze, 0.07);

  const hit: Entity[] = [];
  w.query(Position, Circle, Health).forEach((e, pos, circle) => {
    if (Math.hypot(pos.x - x, pos.y - y) < radius + circle.r) hit.push(e);
  });
  for (const e of hit) {
    if (w.has(e, PlayerTag)) damagePlayer(w, dmg * 0.5);
    else if (w.has(e, EnemyTag)) damageEnemy(w, e, dmg);
  }
}
