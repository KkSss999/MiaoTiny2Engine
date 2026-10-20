import type { World } from "#core/ecs/index.ts";
import { step } from "#core/fsm/index.ts";
import { Brain, Circle, EliteTag, EnemyTag, Health, Knock, Position } from "../components.ts";
import { damagePlayer, effects, moveWithWalls, playerEntity, roomCtx } from "../combat.ts";
import { ENEMY_BEHAVIORS, type EnemyCtx } from "../ai/enemyAi.ts";
import { sense } from "../ai/perception.ts";
import { getEnemy } from "../content.ts";
import { speedMul } from "../status.ts";
import { runCtx } from "../query.ts";
import { flowDir, type NavGrid } from "#core/nav/index.ts";
import { AFFIX_COLORS } from "../affixes.ts";
import { NAV } from "../resources.ts";
import { ROOM_H, ROOM_W } from "../rooms.ts";

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function enemiesSystem(w: World, dt: number): void {
  const room = roomCtx(w);
  const pe = playerEntity(w);
  if (pe === undefined) return;
  const pcircle = w.require(pe, Circle);

  let slot = 0;
  w.query(Position, Circle, Health, EnemyTag, Brain).forEach((e, pos, circle, hp, tag, brain) => {
    const mySlot = slot++;
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

    const elite = w.get(e, EliteTag);
    const affixTags = elite && elite.affixId ? [elite.affixId] : [];

    // 感知一次，行为只消费结果
    const threat = sense(w, pos, pe, room.walls);

    // 包夹：靠近后各自绕向一个固定角度，避免全部挤在同一条线上
    if (def.flankRadius > 0 && threat.los && threat.dist < 320) {
      const ppos = w.get(pe, Position);
      if (ppos) {
        const angle = ((mySlot % 6) / 6) * Math.PI * 2;
        const fx = ppos.x + Math.cos(angle) * def.flankRadius - pos.x;
        const fy = ppos.y + Math.sin(angle) * def.flankRadius - pos.y;
        const flen = Math.hypot(fx, fy) || 1;
        const bx = threat.dir.x * 0.35 + (fx / flen) * 0.65;
        const by = threat.dir.y * 0.35 + (fy / flen) * 0.65;
        const len = Math.hypot(bx, by) || 1;
        threat.dir = { x: bx / len, y: by / len };
      }
    }

    // 看不见玩家时用流场解决绕障
    if (!threat.los) {
      const nav = w.tryResource<NavGrid>(NAV);
      const flow = nav ? flowDir(nav, pos.x, pos.y) : null;
      if (flow) {
        const bx = flow.x * 0.8 + threat.dir.x * 0.2;
        const by = flow.y * 0.8 + threat.dir.y * 0.2;
        const len = Math.hypot(bx, by) || 1;
        threat.dir = { x: bx / len, y: by / len };
      }
    }
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
        const color = (elite?.affixId && AFFIX_COLORS[elite.affixId]) || 0xd7263d;
        effects(w).push({
          type: "bullet",
          x: pos.x,
          y: pos.y,
          angle,
          speed,
          dmg,
          friendly: false,
          color,
          r: 5,
          affix: elite?.affixId || undefined,
        });
      },
      hitPlayer: (dmg) => damagePlayer(w, dmg, affixTags),
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