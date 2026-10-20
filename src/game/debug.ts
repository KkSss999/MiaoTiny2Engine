import type { World } from "#core/ecs/index.ts";
import { DebugRegistry, countComponents, inspectEntity, listEntities } from "#core/ecs/index.ts";
import { cellXOf, cellYOf, flowDir, type NavGrid } from "#core/agent/index.ts";
import type { Floor, RoomNode } from "./gen/floor.ts";
import { Brain, BulletTag, EliteTag, EnemyTag, Health, Level, PlayerTag, Position, SpriteRef } from "./components.ts";
import { DEBUG, NAV, type DebugCtx } from "./resources.ts";
import { playerEntity, roomCtx, runCtx } from "./combat.ts";
import { input } from "./input.ts";
import { hud } from "./store.ts";
import { applyStatus } from "./status.ts";
import { grantXp } from "./damage.ts";
import { equip, rollDrop } from "./systems/weapons.ts";
import { AffixTable, EnemyTable, StatusTable, WeaponTable, applyContentPatch } from "#content/index.ts";
import { spawnDrop } from "./entities/factory.ts";

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

/** 当前这一局的摘要。纯查询，调用频率低，不为帧时间负责。 */
function summary(w: World, deps: DebugDeps) {
  const run = runCtx(w);
  const room = roomCtx(w);
  const player = playerEntity(w);
  const pos = player === undefined ? null : w.get(player, Position);
  const hp = player === undefined ? 0 : (w.get(player, Health)?.hp ?? 0);

  let enemies = 0;
  const enemyHp: number[] = [];
  const enemyStates: string[] = [];
  const elites: string[] = [];

  for (const e of w.query(EnemyTag, Health).collect()) {
    const current = w.get(e, Health)?.hp ?? 0;
    if (current <= 0) continue;
    const typeId = w.get(e, EnemyTag)?.typeId ?? "?";
    enemies++;
    enemyHp.push(Math.round(current));
    enemyStates.push(`${typeId}:${w.get(e, Brain)?.state ?? "?"}`);
    const elite = w.get(e, EliteTag);
    if (elite) elites.push(`${typeId}:${elite.affixId}`);
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
    revived: player === undefined ? false : (w.get(player, PlayerTag)?.revived ?? false),
    shield: Math.round(hud.get().shield),
    level: player === undefined ? 1 : (w.get(player, Level)?.level ?? 1),
    xp: player === undefined ? 0 : (w.get(player, Level)?.xp ?? 0),
    over: run.over,
    won: run.won,
    enemies,
    enemyHp,
    enemyStates,
    elites,
    bullets: w.query(BulletTag).count,
    shots: run.shots,
    auto: w.resource<DebugCtx>(DEBUG).autoAim,
    down: input.down,
    keys: [...input.keys],
    race: player === undefined ? null : (w.get(player, PlayerTag)?.race ?? null),
    pos: pos ? [Math.round(pos.x), Math.round(pos.y)] : null,
    doors: room.doors,
    walls: [...room.walls, ...room.interiorWalls].map((r) => [
      Math.round(r.x),
      Math.round(r.y),
      Math.round(r.w),
      Math.round(r.h),
    ]),
    clearedEvents: counters.clearedEvents,
    bossId: deps.floor()?.bossId ?? null,
    roomTypes: deps.floor()?.nodes.map((n) => `${n.id}:${n.type}`) ?? [],
    views: deps.views(),
    transitions: counters.transitions,
    sprites: w
      .query(SpriteRef, Position)
      .collect()
      .map((e) => {
        const ref = w.get(e, SpriteRef);
        const at = w.get(e, Position);
        return ref && at ? `${ref.spriteId}@${Math.round(at.x)},${Math.round(at.y)}` : "?";
      }),
  };
}

/**
 * 开发期调试钩子（window.__dbg）。
 *
 * 这里只保留游戏自己的命令；实体/组件反射这类通用能力在 core/ecs/debug.ts。
 * 命令用注册表声明，加一条就是一行登记。
 */
