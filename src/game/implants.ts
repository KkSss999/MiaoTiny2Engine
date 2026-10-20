import type { Entity, EntityScope, World } from "@core/ecs/index.ts";
import type { Race } from "./api.ts";
import { Circle, EnemyTag, Health, Implants, PlayerTag, Position, Shield } from "./components.ts";
import { applyStatus } from "./status.ts";
import { effects } from "./combat.ts";
import { DamageIncoming, DamageLanded, dealDamage } from "./damage.ts";
import { EntityKilled } from "./events.ts";
import { playerEntity } from "./query.ts";
import { SCOPE } from "./resources.ts";

export type ImplantCtx = { world: World; player: Entity; scope: EntityScope | null };

export type ImplantDef = {
  id: string;
  name: string;
  race: Race;
  slot: string;
  desc: string;
  /** 装备时执行一次（改属性 / 加组件） */
  setup?: (world: World, player: Entity) => void;
  /** >0 表示这是个周期效果 */
  cooldown?: number;
  tick?: (ctx: ImplantCtx) => void;
};

const burstAt = (world: World, x: number, y: number, color: number, count = 6): void => {
  effects(world).push({ type: "burst", x, y, color, count, speed: 220 });
};

/**
 * 植入体 / 刻印：本质是「槽位 + 一个效果」。
 * 效果只通过事件和组件生效，不直接改其它系统。
 */
export const IMPLANTS: Record<string, ImplantDef> = {
  "human.emfist": {
    id: "human.emfist",
    name: "电弧护腕",
    race: "human",
    slot: "手臂",
    desc: "每 1.2 秒对贴身敌人放电",
    cooldown: 1.2,
    tick: ({ world, player }) => {
      const pos = world.get(player, Position);
      if (!pos) return;
      const hit: Entity[] = [];
      world.query(Position, Circle, EnemyTag).forEach((e, ep, ec) => {
        if (Math.hypot(ep.x - pos.x, ep.y - pos.y) < 110 + ec.r) hit.push(e);
      });
      if (hit.length === 0) return;
      burstAt(world, pos.x, pos.y, 0x66ccff, 8);
      for (const target of hit) {
        burstAt(world, world.get(target, Position)?.x ?? pos.x, world.get(target, Position)?.y ?? pos.y, 0x66ccff, 3);
        effects(world).push({ type: "shake", amount: 0.05 });
        dealDamage(world, { source: player, target, amount: 18, kind: "melee", tags: [] });
      }
    },
  },

  "human.doubledash": {
    id: "human.doubledash",
    name: "二段冲刺",
    race: "human",
    slot: "腿部",
    desc: "冲刺次数 +1",
    setup: (world, player) => {
      const pt = world.get(player, PlayerTag);
      if (!pt) return;
      pt.maxDashes += 1;
      pt.dashes = pt.maxDashes;
    },
  },

  "human.shield": {
    id: "human.shield",
    name: "护盾发生器",
    race: "human",
    slot: "躯干",
    desc: "脱战 2.5 秒后回盾",
    setup: (world, player) => {
      if (!world.has(player, Shield)) world.add(player, Shield, { value: 40, max: 40, timer: 0 });
    },
  },

  "human.turret": {
    id: "human.turret",
    name: "自动炮台",
    race: "human",
    slot: "神经",
    desc: "每 9 秒部署一个自动炮台",
    cooldown: 9,
    tick: ({ world, player }) => {
      const pos = world.get(player, Position);
      if (!pos) return;
      effects(world).push({ type: "totem", x: pos.x + 60, y: pos.y, radius: 110, damage: 5, time: 8, color: 0xc9a227 });
    },
  },

  "undead.revive": {
    id: "undead.revive",
    name: "复活刻印",
    race: "undead",
    slot: "魂",
    desc: "每局一次复活",
  },

  "undead.boneservant": {
    id: "undead.boneservant",
    name: "骨仆刻印",
    race: "undead",
    slot: "骨",
    desc: "击杀处留下啃噬的骨仆",
  },

  "undead.sacrifice": {
    id: "undead.sacrifice",
    name: "献祭刻印",
    race: "undead",
    slot: "契",
    desc: "血量低于一半时伤害 +35%",
  },

  "undead.curse": {
    id: "undead.curse",
    name: "诅咒刻印",
    race: "undead",
    slot: "咒",
    desc: "攻击附带诅咒",
  },
};

