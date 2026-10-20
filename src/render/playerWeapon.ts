import { Container } from "pixi.js";
import type { World } from "#core/ecs/index.ts";
import { Aim, Loadout, Position } from "../game/components.ts";
import { getWeapon } from "#content/index.ts";
import { playerEntity } from "../game/query.ts";
import { createSpriteView } from "./assets.ts";
import type { LayerMap } from "./layerContainers.ts";

const SPRITE_BY_BEHAVIOR: Record<string, string> = {
  slug: "weapon.gun",
  auto: "weapon.gun",
  spread: "weapon.gun",
  rail: "weapon.gun",
  lob: "weapon.gun",
  saw: "weapon.melee",
  arc: "weapon.melee",
  totem: "weapon.totem",
};

const MELEE = new Set(["saw", "arc"]);
const SWING_TIME = 0.2;
const RECOIL_TIME = 0.1;

/**
 * 玩家手里的武器视图：独立于角色本体，跟着瞄准方向转。
 * 之前武器是画死在角色贴图里的，所以近战武器看起来"没有武器"。
 */
export class PlayerWeapon {
  readonly view = new Container();
  private spriteId = "";
  private inner: Container | null = null;
  private pulseT = 99;
  private pulseKind: "" | "melee" | "ranged" = "";

  constructor(layers: LayerMap) {
    layers.actor.addChild(this.view);
    this.view.visible = false;
  }

  /** 开火时由事件触发 */
  pulse(behavior: string): void {
    this.pulseKind = MELEE.has(behavior) ? "melee" : "ranged";
    this.pulseT = 0;
  }

  sync(world: World, dt: number): void {
    const player = playerEntity(world);
    if (player === undefined) {
      this.view.visible = false;
      return;
    }

    const pos = world.get(player, Position);
    const aim = world.get(player, Aim);
    const loadout = world.get(player, Loadout);
    const slot = loadout ? loadout.slots[loadout.active] : undefined;
    const weapon = slot ? getWeapon(slot.weaponId) : undefined;
    if (!pos || !aim || !weapon) {
      this.view.visible = false;
      return;
    }

    const spriteId = SPRITE_BY_BEHAVIOR[weapon.behavior] ?? "weapon.gun";
    if (spriteId !== this.spriteId) {
      this.inner?.destroy();
      const view = createSpriteView(spriteId);
      this.inner = view;
      this.view.addChild(view);
      this.spriteId = spriteId;
    }

    this.view.visible = true;
    this.pulseT += dt;

    let angle = aim.angle;
    let back = 0;
    let scale = weapon.size >= 6 ? 1.1 : 1;

    if (this.pulseKind === "melee" && this.pulseT < SWING_TIME) {
      const k = this.pulseT / SWING_TIME;
      angle = aim.angle - 1.15 + 2.2 * k; // 从后方扫到前方
      scale *= 1 + 0.18 * Math.sin(Math.PI * k);
    } else if (this.pulseKind === "ranged" && this.pulseT < RECOIL_TIME) {
      const k = this.pulseT / RECOIL_TIME;
      back = -6 * (1 - k);
    }

    const reach = 16 + back;
    this.view.position.set(pos.x + Math.cos(angle) * reach, pos.y + Math.sin(angle) * reach);
    this.view.rotation = angle;
    this.view.scale.set(scale);
    this.view.tint = weapon.color;
    this.view.zIndex = Math.round(pos.y) + 1;
  }
}
