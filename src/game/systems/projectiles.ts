import type { Entity, World } from "#core/ecs/index.ts";
import { BulletTag, Circle, EnemyTag, Health, PlayerTag, Position, PropTag, Velocity } from "../components.ts";
import { damageEnemy, damagePlayer, explode, hitsWall, playerEntity, roomCtx } from "../combat.ts";

export function projectilesSystem(w: World, dt: number): void {
  const room = roomCtx(w);
  const enemies = w.query(Position, Circle, Health, EnemyTag).collect();
  const props = w.query(Position, Circle, Health, PropTag).collect();
  const players = w.query(PlayerTag, Position, Circle).collect();

  w.query(Position, Velocity, Circle, BulletTag).forEach((e: Entity, pos, vel, circle, tag) => {
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;
    tag.life -= dt;

    if (tag.life <= 0 || hitsWall(room.walls, pos.x, pos.y, circle.r)) {
      if (tag.aoeDamage > 0) explode(w, pos.x, pos.y, tag.aoeRadius, tag.aoeDamage);
      w.commands.despawn(e);
      return;
    }

    if (tag.friendly) {
      for (const target of enemies) {
        const hp = w.get(target, Health);
        if (!hp || hp.hp <= 0) continue;
        const tp = w.require(target, Position);
        const tc = w.require(target, Circle);
        if (Math.hypot(tp.x - pos.x, tp.y - pos.y) < tc.r + circle.r) {
          const tags = tag.affix ? [tag.affix] : [];
          damageEnemy(w, target, tag.dmg, playerEntity(w) ?? null, tags);
          if (tag.pierce > 0) {
            tag.pierce -= 1;
            return;
          }
          if (tag.aoeDamage > 0) explode(w, pos.x, pos.y, tag.aoeRadius, tag.aoeDamage);
          w.commands.despawn(e);
          return;
        }
      }
      for (const target of props) {
        const hp = w.get(target, Health);
        if (!hp || hp.hp <= 0) continue;
        const tp = w.require(target, Position);
        const tc = w.require(target, Circle);
        if (Math.hypot(tp.x - pos.x, tp.y - pos.y) < tc.r + circle.r) {
          hp.hp -= tag.dmg;
          w.commands.despawn(e);
          if (hp.hp <= 0) {
            const prop = w.get(target, PropTag);
            w.commands.despawn(target);
            if (prop?.kind === "barrel") explode(w, tp.x, tp.y, 130, 45);
          }
          return;
        }
      }
    } else {
      for (const target of players) {
        const tp = w.require(target, Position);
        const tc = w.require(target, Circle);
        if (Math.hypot(tp.x - pos.x, tp.y - pos.y) < tc.r + circle.r) {
          w.commands.despawn(e);
          damagePlayer(w, tag.dmg);
          return;
        }
      }
    }
  });
}