/** 开局只带两个，其余靠局内奖励拿 */
export const STARTING_IMPLANTS: Record<Race, string[]> = {
  human: ["human.doubledash", "human.shield"],
  undead: ["undead.revive", "undead.sacrifice"],
};

export function implantPool(race: Race): string[] {
  return Object.keys(IMPLANTS).filter((id) => IMPLANTS[id].race === race);
}

export function hasImplant(world: World, player: Entity, id: string): boolean {
  const imp = world.get(player, Implants);
  return imp ? imp.ids.includes(id) : false;
}

export function addImplant(world: World, player: Entity, id: string): boolean {
  if (!world.has(player, Implants)) world.add(player, Implants);
  const imp = world.get(player, Implants);
  const def = IMPLANTS[id];
  if (!imp || !def || imp.ids.includes(id)) return false;
  imp.ids.push(id);
  imp.cds.push({ id, cd: def.cooldown ?? 0 });
  def.setup?.(world, player);
  return true;
}

export function applyImplants(world: World, player: Entity, ids: string[]): void {
  if (!world.has(player, Implants)) world.add(player, Implants);
  const imp = world.get(player, Implants);
  if (!imp) return;
  imp.ids = [...ids];
  imp.cds = ids.map((id) => ({ id, cd: IMPLANTS[id]?.cooldown ?? 0 }));
  for (const id of ids) IMPLANTS[id]?.setup?.(world, player);
}

/** 周期效果 + 护盾回充 */
export function implantSystem(world: World, dt: number): void {
  const player = playerEntity(world);
  if (player === undefined) return;
  const imp = world.get(player, Implants);
  if (!imp) return;

  const shield = world.get(player, Shield);
  if (shield && hasImplant(world, player, "human.shield")) {
    shield.timer += dt;
    if (shield.timer > 2.5 && shield.value < shield.max) {
      shield.value = Math.min(shield.max, shield.value + 8 * dt);
    }
  }

  const scope = world.tryResource<EntityScope>(SCOPE) ?? null;
  for (const rec of imp.cds) {
    rec.cd = Math.max(0, rec.cd - dt);
    if (rec.cd > 0) continue;
    const def = IMPLANTS[rec.id];
    if (!def?.tick) continue;
    rec.cd = def.cooldown ?? 1;
    def.tick({ world, player, scope });
  }
}

/** 事件型植入体：全局订阅一次，按玩家是否装备分派 */
export function installImplants(world: World): void {
  world.bus.on(DamageIncoming, (packet) => {
    // 护盾优先吸收
    const shield = world.get(packet.target, Shield);
    if (shield && shield.value > 0) {
      const absorbed = Math.min(shield.value, packet.amount);
      shield.value -= absorbed;
      packet.amount -= absorbed;
      shield.timer = 0;
    }

    // 献祭：低血增伤
    if (packet.source !== null) {
      const hp = world.get(packet.source, Health);
      if (hp && hp.hp / hp.max < 0.5 && hasImplant(world, packet.source, "undead.sacrifice")) {
        packet.amount *= 1.35;
      }
    }
  });

  world.bus.on(DamageLanded, ({ packet }) => {
    const player = playerEntity(world);
    if (player === undefined || packet.source !== player) return;
    if (hasImplant(world, player, "undead.curse")) applyStatus(world, packet.target, "curse", 1);
  });

  world.bus.on(EntityKilled, ({ entity, byPlayer }) => {
    if (!byPlayer) return;
    const player = playerEntity(world);
    if (player === undefined) return;
    if (!hasImplant(world, player, "undead.boneservant")) return;
    const pos = world.get(entity, Position);
    if (pos) effects(world).push({ type: "totem", x: pos.x, y: pos.y, radius: 80, damage: 5, time: 8, color: 0xe8e2d0 });
  });
}