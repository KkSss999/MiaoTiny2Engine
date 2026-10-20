import { Application, Container, Text } from "pixi.js";
import type { Entity, World } from "#core/ecs/index.ts";
import { Aim, EnemyTag, PlayerTag, Position, SpriteRef, Velocity } from "../game/components.ts";
import { SORTED_LAYERS } from "../game/layers.ts";
import type { RoomCtx } from "../game/resources.ts";
import { ROOM } from "../game/resources.ts";
import { RoomEntered } from "../game/events.ts";
import { hud } from "../game/store.ts";
import { Brain } from "../game/components.ts";

const mixTint = (a: number, b: number, k: number): number => {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return (r << 16) | (g << 8) | bl;
};
import type { Dir, RoomNode } from "../game/gen/floor.ts";
import type { Rect } from "../game/rooms.ts";
import { attachLayers, createLayers, type LayerMap } from "./layerContainers.ts";
import { ViewRegistry } from "./viewRegistry.ts";
import { Particles } from "./particles.ts";
import { Tweens } from "./tweens.ts";
import { RoomView } from "./roomView.ts";
import { shakeOffset, uiScale } from "./camera.ts";
import { Nameplates } from "./nameplates.ts";
import { BossBar } from "./bossBar.ts";
import { DamageNumbers } from "./damageNumbers.ts";
import { getSheetFrame, prepareSheets } from "./sheets.ts";
import { Anim } from "../game/components.ts";
import { getClip } from "../game/content.ts";
import type { Sprite } from "pixi.js";
import { PlayerWeapon } from "./playerWeapon.ts";
import { WeaponFired } from "../game/events.ts";
import { DamageLanded } from "../game/damage.ts";

type SpriteRefValue = {
  spriteId: string;
  layer: keyof LayerMap;
  rotation: "none" | "aim" | "velocity";
  scale: number;
  tint?: number | null;
};

/**
 * 表现层总入口。
 * 只读 ECS 状态 + 事件，不写任何游戏数据；逻辑层完全不知道它存在。
 */
export class Renderer {
  private app: Application;
  private world: World;
  private root = new Container();
  private layers: LayerMap;
  private views: ViewRegistry;
  private particles = new Particles();
  private tweens = new Tweens();
  private room = new RoomView();
  private msg: Text;
  private msgTimer = 0;
  private plates: Nameplates;
  private bossBar: BossBar;
  private damage: DamageNumbers;
  private weapon: PlayerWeapon;
  private prev = new Map<Entity, { x: number; y: number }>();

  constructor(app: Application, world: World) {
    this.app = app;
    this.world = world;
    this.layers = createLayers();
    this.views = new ViewRegistry(world, this.layers);
    this.plates = new Nameplates(this.layers.overlay);
    this.damage = new DamageNumbers(this.layers.overlay);
    this.weapon = new PlayerWeapon(this.layers);
    this.bossBar = new BossBar();
    this.msg = new Text({
      text: "",
      style: { fontFamily: "ui-monospace, monospace", fontSize: 22, fill: 0xe8e2d0, align: "center" },
    });
    this.msg.anchor.set(0.5, 0);
    this.msg.visible = false;
  }

  init(): void {
    attachLayers(this.root, this.layers);
    this.app.stage.addChild(this.root);
    this.layers.floor.addChild(this.room.floorRoot);
    this.layers.shadow.addChild(this.room.wallRoot);
    this.layers.fx.addChild(this.particles.view);
    prepareSheets(this.app.renderer);
    this.app.stage.addChild(this.msg);
    this.bossBar.attach(this.app.stage);
    this.views.bind();

    // 实体销毁时清掉挂在它身上的临时表现状态（补间等）
    this.world.onEntity(({ type, entity }) => {
      if (type === "delete") this.tweens.clear(entity);
    });

    // 换房：房间数据就绪后由表现层自己重绘场景（编排层不再调渲染）
    this.world.bus.on(RoomEntered, () => {
      const room = this.world.resource<RoomCtx>(ROOM);
      this.room.renderFloor();
      this.room.renderWalls(room.walls);
    });

    this.world.bus.on(WeaponFired, (event) => this.weapon.pulse(event.behavior));

    // 伤害飘字：只读事件，不改任何数据
    this.world.bus.on(DamageLanded, ({ packet, applied }) => {
      const pos = this.world.get(packet.target, Position);
      if (!pos || applied <= 0) return;

      let color = 0xe8e2d0;
      let scale = 1;
      if (this.world.has(packet.target, PlayerTag)) {
        color = 0xff6b6b;
        scale = 1.2;
      } else if (packet.kind === "dot") {
        color = 0xffa04a;
        scale = 0.72;
      } else if (this.world.get(packet.target, Brain)?.state === "recover") {
        color = 0xffd166;
        scale = 1.15;
      }
      this.damage.spawn(pos.x, pos.y - 16, applied, color, scale);
    });

    // 出生弹入：读组件上的标记，而不是由编排层点名
    this.world.onAdd(SpriteRef, (e, ref) => {
      if ((ref as { popIn?: boolean }).popIn) this.popIn(e);
    });
  }

