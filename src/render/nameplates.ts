import { Container, Graphics, Text } from "pixi.js";
import type { Entity, World } from "#core/ecs/index.ts";
import { Circle, EliteTag, EnemyTag, Health, Position } from "../game/components.ts";
import { getEnemy } from "../game/content.ts";
import { AFFIX_COLORS } from "../game/affixes.ts";

type Plate = { root: Container; bar: Graphics; label: Text; tint: number };

const BAR_W = 46;
const BAR_H = 4;
const LABEL_COLOR = 0xb9b2a3;

/**
 * 小怪头顶的名称与血条。
 * 只读 ECS，不写任何游戏数据；实体消失时自己回收。
 */
export class Nameplates {
  private plates = new Map<Entity, Plate>();
  readonly root = new Container();

  constructor(parent: Container) {
    parent.addChild(this.root);
  }

  sync(world: World, posOf: (e: Entity, fallback: { x: number; y: number }) => { x: number; y: number }): void {
    const alive = new Set<Entity>();
    const placed: { x: number; y: number }[] = [];

    world.query(EnemyTag, Position, Health).forEach((e, tag, pos, hp) => {
      if (hp.hp <= 0) return;
      const def = getEnemy(tag.typeId);
      if (!def || def.id === "boss") return; // Boss 走底部大血条

      alive.add(e);
      let plate = this.plates.get(e);
      if (!plate) {
        const created = this.create(world, e);
        if (!created) return;
        plate = created;
      }

      const at = posOf(e, pos);
      const circle = world.get(e, Circle);
      let px = Math.round(at.x);
      let py = Math.round(at.y - (circle?.r ?? 16) - 14);

      // 挤在一起时向上错开，避免名牌叠死
      for (let guard = 0; guard < 4; guard++) {
        const hit = placed.some((p) => Math.abs(p.x - px) < 70 && Math.abs(p.y - py) < 13);
        if (!hit) break;
        py -= 13;
      }
      placed.push({ x: px, y: py });

      plate.root.position.set(px, py);

      const ratio = Math.max(0, Math.min(1, hp.hp / hp.max));
      plate.bar.clear();
      plate.bar.rect(-BAR_W / 2, 0, BAR_W, BAR_H).fill({ color: 0x0a0e14, alpha: 0.85 });
      plate.bar.rect(-BAR_W / 2, 0, BAR_W * ratio, BAR_H).fill(plate.tint);
      plate.bar.rect(-BAR_W / 2 - 1, -1, BAR_W + 2, BAR_H + 2).stroke({ width: 1, color: 0x000000, alpha: 0.5 });
    });

    for (const [entity, plate] of this.plates) {
      if (alive.has(entity)) continue;
      plate.root.destroy({ children: true });
      this.plates.delete(entity);
    }
  }

  private create(world: World, entity: Entity): Plate | null {
    const tag = world.get(entity, EnemyTag);
    const def = tag ? getEnemy(tag.typeId) : undefined;
    if (!def) return null;

    const elite = world.get(entity, EliteTag);
    const name = elite ? `${def.name} · ${affixName(elite.affixId)}` : def.name;
    const tint = elite ? (AFFIX_COLORS[elite.affixId] ?? 0xd7263d) : 0xd7263d;

    const root = new Container();
    const bar = new Graphics();
    const label = new Text({
      text: name,
      style: { fontFamily: "ui-monospace, monospace", fontSize: 10, fill: elite ? tint : LABEL_COLOR, letterSpacing: 1 },
    });
    label.anchor.set(0.5, 1);
    label.y = -3;
    label.alpha = 0.85;

    root.addChild(bar, label);
    this.root.addChild(root);

    const plate: Plate = { root, bar, label, tint };
    this.plates.set(entity, plate);
    return plate;
  }
}

const AFFIX_NAME: Record<string, string> = {
  burn: "燃烧",
  freeze: "冰冻",
  curse: "诅咒",
  lifesteal: "吸血",
  knockback: "击退",
};

const affixName = (id: string): string => AFFIX_NAME[id] ?? id;