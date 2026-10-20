import type { Entity, EntityScope, World } from "@core/ecs/index.ts";
import { createMachine } from "@core/fsm/index.ts";
import type { Race } from "../api.ts";
import type { WeaponSlot } from "../components.ts";
import { allAffixes, getEnemy, getWeapon } from "../content.ts";
import { AFFIX_COLORS } from "../affixes.ts";
import type { Effect } from "../effects.ts";
import { ROOM_H } from "../rooms.ts";
import { ENEMY_BEHAVIORS } from "../ai/enemyAi.ts";
import { STARTING_SKILLS } from "../skills.ts";
import { STARTING_IMPLANTS, applyImplants } from "../implants.ts";
import { PLAYER_FSM } from "../ai/playerAi.ts";
import {
  Aim, Brain, BulletTag, Circle, EliteTag, EnemyTag, Health, Level, Loadout, Pickup, PlayerTag, Position, PropTag, Skills, SpriteRef, Statuses, Totem, Velocity,
} from "../components.ts";

type BulletEffect = Extract<Effect, { type: "bullet" }>;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** 玩家属于整个 run，不进房间作用域 */
export function spawnPlayer(world: World, race: Race): Entity {
  const e = world.spawn(Position);
  world.add(e, Position, { x: 150, y: ROOM_H / 2 });
  world.add(e, Circle, { r: 16 });
  world.add(e, Health, { hp: 100, max: 100 });
  world.add(e, Aim);
  world.add(e, PlayerTag, {
    race,
    fireCd: 0, dashCd: 0, dashX: 1, dashY: 0,
    dashes: race === "human" ? 2 : 1,
    maxDashes: race === "human" ? 2 : 1,
    invuln: 0, heat: 0, souls: race === "undead" ? 30 : 0,
    overheated: false, revived: false,
  });
  world.add(e, Brain, createMachine(PLAYER_FSM));
  world.add(e, Statuses);
  applyImplants(world, e, STARTING_IMPLANTS[race]);
  world.add(e, Level, { level: 1, xp: 0, next: 20 });
  world.add(e, Skills, { list: STARTING_SKILLS[race].map((id) => ({ id, cd: 0 })) });
  const affixes = allAffixes();
  const startAffix = affixes[Math.floor(Math.random() * affixes.length)]?.id ?? "burn";
  world.add(e, Loadout, {
    slots: [{ weaponId: race === "human" ? "nailgun" : "scythe", affixId: startAffix }],
    active: 0,
    cd: 0,
  });
  world.add(e, SpriteRef, {
    spriteId: race === "human" ? "player.human" : "player.undead",
    layer: "actor",
    rotation: "aim",
    scale: 1,
    popIn: false,
  });
  return e;
}

export function spawnEnemy(
  world: World,
  scope: EntityScope,
  typeId: string,
  x: number,
  y: number,
  eliteAffix: string | null = null,
): Entity {
  const def = getEnemy(typeId) ?? getEnemy("melee");
  if (!def) throw new Error(`未知敌人原型：${typeId}`);

  const hp = eliteAffix ? Math.round(def.hp * 1.4) : def.hp;
  const e = scope.spawn(Position);
  world.add(e, Position, { x, y });
  world.add(e, Circle, { r: def.radius });
  world.add(e, Health, { hp, max: hp });
  if (eliteAffix) world.add(e, EliteTag, { affixId: eliteAffix });
  world.add(e, EnemyTag, { typeId: def.id, speed: def.speed, cd: rnd(0.4, 1.4), flash: 0 });
  world.add(e, Statuses);
  const machine = ENEMY_BEHAVIORS[def.behavior] ?? ENEMY_BEHAVIORS.chaser;
  world.add(e, Brain, createMachine(machine));
  world.add(e, SpriteRef, {
    spriteId: def.sprite,
    layer: "actor",
    rotation: "none",
    scale: eliteAffix ? 1.15 : 1,
    popIn: true,
    tint: eliteAffix ? (AFFIX_COLORS[eliteAffix] ?? null) : null,
  });
  return e;
}

export function spawnBullet(world: World, scope: EntityScope, effect: BulletEffect): Entity {
  const e = scope.spawn(Position);
  world.add(e, Position, { x: effect.x, y: effect.y });
  world.add(e, Velocity, { x: Math.cos(effect.angle) * effect.speed, y: Math.sin(effect.angle) * effect.speed });
  world.add(e, Circle, { r: effect.r });
  world.add(e, BulletTag, {
    dmg: effect.dmg,
    friendly: effect.friendly,
    life: 1.6,
    speed: effect.speed,
    affix: effect.affix ?? "",
    pierce: effect.pierce ?? 0,
    aoeRadius: effect.aoe?.radius ?? 0,
    aoeDamage: effect.aoe?.damage ?? 0,
  });
  world.add(e, SpriteRef, {
    spriteId: effect.friendly ? "bullet.friendly" : "bullet.hostile",
    layer: "actor",
    rotation: "velocity",
    scale: 1,
    popIn: false,
    tint: effect.color,
  });
  return e;
}

export function spawnProp(world: World, scope: EntityScope, kind: "barrel" | "crystal", x: number, y: number): Entity {
  const e = scope.spawn(Position);
  world.add(e, Position, { x, y });
  world.add(e, Circle, { r: 22 });
  world.add(e, Health, { hp: 30, max: 30 });
  world.add(e, PropTag, { kind, hp: 30 });
  world.add(e, SpriteRef, {
    spriteId: kind === "barrel" ? "prop.barrel" : "prop.crystal",
    layer: "prop",
    rotation: "none",
    scale: 1,
    popIn: false,
  });
  return e;
}
/** 地上的武器掉落 */
export function spawnDrop(world: World, scope: EntityScope, x: number, y: number, slot: WeaponSlot): Entity {
  const e = scope.spawn(Position);
  world.add(e, Position, { x, y });
  world.add(e, Pickup, { weaponId: slot.weaponId, affixId: slot.affixId });
  world.add(e, SpriteRef, {
    spriteId: "pickup.weapon",
    layer: "prop",
    rotation: "none",
    scale: 1,
    popIn: true,
    tint: getWeapon(slot.weaponId)?.color ?? 0xffffff,
  });
  return e;
}

/** 魂火灯一类的放置物 */
export function spawnTotem(
  world: World,
  scope: EntityScope,
  x: number,
  y: number,
  radius: number,
  damage: number,
  time: number,
  color: number,
): Entity {
  const e = scope.spawn(Position);
  world.add(e, Position, { x, y });
  world.add(e, Totem, { radius, damage, interval: 0.5, tick: 0, time });
  world.add(e, SpriteRef, {
    spriteId: "fx.totem",
    layer: "fx",
    rotation: "none",
    scale: 1,
    popIn: true,
    tint: color,
  });
  return e;
}