export function installDebugHooks(deps: DebugDeps): void {
  const w = deps.world;
  const player = () => playerEntity(w);

  const registry = new DebugRegistry();

  // ---- 通用 ECS 反射
  registry
    .register("entities", (filter?: string[]) => listEntities(w, filter ?? []), "列出实体，可传组件名过滤")
    .register("inspect", (entity: number) => inspectEntity(w, entity), "查看某个实体的全部组件")
    .register("counts", () => countComponents(w), "各组件挂了多少实例")
    .register(
      "patch",
      (table: string, row: Record<string, unknown>) => applyContentPatch(table, row),
      "直接应用一条内容改动（绕过广播，用于排查）",
    )
    .register(
      "row",
      (table: string, id: string) => {
        const tables: Record<string, { get: (k: string) => unknown }> = {
          weapons: WeaponTable,
          enemies: EnemyTable,
          affixes: AffixTable,
          statuses: StatusTable,
        };
        return tables[table]?.get(id) ?? null;
      },
      "读一行内容（表名, 主键）",
    )
    .register(
      "content",
      () => ({
        weapons: WeaponTable.list().length,
        enemies: EnemyTable.list().length,
        affixes: AffixTable.list().length,
        statuses: StatusTable.list().length,
      }),
      "内容表行数",
    )
    .register("state", () => summary(w, deps), "玩家 / 房间 / 战斗摘要");

  // ---- 游戏命令
  registry
    .register("auto", (on: boolean) => {
      w.resource<DebugCtx>(DEBUG).autoAim = on;
    }, "开关自动瞄准")
    .register("walk", (code: string | null) => {
      w.resource<DebugCtx>(DEBUG).autoWalk = code;
    }, "强制移动方向（KeyboardEvent.code）")
    .register("teleport", (x: number, y: number) => {
      const e = player();
      if (e === undefined) return;
      const at = w.get(e, Position);
      if (at) {
        at.x = x;
        at.y = y;
      }
    }, "把玩家挪到坐标")
    .register("god", () => {
      const e = player();
      if (e !== undefined) {
        const hp = w.get(e, Health);
        if (hp) hp.hp = 9999;
      }
    }, "玩家无敌")
    .register("xp", (amount: number) => {
      const e = player();
      if (e !== undefined) grantXp(w, e, amount);
    }, "直接加经验")
    .register("status", (id: string) => {
      const target = w.query(EnemyTag, Health).collect().find((e) => (w.get(e, Health)?.hp ?? 0) > 0);
      if (target !== undefined) applyStatus(w, target, id);
    }, "给最近的敌人挂状态")
    .register("give", (weaponId: string, affixId: string) => {
      const e = player();
      if (e !== undefined) equip(w, e, weaponId, affixId);
    }, "直接装备武器")
    .register("drop", (weaponId?: string, affixId?: string) => {
      const slot = rollDrop();
      deps.drop(weaponId ?? slot.weaponId, affixId ?? slot.affixId);
    }, "在脚下掉一把武器（可指定武器与词条）")
    .register("spawn", (typeId: string) => deps.spawn(typeId), "在身边生成一个敌人")
    .register("spawnAt", (typeId: string, x: number, y: number) => deps.spawnAt(typeId, x, y), "在指定位置生成敌人")
    .register("over", (won: boolean = false) => {
      const run = runCtx(w);
      run.over = !won;
      run.won = won;
    }, "直接结束本局（测结算/重开）")
    .register("reward", () => deps.openReward(), "打开三选一")
    .register("gotoRoom", (id: string) => {
      const floor = deps.floor();
      if (floor?.nodes.some((n: RoomNode) => n.id === id)) deps.gotoRoom(id);
    }, "跳到指定房间")
    .register("nav", (x: number, y: number) => {
      const nav = w.tryResource<NavGrid>(NAV);
      if (!nav) return null;
      const cx = cellXOf(nav, x);
      const cy = cellYOf(nav, y);
      return {
        cell: [cx, cy],
        blocked: nav.blocked[cy * nav.cols + cx],
        dist: nav.dist[cy * nav.cols + cx],
        dir: flowDir(nav, x, y),
        start: nav.startCell,
        room: nav.roomId,
      };
    }, "查询某点的导航格信息");

  registry.install(window as unknown as Record<string, unknown>);
}

// 供外部构造掉落用
export { spawnDrop };