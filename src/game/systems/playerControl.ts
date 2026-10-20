import type { World } from "#core/ecs/index.ts";
import { fire, is, step } from "#core/fsm/index.ts";
import { Aim, Brain, EnemyTag, PlayerTag, Position } from "../components.ts";
import { clamp, moveWithWalls, playerEntity, roomCtx, runCtx } from "../combat.ts";
import { input } from "../input.ts";
import { DEBUG, VIEW, type DebugCtx, type ViewCtx } from "../resources.ts";
import { ROOM_H, ROOM_W } from "../rooms.ts";
import { PLAYER_FSM, type PlayerCtx } from "../ai/playerAi.ts";
import { speedMul } from "../status.ts";

/**
 * 玩家移动 / 瞄准 / 开火。
 * 主动技能不在这里 —— 走 skillsSystem + 技能表。
 */
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
  pt.dashCd = Math.max(0, pt.dashCd - dt);
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
    // 冰冻等状态同样作用于玩家
    move: (ux, uy, speed) => {
      const mul = speedMul(w, pe);
      moveWithWalls(room.walls, pos, 16, ux * speed * mul * dt, uy * speed * mul * dt);
    },
  };
  step(PLAYER_FSM, brain, ctx, dt, w.bus);

  pos.x = clamp(pos.x, -80, ROOM_W + 80);
  pos.y = clamp(pos.y, -80, ROOM_H + 80);

}