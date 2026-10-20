import type { World } from "#core/ecs/index.ts";
import { Circle, EnemyTag, Position, Totem } from "../components.ts";
import { damageEnemy, effects } from "../combat.ts";

/** 放置类武器（魂火灯）：周期脉冲伤害，到期消失 */
export function totemsSystem(world: World, dt: number): void {
  const totems = world.query(Totem, Position).collect();
  for (const e of totems) {
    const totem = world.get(e, Totem);
    const pos = world.get(e, Position);
    if (!totem || !pos) continue;

    totem.time -= dt;
    totem.tick -= dt;

    if (totem.tick <= 0) {
      totem.tick = totem.interval;
      effects(world).push({ type: "burst", x: pos.x, y: pos.y, color: 0x39e0c8, count: 8, speed: totem.radius });
      const hit = world.query(Position, Circle, EnemyTag).collect();
      for (const target of hit) {
        const tp = world.get(target, Position);
        const tc = world.get(target, Circle);
        if (!tp || !tc) continue;
        if (Math.hypot(tp.x - pos.x, tp.y - pos.y) <= totem.radius + tc.r) {
          damageEnemy(world, target, totem.damage, null, []);
        }
      }
    }

    if (totem.time <= 0) world.commands.despawn(e);
  }
}
