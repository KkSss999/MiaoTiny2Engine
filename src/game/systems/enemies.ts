import type { World } from "@core/ecs/index.ts";
import { step } from "@core/fsm/index.ts";
import { Brain, Circle, EnemyTag, Health, Knock, Position } from "../components.ts";
import { damagePlayer, effects, moveWithWalls, playerEntity, roomCtx } from "../combat.ts";
import { ENEMY_BEHAVIORS, type EnemyCtx } from "../ai/enemyAi.ts";
import { sense } from "../ai/perception.ts";
import { getEnemy } from "../content.ts";
import { speedMul } from "../status.ts";
import { runCtx } from "../query.ts";
import { ROOM_H, ROOM_W } from "../rooms.ts";

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function enemiesSystem(w: World, dt: number): void {
  const room = roomCtx(w);
  const pe = playerEntity(w);
  if (pe === undefined) return;
  const pcircle = w.require(pe, Circle);

  w.query(Position, Circle, Health, EnemyTag, Brain).forEach((e, pos, circle, hp, tag, brain) => {
    if (hp.hp <= 0) return;

    tag.flash = Math.max(0, tag.flash - dt);
    tag.cd -= dt;

    // 击退：先于 AI 位移，衰减
    const knock = w.get(e, Knock);
    if (knock && knock.time > 0) {
      knock.time -= dt;
      moveWithWalls(room.walls, pos, circle.r, knock.x * dt, knock.y * dt);
      knock.x *= 0.88;
      knock.y *= 0.88;
    }

    const def = getEnemy(tag.typeId) ?? getEnemy("melee");
    if (!def) return;

    // 感知一次，行为只消费结果
    const threat = sense(w, pos, pe, room.walls);
    const slow = speedMul(w, e);

    const ctx: EnemyCtx = {
      dt,
      def,
      radius: circle.r,
      playerRadius: pcircle.r,
      cd: tag.cd,
      threat,
      move: (ux, uy) =>
        moveWithWalls(room.walls, pos, circle.r, ux * def.speed * slow * dt, uy * def.speed * slow * dt),
      charge: (ux, uy) =>
        moveWithWalls(room.walls, pos, circle.r, ux * def.chargeSpeed * slow * dt, uy * def.chargeSpeed * slow * dt),
      shoot: (angle, speed, dmg) => {
        runCtx(w).shots += 1;
        effects(w).push({ type: "bullet", x: pos.x, y: pos.y, angle, speed, dmg, friendly: false, color: 0xd7263d, r: 5 });
      },
      hitPlayer: (dmg) => damagePlayer(w, dmg),
      spawnAdd: () =>
        effects(w).push({
          type: "enemy",
          typeId: def.summonId || "melee",
          x: clamp(pos.x + (Math.random() - 0.5) * 400, 120, ROOM_W - 120),
          y: clamp(pos.y + (Math.random() - 0.5) * 400, 120, ROOM_H - 120),
        }),
      setCd: (seconds) => {
        tag.cd = seconds;
      },
    };

    const machine = ENEMY_BEHAVIORS[def.behavior] ?? ENEMY_BEHAVIORS.chaser;
    if (machine) step(machine, brain, ctx, dt, w.bus);

    pos.x = Math.min(Math.max(pos.x, circle.r), ROOM_W - circle.r);
    pos.y = Math.min(Math.max(pos.y, circle.r), ROOM_H - circle.r);
  });
}