import type { Entity, World } from "#core/ecs/index.ts";
import { Circle, EnemyTag, Position } from "./components.ts";
import { damageEnemy, effects, shake } from "./combat.ts";
import type { WeaponRow } from "#content/index.ts";

export type FireCtx = {
  world: World;
  player: Entity;
  x: number;
  y: number;
  angle: number;
  weapon: WeaponRow;
  affixId: string;
};

const rand = () => Math.random() - 0.5;

function shoot(ctx: FireCtx, angle: number, extra: { pierce?: number; aoe?: { radius: number; damage: number } } = {}): void {
  const w = ctx.weapon;
  effects(ctx.world).push({
    type: "bullet",
    x: ctx.x + Math.cos(angle) * 26,
    y: ctx.y + Math.sin(angle) * 26,
    angle,
    speed: w.speed,
    dmg: w.damage,
    friendly: true,
    color: w.color,
    r: w.size,
    affix: ctx.affixId || undefined,
    pierce: extra.pierce,
    aoe: extra.aoe,
  });
  effects(ctx.world).push({
    type: "burst",
    x: ctx.x + Math.cos(angle) * 30,
    y: ctx.y + Math.sin(angle) * 30,
    color: w.color,
    count: 3,
    speed: 140,
  });
  shake(ctx.world, 0.03 + w.damage / 500);
}

/** 近战扇形：按角度和距离筛敌人 */
function sweep(ctx: FireCtx, halfAngle: number): void {
  const w = ctx.weapon;
  const hits: Entity[] = [];
  ctx.world.query(Position, Circle, EnemyTag).forEach((e, pos, circle) => {
    const dist = Math.hypot(pos.x - ctx.x, pos.y - ctx.y);
    if (dist > w.range + circle.r) return;
    const angle = Math.atan2(pos.y - ctx.y, pos.x - ctx.x);
    let diff = angle - ctx.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > halfAngle) return;
    hits.push(e);
  });

  const tags = ctx.affixId ? [ctx.affixId] : [];
  for (const target of hits) damageEnemy(ctx.world, target, w.damage, ctx.player, tags);

  // 挥砍弧光
  for (let i = 0; i < 4; i++) {
    const a = ctx.angle + rand() * halfAngle * 2;
    effects(ctx.world).push({
      type: "burst",
      x: ctx.x + Math.cos(a) * w.range * 0.7,
      y: ctx.y + Math.sin(a) * w.range * 0.7,
      color: w.color,
      count: 2,
      speed: 180,
    });
  }
  shake(ctx.world, 0.06 + w.damage / 400);
}

const BEHAVIORS: Record<string, (ctx: FireCtx) => void> = {
  slug: (ctx) => shoot(ctx, ctx.angle + rand() * ctx.weapon.spread),
  auto: (ctx) => shoot(ctx, ctx.angle + rand() * ctx.weapon.spread),
  spread: (ctx) => {
    const n = ctx.weapon.pellets;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2;
      shoot(ctx, ctx.angle + t * ctx.weapon.spread);
    }
  },
  rail: (ctx) => shoot(ctx, ctx.angle, { pierce: 3 }),
  lob: (ctx) => shoot(ctx, ctx.angle, { aoe: { radius: ctx.weapon.range * 0.45, damage: ctx.weapon.damage } }),
  saw: (ctx) => sweep(ctx, 0.9),
  arc: (ctx) => sweep(ctx, ctx.weapon.spread / 2),
  totem: (ctx) => {
    effects(ctx.world).push({
      type: "totem",
      x: ctx.x,
      y: ctx.y,
      radius: ctx.weapon.range,
      damage: ctx.weapon.damage,
      time: 6,
      color: ctx.weapon.color,
    });
    shake(ctx.world, 0.12);
  },
};

export function fireWeapon(ctx: FireCtx): boolean {
  const behavior = BEHAVIORS[ctx.weapon.behavior];
  if (!behavior) return false;
  behavior(ctx);
  return true;
}