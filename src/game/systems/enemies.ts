import type { World } from "@core/ecs/index.ts";
import { step } from "@core/fsm/index.ts";
import { Brain, Circle, EnemyTag, Health, Position } from "../components.ts";
import { damagePlayer, effects, moveWithWalls, playerEntity, roomCtx } from "../combat.ts";
import { ENEMY_AI, type EnemyCtx } from "../ai/enemyAi.ts";
import { ROOM_H, ROOM_W } from "../rooms.ts";

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function enemiesSystem(w: World, dt: number): void {
  const room = roomCtx(w);
  const pe = playerEntity(w);
  if (pe === undefined) return;
  const ppos = w.require(pe, Position);
  const pcircle = w.require(pe, Circle);

  w.query(Position, Circle, Health, EnemyTag, Brain).forEach((_e, pos, circle, hp, tag, brain) => {
    if (hp.hp <= 0) return;

    tag.flash = Math.max(0, tag.flash - dt);
    tag.cd -= dt;

    const dx = ppos.x - pos.x;
    const dy = ppos.y - pos.y;
    const dist = Math.hypot(dx, dy) || 1;

    const ctx: EnemyCtx = {
      dt,
      dx,
      dy,
      dist,
      radius: circle.r,
      playerRadius: pcircle.r,
      speed: tag.speed,
      cd: tag.cd,
      move: (ux, uy) => moveWithWalls(room.walls, pos, circle.r, ux * tag.speed * dt, uy * tag.speed * dt),
      charge: (ux, uy) => moveWithWalls(room.walls, pos, circle.r, ux * 620 * dt, uy * 620 * dt),
      shoot: (angle, speed, dmg) =>
        effects(w).push({ type: "bullet", x: pos.x, y: pos.y, angle, speed, dmg, friendly: false, color: 0xd7263d, r: 5 }),
      hitPlayer: (dmg) => damagePlayer(w, dmg),
      spawnAdd: () =>
        effects(w).push({
          type: "enemy",
          kind: "melee",
          x: clamp(pos.x + (Math.random() - 0.5) * 400, 120, ROOM_W - 120),
          y: clamp(pos.y + (Math.random() - 0.5) * 400, 120, ROOM_H - 120),
        }),
      setCd: (seconds) => {
        tag.cd = seconds;
      },
    };

    const def = ENEMY_AI[tag.kind];
    if (def) step(def, brain, ctx, dt, w.bus);

    pos.x = Math.min(Math.max(pos.x, circle.r), ROOM_W - circle.r);
    pos.y = Math.min(Math.max(pos.y, circle.r), ROOM_H - circle.r);
  });
}
