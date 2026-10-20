import type { EnemyCtx } from "./enemyAi.ts";

export const aimAngle = (c: EnemyCtx): number => Math.atan2(c.threat.dy, c.threat.dx);

/** 贴身接触伤害 */
export function contact(c: EnemyCtx, damage: number): void {
  if (c.threat.dist < c.radius + c.playerRadius + 2) c.hitPlayer(damage);
}

/** 单发直射 */
export function shootStraight(c: EnemyCtx): boolean {
  if (c.cd > 0 || !c.threat.los || c.threat.dist > c.def.projectileRange) return false;
  c.setCd(c.def.projectileInterval);
  c.shoot(aimAngle(c), c.def.projectileSpeed, c.def.projectileDamage);
  return true;
}

/** 扇形弹幕：count 发，均匀铺在 spread 弧度里 */
export function shootFan(c: EnemyCtx, count = 3, spread = 0.5): boolean {
  if (c.cd > 0 || !c.threat.los || c.threat.dist > c.def.projectileRange) return false;
  c.setCd(c.def.projectileInterval);
  const base = aimAngle(c);
  const n = Math.max(1, count);
  for (let i = 0; i < n; i++) {
    const offset = n === 1 ? 0 : (i / (n - 1) - 0.5) * spread;
    c.shoot(base + offset, c.def.projectileSpeed, c.def.projectileDamage);
  }
  return true;
}

/** 环形爆发：不看朝向 */
export function burstRadial(c: EnemyCtx, count: number, offset = 0): boolean {
  if (c.cd > 0 || count <= 0 || c.def.projectileSpeed <= 0) return false;
  c.setCd(c.def.projectileInterval);
  const n = Math.max(1, count);
  for (let i = 0; i < n; i++) {
    c.shoot(offset + (i / n) * Math.PI * 2, c.def.projectileSpeed, c.def.projectileDamage);
  }
  return true;
}

/** 召唤：数量与种类来自原型表 */
export function summonAdds(c: EnemyCtx, count = c.def.summonCount): void {
  for (let i = 0; i < count; i++) c.spawnAdd();
}
/**
 * 按原型配置打一套（环形 / 扇形 / 单发）。
 * 时机由状态机保证，这里不再检查冷却和视线。
 */
export function firePattern(c: EnemyCtx): void {
  const d = c.def;
  if (d.projectileSpeed <= 0) return;

  if (d.radialCount > 0) {
    const n = d.radialCount;
    for (let i = 0; i < n; i++) c.shoot((i / n) * Math.PI * 2, d.projectileSpeed, d.projectileDamage);
    return;
  }

  if (d.fanCount > 1) {
    const base = aimAngle(c);
    const n = d.fanCount;
    for (let i = 0; i < n; i++) {
      const offset = (i / (n - 1) - 0.5) * d.fanSpread;
      c.shoot(base + offset, d.projectileSpeed, d.projectileDamage);
    }
    return;
  }

  c.shoot(aimAngle(c), d.projectileSpeed, d.projectileDamage);
}
