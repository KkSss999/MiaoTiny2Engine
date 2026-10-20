import type { World } from "@core/ecs/index.ts";
import type { Floor, RoomNode } from "./gen/floor.ts";
import { BulletTag, EnemyTag, Health, PlayerTag, Position, SpriteRef } from "./components.ts";
import { DEBUG, type DebugCtx } from "./resources.ts";
import { playerEntity, roomCtx, runCtx } from "./combat.ts";
import { input } from "./input.ts";
import { hud } from "./store.ts";

export type DebugDeps = {
  world: World;
  floor: () => Floor | null;
  visited: () => number;
  views: () => number;
  counters: () => { clearedEvents: number; transitions: number };
  gotoRoom: (id: string) => void;
};

/**
 * 开发期调试钩子（window.__dbg）。
 * 和生产代码分开：这里可以有大量查询和分配，不需要为帧时间负责。
 */
export function installDebugHooks(deps: DebugDeps): void {
  const w = deps.world;

  (window as unknown as { __dbg: unknown }).__dbg = {
    state: () => {
      const run = runCtx(w);
      const room = roomCtx(w);
      const pe = playerEntity(w);
      const pos = pe === undefined ? null : w.get(pe, Position);
      const hp = pe === undefined ? 0 : (w.get(pe, Health)?.hp ?? 0);
      let enemies = 0;
      for (const e of w.query(EnemyTag, Health).collect()) if ((w.get(e, Health)?.hp ?? 0) > 0) enemies++;
      const counters = deps.counters();
      return {
        mode: hud.get().mode,
        hp: Math.round(hp),
        room: room.node?.id ?? null,
        roomType: room.node?.type ?? null,
        rooms: deps.floor()?.nodes.length ?? 0,
        visited: deps.visited(),
        cleared: room.cleared,
        kills: run.kills,
        over: run.over,
        won: run.won,
        enemies,
        bullets: w.query(BulletTag).count,
        auto: w.resource<DebugCtx>(DEBUG).autoAim,
        down: input.down,
        race: pe === undefined ? null : (w.get(pe, PlayerTag)?.race ?? null),
        pos: pos ? [Math.round(pos.x), Math.round(pos.y)] : null,
        doors: room.doors,
        clearedEvents: counters.clearedEvents,
        bossId: deps.floor()?.bossId ?? null,
        views: deps.views(),
        transitions: counters.transitions,
        sprites: w
          .query(SpriteRef, Position)
          .collect()
          .map((e) => {
            const sp = w.get(e, SpriteRef);
            const p = w.get(e, Position);
            return sp && p ? `${sp.spriteId}@${Math.round(p.x)},${Math.round(p.y)}` : "?";
          }),
      };
    },
    auto: (on: boolean) => {
      w.resource<DebugCtx>(DEBUG).autoAim = on;
    },
    walk: (code: string | null) => {
      w.resource<DebugCtx>(DEBUG).autoWalk = code;
    },
    teleport: (x: number, y: number) => {
      const pe = playerEntity(w);
      if (pe === undefined) return;
      const pos = w.get(pe, Position);
      if (pos) {
        pos.x = x;
        pos.y = y;
      }
    },
    god: () => {
      const pe = playerEntity(w);
      if (pe !== undefined) {
        const hp = w.get(pe, Health);
        if (hp) hp.hp = 9999;
      }
    },
    gotoRoom: (id: string) => {
      const floor = deps.floor();
      if (floor?.nodes.some((n: RoomNode) => n.id === id)) deps.gotoRoom(id);
    },
  };
}
