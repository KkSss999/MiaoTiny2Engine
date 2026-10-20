import type { Entity, World } from "@core/ecs/index.ts";
import { fire, is, step } from "@core/fsm/index.ts";
import { Aim, Brain, Circle, EnemyTag, PlayerTag, Position } from "../components.ts";
import { clamp, damageEnemy, effects, moveWithWalls, playerEntity, roomCtx, runCtx } from "../combat.ts";
import { input } from "../input.ts";
import { DEBUG, VIEW, type DebugCtx, type ViewCtx } from "../resources.ts";
import { ROOM_H, ROOM_W } from "../rooms.ts";
import { PLAYER_FSM, type PlayerCtx } from "../ai/playerAi.ts";

export function playerControlSystem(w: World, dt: number): void {
  const pe = playerEntity(w);
  if (pe === undefined) return;

  const pt = w.require(pe, PlayerTag);
  const pos = w.require(pe, Position);
  const aim = w.require(pe, Aim);
  const brain = w.require(pe, Brain);
  const room = roomCtx(w);
  const run = runCtx(w);

  pt.invuln = Math.max(0, pt.invuln - dt);
  pt.fireCd = Math.max(0, pt.fireCd - dt);
  pt.dashCd = Math.max(0, pt.dashCd - dt);
  pt.eCd = Math.max(0, pt.eCd - dt);
  pt.heat = clamp(pt.heat - dt * 18, 0, 100);
  if (pt.overheated && pt.heat < 40) pt.overheated = false;

  if (run.over || run.won) return;

  const view = w.resource<ViewCtx>(VIEW);
  const dbg = w.resource<DebugCtx>(DEBUG);

  let angle = Math.atan2(input.mouseY + view.camY - pos.y, input.mouseX + view.camX - pos.x);
  if (dbg.autoAim) {
    let best: { x: number; y: number; d: number } | null = null;
    w.query(Position, EnemyTag).forEach((_e, ep) => {
      const d = Math.hypot(ep.x - pos.x, ep.y - pos.y);
      if (!best || d < best.d) best = { x: ep.x, y: ep.y, d };
    });
    if (best !== null) {
      const t = best as { x: number; y: number; d: number };
      angle = Math.atan2(t.y - pos.y, t.x - pos.x);
      input.down = true;
    }
  }
  aim.angle = angle;

  let mx = 0;
  let my = 0;
  const forced = dbg.autoWalk;
  if (forced) {
    mx = forced === "KeyD" ? 1 : forced === "KeyA" ? -1 : 0;
    my = forced === "KeyS" ? 1 : forced === "KeyW" ? -1 : 0;
  } else {
    if (input.isDown("KeyW") || input.isDown("ArrowUp")) my -= 1;
    if (input.isDown("KeyS") || input.isDown("ArrowDown")) my += 1;
    if (input.isDown("KeyA") || input.isDown("ArrowLeft")) mx -= 1;
    if (input.isDown("KeyD") || input.isDown("ArrowRight")) mx += 1;
  }
  const len = Math.hypot(mx, my) || 1;
  mx /= len;
  my /= len;

  // 冲刺：充能/冷却由系统管，位移由状态机管
  if (input.consume("Space") && pt.dashCd <= 0 && pt.dashes > 0 && !is(brain, "dash")) {
    pt.dashes--;
    pt.dashCd = pt.race === "human" ? 0.35 : 0.7;
    pt.invuln = Math.max(pt.invuln, 0.18);
    pt.dashX = mx !== 0 || my !== 0 ? mx : Math.cos(angle);
    pt.dashY = mx !== 0 || my !== 0 ? my : Math.sin(angle);
    run.trauma = clamp(run.trauma + 0.08, 0, 1);
    fire(brain, "dash");
  }
  if (pt.dashes < pt.maxDashes && pt.dashCd <= 0) {
    pt.dashCd = pt.race === "human" ? 0.7 : 1.4;
    pt.dashes++;
  }

  const ctx: PlayerCtx = {
    dt,
    mx,
    my,
    dashX: pt.dashX,
    dashY: pt.dashY,
    move: (ux, uy, speed) => moveWithWalls(room.walls, pos, 16, ux * speed * dt, uy * speed * dt),
  };
  step(PLAYER_FSM, brain, ctx, dt, w.bus);

  pos.x = clamp(pos.x, -80, ROOM_W + 80);
  pos.y = clamp(pos.y, -80, ROOM_H + 80);

  if (input.down && pt.fireCd <= 0) {
    pt.fireCd = 0.15;
    effects(w).push({
      type: "bullet",
      x: pos.x + Math.cos(angle) * 26,
      y: pos.y + Math.sin(angle) * 26,
      angle: angle + (Math.random() - 0.5) * 0.08,
      speed: 900,
      dmg: 12,
      friendly: true,
      color: pt.race === "human" ? 0xffd166 : 0x39e0c8,
      r: 4,
    });
    run.trauma = clamp(run.trauma + 0.05, 0, 1);
  }

  if (input.consume("KeyE") && pt.eCd <= 0) {
    if (pt.race === "human") {
      if (pt.overheated || pt.heat + 30 > 100) {
        pt.overheated = true;
      } else {
        pt.eCd = 1.1;
        pt.heat += 30;
        run.trauma = clamp(run.trauma + 0.35, 0, 1);
        const hits: Entity[] = [];
        w.query(Position, Circle, EnemyTag).forEach((e, ep, ec) => {
          if (Math.hypot(ep.x - pos.x, ep.y - pos.y) < 150 + ec.r) hits.push(e);
        });
        for (const e of hits) {
          const ep = w.get(e, Position);
          if (ep) effects(w).push({ type: "bullet", x: ep.x, y: ep.y, angle: Math.random() * 6.28, speed: 200, dmg: 6, friendly: true, color: 0x39e0c8, r: 3 });
          damageEnemy(w, e, 34);
        }
      }
    } else if (pt.souls >= 25) {
      pt.souls -= 25;
      pt.eCd = 0.6;
      for (let i = -1; i <= 1; i++) {
        effects(w).push({ type: "bullet", x: pos.x, y: pos.y, angle: angle + i * 0.18, speed: 520, dmg: 22, friendly: true, color: 0x39e0c8, r: 7 });
      }
      run.trauma = clamp(run.trauma + 0.18, 0, 1);
    }
  }
}
