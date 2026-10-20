import { Container, Graphics, Text } from "pixi.js";
import type { World } from "#core/ecs/index.ts";
import { EnemyTag, Health } from "../game/components.ts";
import { getEnemy } from "../game/content.ts";

const BAR_W = 420;
const BAR_H = 9;

/**
 * Boss 血条：屏幕底部居中。
 * 名称在上、血条在下，整体以屏幕中轴对齐。
 */
export class BossBar {
  readonly root = new Container();
  private label: Text;
  private bar = new Graphics();
  private ghost = new Graphics();
  private shown = 1;
  private ghostShown = 1;

  constructor() {
    this.label = new Text({
      text: "",
      style: { fontFamily: "ui-monospace, monospace", fontSize: 17, fill: 0xe8e2d0, letterSpacing: 5 },
    });
    this.label.anchor.set(0.5, 1);

    this.root.addChild(this.ghost, this.bar, this.label);
    this.root.visible = false;
  }

  /** 必须挂在地图根节点之后，否则会被地板盖住 */
  attach(stage: Container): void {
    stage.addChild(this.root);
  }

  sync(world: World, screenW: number, screenH: number, dt: number): void {
    let bossHp = -1;
    let bossMax = 1;
    let bossName = "";

    world.query(EnemyTag, Health).forEach((_e, tag, hp) => {
      if (tag.typeId !== "boss" || hp.hp <= 0) return;
      bossHp = hp.hp;
      bossMax = hp.max;
      bossName = getEnemy(tag.typeId)?.name ?? "BOSS";
    });

    if (bossHp < 0) {
      this.root.visible = false;
      return;
    }

    this.root.visible = true;
    this.root.position.set(Math.round(screenW / 2), Math.round(screenH - 116));

    const ratio = Math.max(0, Math.min(1, bossHp / bossMax));
    const k = Math.min(1, dt * 12);
    this.shown += (ratio - this.shown) * k;
    if (this.ghostShown < this.shown) this.ghostShown = this.shown;
    else this.ghostShown += (ratio - this.ghostShown) * Math.min(1, dt * 3);

    if (this.label.text !== bossName) this.label.text = bossName;
    this.label.position.set(0, -6);

    this.ghost.clear();
    this.ghost.rect(-BAR_W / 2, 0, BAR_W, BAR_H).fill({ color: 0x000000, alpha: 0.55 });
    this.ghost.rect(-BAR_W / 2, 0, BAR_W * this.ghostShown, BAR_H).fill({ color: 0xe8e2d0, alpha: 0.25 });

    this.bar.clear();
    this.bar.rect(-BAR_W / 2, 0, BAR_W * this.shown, BAR_H).fill(0xd7263d);
    this.bar.rect(-BAR_W / 2, 0, BAR_W, BAR_H).stroke({ width: 1, color: 0xd7263d, alpha: 0.45 });
    this.bar.rect(-BAR_W / 2 - 2, -2, BAR_W + 4, BAR_H + 4).stroke({ width: 1, color: 0x000000, alpha: 0.6 });
  }

  reset(): void {
    this.shown = 1;
    this.ghostShown = 1;
    this.root.visible = false;
  }
}