  /** 每个固定步进开始时记录上一帧位置，渲染时用它做插值 */
  beforeStep(): void {
    const next = new Map<Entity, { x: number; y: number }>();
    this.world.query(SpriteRef, Position).forEach((e, _ref, pos) => {
      next.set(e, { x: pos.x, y: pos.y });
    });
    this.prev = next;
  }

  /** 当前活着的显示对象数量（用于验证视图跟着实体生命周期回收） */
  get viewCount(): number {
    return this.views.size;
  }

  renderRoomFloor(): void {
    this.room.renderFloor();
  }

  renderRoomWalls(walls: Rect[]): void {
    this.room.renderWalls(walls);
  }

  say(text: string, seconds: number): void {
    this.msg.text = text;
    this.msgTimer = seconds;
    this.msg.visible = true;
  }

  emitParticles(x: number, y: number, count: number, color: number, speed = 160): void {
    this.particles.emit(x, y, count, { color, speed });
  }

  popIn(e: Entity): void {
    this.tweens.add(e, 0.55, 1, 0.14);
  }

  get pendingTweens(): number {
    return 0;
  }

  render(alpha: number, camX: number, camY: number, trauma: number, dt: number, zoom = 1): void {
    const shake = shakeOffset(trauma);
    const ui = uiScale(this.app.screen.height);
    // 像素风：整数缩放 + 摄像机取整，避免整屏亚像素抖动（实体本身的插值保留）
    this.root.scale.set(zoom);
    this.root.x = Math.round(-camX * zoom + shake.x);
    this.root.y = Math.round(-camY * zoom + shake.y);

    const k = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;

    this.world.query(SpriteRef, Position).forEach((e, ref, pos) => {
      const view = this.views.get(e);
      if (!view) return;
      const r = ref as SpriteRefValue;
      const prev = this.prev.get(e) ?? pos;
      const x = prev.x + (pos.x - prev.x) * k;
      const y = prev.y + (pos.y - prev.y) * k;
      view.position.set(x, y);

      if (r.rotation === "aim") {
        const aim = this.world.get(e, Aim);
        if (aim) view.rotation = aim.angle;
      } else if (r.rotation === "velocity") {
        const vel = this.world.get(e, Velocity);
        if (vel) view.rotation = Math.atan2(vel.y, vel.x);
      }

      // 帧动画：按 clip 的当前帧换子纹理（同一张图集的帧仍可批处理）
      const anim = this.world.get(e, Anim);
      if (anim) {
        const clip = getClip(anim.clip);
        if (clip) {
          const index = clip.frames[anim.frame] ?? 0;
          const texture = getSheetFrame(clip.sheet, index);
          const sprite = view as Sprite;
          if (texture && sprite.texture !== texture) sprite.texture = texture;
        }
      }

      const tweenScale = this.tweens.get(e);
      view.scale.set(tweenScale ?? r.scale);

      // 前摇/破绽：用染色让玩家读得出来
      const brain = this.world.get(e, Brain);
      if (brain && brain.state === "windup") {
        const k = Math.min(1, brain.time * 3.5);
        view.tint = mixTint(0xffffff, 0xff4422, k);
      } else if (brain && brain.state === "recover") {
        view.tint = 0x7d848c;
      } else if (r.tint !== null && r.tint !== undefined) {
        view.tint = r.tint;
      } else {
        view.tint = 0xffffff;
      }
      if (SORTED_LAYERS.includes(r.layer)) view.zIndex = Math.round(y);
    });

    this.world.query(SpriteRef, EnemyTag).forEach((e, _ref, tag) => {
      const view = this.views.get(e);
      if (view) view.alpha = tag.flash > 0 ? 0.45 : 1;
    });

    this.world.query(SpriteRef, PlayerTag).forEach((e, _ref, pt) => {
      const view = this.views.get(e);
      if (view) view.alpha = pt.invuln > 0 && Math.floor(pt.invuln * 20) % 2 === 0 ? 0.35 : 1;
    });

    const posOf = (e: Entity, fallback: { x: number; y: number }) => {
      const prev = this.prev.get(e) ?? fallback;
      return { x: prev.x + (fallback.x - prev.x) * k, y: prev.y + (fallback.y - prev.y) * k };
    };
    this.weapon.sync(this.world, dt);
    this.plates.sync(this.world, posOf);
    this.bossBar.sync(this.world, this.app.screen.width, this.app.screen.height, dt, ui);

    // 暂停时飘字停在原地，不继续漂
    if (hud.get().mode === "playing") this.damage.update(dt);
    this.tweens.update(dt);
    this.particles.update(dt);

    const room = this.world.resource<RoomCtx>(ROOM);
    if (room.node) this.room.renderDoors(room.node as RoomNode, room.cleared);

    this.msgTimer = Math.max(0, this.msgTimer - dt);
    // 暂停/菜单时不在画面上留游戏提示
    this.msg.visible = this.msgTimer > 0 && hud.get().mode === "playing";
    this.msg.scale.set(ui);
    this.msg.x = this.app.screen.width / 2;
    this.msg.y = 28 * ui;
  }

  destroy(): void {
    this.bossBar.reset();
    this.views.destroyAll();
    this.particles.clear();
    this.root.destroy({ children: true });
  }
}

export type { Dir };