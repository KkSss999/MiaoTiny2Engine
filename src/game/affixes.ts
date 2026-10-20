import type { Entity, World } from "#core/ecs/index.ts";
import { EnemyTag, Health, Knock, PlayerTag, Position } from "./components.ts";
import { effects } from "./combat.ts";
import { applyStatus } from "./status.ts";
import { DamageLanded, dealDamage, type DamagePacket } from "./damage.ts";
import { playerEntity } from "./query.ts";

type Handler = (world: World, packet: DamagePacket, applied: number) => void;

function burst(world: World, entity: Entity, color: number, count: number): void {
  const pos = world.get(entity, Position);
  if (pos) effects(world).push({ type: "burst", x: pos.x, y: pos.y, color, count, speed: 200 });
}

const HANDLERS: Record<string, Handler> = {
  burn: (world, packet) => {
    applyStatus(world, packet.target, "burn", 1);
    burst(world, packet.target, 0xff7a1a, 6);
  },

  freeze: (world, packet) => {
    applyStatus(world, packet.target, "freeze", 1);
    burst(world, packet.target, 0x66ccff, 6);
  },

  curse: (world, packet) => {
    applyStatus(world, packet.target, "curse", 1);
    burst(world, packet.target, 0x9b6bff, 6);
  },

  lifesteal: (world, packet, applied) => {
    // 谁打的谁回血：玩家词条回玩家，精英怪词条回它自己
    const owner = packet.source !== null ? packet.source : playerEntity(world);
    if (owner === undefined) return;
    const hp = world.get(owner, Health);
    if (!hp) return;
    hp.hp = Math.min(hp.max, hp.hp + applied * 0.15);
    burst(world, owner, 0x39e0c8, 4);
  },

  knockback: (world, packet) => {
    const from = packet.source !== null ? world.get(packet.source, Position) : null;
    const to = world.get(packet.target, Position);
    if (!to) return;
    const dx = from ? to.x - from.x : 0;
    const dy = from ? to.y - from.y : 0;
    const len = Math.hypot(dx, dy) || 1;
    if (!world.has(packet.target, PlayerTag)) {
      if (!world.has(packet.target, Knock)) world.add(packet.target, Knock);
      const knock = world.get(packet.target, Knock);
      if (knock) {
        knock.x = (dx / len) * 260;
        knock.y = (dy / len) * 260;
        knock.time = 0.18;
      }
    }
    burst(world, packet.target, 0xffffff, 5);
  },

  chain: (world, packet) => {
    const origin = world.get(packet.target, Position);
    if (!origin) return;
    const nearby: { e: Entity; d: number }[] = [];
    world.query(Position, EnemyTag).forEach((e, pos) => {
      if (e === packet.target) return;
      const d = Math.hypot(pos.x - origin.x, pos.y - origin.y);
      if (d < 260) nearby.push({ e, d });
    });
    nearby.sort((a, b) => a.d - b.d);
    for (const hit of nearby.slice(0, 2)) {
      const pos = world.get(hit.e, Position);
      if (pos) effects(world).push({ type: "burst", x: pos.x, y: pos.y, color: 0x66ccff, count: 4, speed: 220 });
      dealDamage(world, {
        source: packet.source,
        target: hit.e,
        amount: packet.amount * 0.4,
        kind: "dot",
        tags: [],
      });
    }
  },
};

export function installAffixes(world: World): void {
  world.bus.on(DamageLanded, ({ packet, applied }) => {
    for (const tag of packet.tags) {
      const handler = HANDLERS[tag];
      if (handler) handler(world, packet, applied);
    }
  });
}

export const AFFIX_IDS = Object.keys(HANDLERS);

/** 精英怪可以带的词条：连锁对单体无意义，排除 */
export const ELITE_AFFIXES = AFFIX_IDS.filter((id) => id !== "chain");

export const AFFIX_COLORS: Record<string, number> = {
  burn: 0xff7a1a,
  freeze: 0x66ccff,
  curse: 0x9b6bff,
  lifesteal: 0x39e0c8,
  knockback: 0xffffff,
};

export const pickEliteAffix = (): string =>
  ELITE_AFFIXES[Math.floor(Math.random() * ELITE_AFFIXES.length)];