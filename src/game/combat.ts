import type { Entity, World } from "@core/ecs/index.ts";
import { Circle, Health, PlayerTag, EnemyTag, Position } from "./components.ts";
import { EFFECTS, ROOM, RUN, type RoomCtx, type RunCtx } from "./resources.ts";
import type { EffectQueue } from "./effects.ts";
import { EntityKilled, PlayerDamaged } from "./events.ts";

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

export const runCtx = (w: World) => w.resource<RunCtx>(RUN);
export const roomCtx = (w: World) => w.resource<RoomCtx>(ROOM);
export const effects = (w: World) => w.resource<EffectQueue>(EFFECTS);

export const shake = (w: World, amount: number) => {
  const run = runCtx(w);
  run.trauma = clamp(run.trauma + amount, 0, 1);
};

export function playerEntity(w: World): Entity | undefined {
  const list = w.query(PlayerTag).collect();
  return list[0];
}

export function damageEnemy(w: World, e: Entity, dmg: number): void {
  const hp = w.get(e, Health);
  if (!hp || hp.hp <= 0) return;
  hp.hp -= dmg;
  const tag = w.get(e, EnemyTag);
  if (tag) tag.flash = 0.09;
  shake(w, 0.04);
  const run = runCtx(w);
  run.freeze = Math.max(run.freeze, 0.022);
  if (hp.hp <= 0) {
    run.kills++;
    w.bus.emit(EntityKilled, { entity: e, byPlayer: true });
    const pe = playerEntity(w);
    if (pe !== undefined) {
      const pt = w.get(pe, PlayerTag);
      if (pt && pt.race === "undead") pt.souls = Math.min(100, pt.souls + 8);
    }
    w.commands.despawn(e);
  }
}

export function damagePlayer(w: World, amount: number): void {
  const run = runCtx(w);
  if (run.over) return;
  const pe = playerEntity(w);
  if (pe === undefined) return;
  const pt = w.get(pe, PlayerTag);
  const hp = w.get(pe, Health);
  if (!pt || !hp || pt.invuln > 0) return;

  hp.hp -= amount;
  pt.invuln = 0.45;
  shake(w, 0.3);
  run.freeze = 0.05;
  w.bus.emit(PlayerDamaged, { amount, hp: hp.hp });
  if (hp.hp <= 0) {
    if (pt.race === "undead" && !pt.revived) {
      pt.revived = true;
      hp.hp = hp.max * 0.5;
      pt.souls = 0;
      pt.invuln = 1.6;
      return;
    }
    hp.hp = 0;
    run.over = true;
  }
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
