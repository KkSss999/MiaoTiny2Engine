import type { Entity, World } from "#core/ecs/index.ts";
import { defineEvent } from "#core/event/index.ts";
import { Brain, EnemyTag, Health, Implants, Level, PlayerTag } from "./components.ts";
import { damageTakenMul } from "./status.ts";
import { runCtx } from "./query.ts";
import { getEnemy } from "./content.ts";

export type DamageKind = "bullet" | "melee" | "explosion" | "dot" | "contact";

export type DamagePacket = {
  source: Entity | null;
  target: Entity;
  amount: number;
  kind: DamageKind;
  tags: string[];
};

/** 伤害结算前：修饰器可以改 amount（等级加成、诅咒增伤、护甲……） */
export const DamageIncoming = defineEvent<DamagePacket>("game:DamageIncoming");
/** 伤害已扣血：词条、特效、吸血、连锁都挂这里 */
export const DamageLanded = defineEvent<{ packet: DamagePacket; applied: number }>("game:DamageLanded");
export const LeveledUp = defineEvent<{ entity: Entity; level: number }>("game:LeveledUp");

/**
 * 全游戏唯一的伤害入口。
 * 顺序：修饰 → 扣血 → 落地事件 → 死亡处理。
 */
export function dealDamage(world: World, packet: DamagePacket): number {
  if (packet.amount <= 0) return 0;
  const hp = world.get(packet.target, Health);
  if (!hp || hp.hp <= 0) return 0;

  world.bus.emit(DamageIncoming, packet);

  const applied = Math.max(0, Math.round(packet.amount));
  if (applied <= 0) return 0;

  hp.hp -= applied;
  world.bus.emit(DamageLanded, { packet, applied });

  if (hp.hp <= 0) onDeath(world, packet);
  return applied;
}

function onDeath(world: World, packet: DamagePacket): void {
  const target = packet.target;
  const hp = world.get(target, Health);
  if (hp) hp.hp = 0;

  if (world.has(target, PlayerTag)) {
    onPlayerDeath(world, target);
    return;
  }

  const typeId = world.get(target, EnemyTag)?.typeId ?? "melee";
  runCtx(world).kills += 1;
  const source = packet.source;
  const byPlayer = source !== null && world.has(source, PlayerTag);

  world.bus.emit(EntityKilledRef, { entity: target, byPlayer });

  if (byPlayer && source !== null) {
    grantXp(world, source, getEnemy(typeId)?.xp ?? 6);
    const pt = world.get(source, PlayerTag);
    if (pt?.race === "undead") pt.souls = Math.min(100, pt.souls + 8);
  }
  world.commands.despawn(target);
}

function onPlayerDeath(world: World, entity: Entity): void {
  const pt = world.get(entity, PlayerTag);
  const hp = world.get(entity, Health);
  const run = runCtx(world);
  if (!pt || !hp) return;

  // 复活刻印：需要装备
  const implants = world.get(entity, Implants);
  const canRevive = implants?.ids.includes("undead.revive") ?? false;
  if (pt.race === "undead" && !pt.revived && canRevive) {
    pt.revived = true;
    hp.hp = hp.max * 0.5;
    pt.souls = 0;
    pt.invuln = 1.6;
    return;
  }
  hp.hp = 0;
  run.over = true;
}

export function grantXp(world: World, entity: Entity, amount: number): void {
  const lv = world.get(entity, Level);
  if (!lv) return;
  lv.xp += amount;
  while (lv.xp >= lv.next) {
    lv.xp -= lv.next;
    lv.level += 1;
    lv.next = Math.round(lv.next * 1.35);
    const hp = world.get(entity, Health);
    if (hp) {
      hp.max += 10;
      hp.hp = Math.min(hp.max, hp.hp + 25);
    }
    world.bus.emit(LeveledUp, { entity, level: lv.level });
  }
}

/**
 * 全局伤害规则：挂在事件上，而不是写进每一条武器逻辑。
 */
export function installDamageRules(world: World): void {
  world.bus.on(DamageIncoming, (packet) => {
    // 破绽：出招后的硬直期挨打更疼
    const brain = world.get(packet.target, Brain);
    const enemy = world.get(packet.target, EnemyTag);
    if (brain && enemy && brain.state === "recover") {
      const def = getEnemy(enemy.typeId);
      if (def) packet.amount *= def.exposeMul;
    }

    // 玩家等级加成：每级 +6%
    if (packet.source !== null) {
      const lv = world.get(packet.source, Level);
      if (lv) packet.amount *= 1 + (lv.level - 1) * 0.06;
    }
    // 目标身上的减伤/增伤（诅咒）
    packet.amount *= damageTakenMul(world, packet.target);
  });
}

// EntityKilled 定义在 events.ts，这里延迟引入避免环
import { EntityKilled as EntityKilledRef } from "./events.ts";