import type { World } from "@core/ecs/index.ts";
import type { Floor, RoomNode } from "./gen/floor.ts";
import { BulletTag, EnemyTag, Health, Level, PlayerTag, Position, SpriteRef } from "./components.ts";
import { DEBUG, type DebugCtx } from "./resources.ts";
import { playerEntity, roomCtx, runCtx } from "./combat.ts";
import { input } from "./input.ts";
import { hud } from "./store.ts";
import { applyStatus } from "./status.ts";
import { grantXp } from "./damage.ts";
import { equip } from "./systems/weapons.ts";
import { cellXOf, cellYOf, flowDir, type NavGrid } from "./nav.ts";
import { NAV } from "./resources.ts";

export type DebugDeps = {
  world: World;
  floor: () => Floor | null;
  visited: () => number;
  views: () => number;
  counters: () => { clearedEvents: number; transitions: number };
  gotoRoom: (id: string) => void;
  openReward: () => void;
  spawn: (typeId: string) => void;
  spawnAt: (typeId: string, x: number, y: number) => void;
  drop: (weaponId: string, affixId: string) => void;
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
      const enemyHp: number[] = [];
      for (const e of w.query(EnemyTag, Health).collect()) {
        const hp2 = w.get(e, Health)?.hp ?? 0;
        if (hp2 > 0) {
          enemies++;
          enemyHp.push(Math.round(hp2));
        }
      }
      const counters = deps.counters();
      return {
        mode: hud.get().mode,
        weapons: [hud.get().weapon1, hud.get().weapon2],
        affixes: [hud.get().affix1, hud.get().affix2],
        activeSlot: hud.get().activeSlot,
        implants: hud.get().implants,
        hp: Math.round(hp),
        room: room.node?.id ?? null,
        roomType: room.node?.type ?? null,
        rooms: deps.floor()?.nodes.length ?? 0,
        visited: deps.visited(),
        cleared: room.cleared,
        kills: run.kills,
        revived: pe === undefined ? false : (w.get(pe, PlayerTag)?.revived ?? false),
        shield: Math.round(hud.get().shield),
        level: pe === undefined ? 1 : (w.get(pe, Level)?.level ?? 1),
        xp: pe === undefined ? 0 : (w.get(pe, Level)?.xp ?? 0),
        over: run.over,
        won: run.won,
        enemies,
        enemyHp,
        bullets: w.query(BulletTag).count,
        shots: run.shots,
        auto: w.resource<DebugCtx>(DEBUG).autoAim,
        down: input.down,
        race: pe === undefined ? null : (w.get(pe, PlayerTag)?.race ?? null),
        pos: pos ? [Math.round(pos.x), Math.round(pos.y)] : null,
        doors: room.doors,
        walls: [...room.walls, ...room.interiorWalls].map((r) => [Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)]),
        clearedEvents: counters.clearedEvents,
        bossId: deps.floor()?.bossId ?? null,
        roomTypes: deps.floor()?.nodes.map((n) => `${n.id}:${n.type}`) ?? [],
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
    status: (id: string) => {
      const target = w.query(EnemyTag, Health).collect().find((e) => (w.get(e, Health)?.hp ?? 0) > 0);
      if (target !== undefined) applyStatus(w, target, id);
    },
    drop: (weaponId: string, affixId: string) => {
      deps.drop(weaponId, affixId);
    },
    spawn: (typeId: string) => {
      deps.spawn(typeId);
    },
    nav: (x: number, y: number) => {
      const nav = w.tryResource<NavGrid>(NAV);
      if (!nav) return null;
      const cx = cellXOf(nav, x);
      const cy = cellYOf(nav, y);
      const idx = cy * nav.cols + cx;
      return {
        cell: [cx, cy],
        blocked: nav.blocked[idx],
        dist: nav.dist[idx],
        dir: flowDir(nav, x, y),
        start: nav.startCell,
        room: nav.roomId,
      };
    },
    spawnAt: (typeId: string, x: number, y: number) => {
      deps.spawnAt(typeId, x, y);
    },
    reward: () => {
      deps.openReward();
    },
    give: (weaponId: string, affixId: string) => {
      const pe = playerEntity(w);
      if (pe !== undefined) equip(w, pe, weaponId, affixId);
    },
    xp: (n: number) => {
      const pe = playerEntity(w);
      if (pe !== undefined) grantXp(w, pe, n);
    },
    gotoRoom: (id: string) => {
      const floor = deps.floor();
      if (floor?.nodes.some((n: RoomNode) => n.id === id)) deps.gotoRoom(id);
    },
  };
}