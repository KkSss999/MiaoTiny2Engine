import type { Entity, World } from "#core/ecs/index.ts";
import type { Race } from "./api.ts";
import { Circle, EnemyTag, Position } from "./components.ts";
import { damageEnemy, effects, shake } from "./combat.ts";

export type SkillCost = { kind: "heat" | "soul"; amount: number };

export type SkillCtx = {
  world: World;
  player: Entity;
  x: number;
  y: number;
  angle: number;
};

export type SkillDef = {
  id: string;
  name: string;
  cooldown: number;
  cost?: SkillCost;
  cast: (ctx: SkillCtx) => void;
};

/**
 * 技能表：数据 + 一段施法实现。
 * 主动技能都从这里走，玩家组件里只存 { id, cd }。
 */
export const SKILLS: Record<string, SkillDef> = {
  "human.shock": {
    id: "human.shock",
    name: "电磁拳",
    cooldown: 1.1,
    cost: { kind: "heat", amount: 30 },
    cast: ({ world, player, x, y }) => {
      shake(world, 0.35);
      const hits: Entity[] = [];
      world.query(Position, Circle, EnemyTag).forEach((e, pos, circle) => {
        if (Math.hypot(pos.x - x, pos.y - y) < 150 + circle.r) hits.push(e);
      });
      for (const target of hits) {
        const pos = world.get(target, Position);
        if (pos) {
          effects(world).push({
            type: "bullet",
            x: pos.x,
            y: pos.y,
            angle: Math.random() * 6.28,
            speed: 200,
            dmg: 6,
            friendly: true,
            color: 0x39e0c8,
            r: 3,
          });
        }
        damageEnemy(world, target, 34, player);
      }
    },
  },

  "undead.soulburst": {
    id: "undead.soulburst",
    name: "魂爆",
    cooldown: 0.6,
    cost: { kind: "soul", amount: 25 },
    cast: ({ world, x, y, angle }) => {
      shake(world, 0.18);
      for (let i = -1; i <= 1; i++) {
        effects(world).push({
          type: "bullet",
          x,
          y,
          angle: angle + i * 0.18,
          speed: 520,
          dmg: 22,
          friendly: true,
          color: 0x39e0c8,
          r: 7,
        });
      }
    },
  },
};

export const STARTING_SKILLS: Record<Race, string[]> = {
  human: ["human.shock"],
  undead: ["undead.soulburst"],
};
