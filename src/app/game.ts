import { Application } from "pixi.js";
import { Schedule, World } from "#core/ecs/index.ts";
import { Lifetime } from "#core/kernel/index.ts";
import { Transitioned } from "#core/agent/index.ts";
import { actions, attachInput, input } from "../game/input.ts";
import { hud } from "../game/store.ts";
import { api, type Race } from "../game/api.ts";
import { ROOM_H, ROOM_W } from "../game/rooms.ts";
import type { RoomNode } from "../game/gen/floor.ts";
import { PlayerTag, Position } from "../game/components.ts";
import { Renderer } from "../render/Renderer.ts";
import { viewZoom } from "../render/camera.ts";
import { prepareAssets } from "../render/assets.ts";
import { installFx } from "../render/fx.ts";
import { EffectQueue } from "../game/effects.ts";
import {
  DEBUG, EFFECTS, ROOM, RUN, VIEW,
  makeRoomCtx, makeRunCtx,
  type DebugCtx, type RoomCtx, type RunCtx, type ViewCtx,
} from "../game/resources.ts";
import { playerEntity, roomCtx, runCtx } from "../game/combat.ts";
import { playerControlSystem } from "../game/systems/playerControl.ts";
import { projectilesSystem } from "../game/systems/projectiles.ts";
import { enemiesSystem } from "../game/systems/enemies.ts";
import { roomFlowSystem } from "../game/systems/roomFlow.ts";
import { hudSyncSystem } from "../game/systems/hudSync.ts";
import { skillsSystem } from "../game/systems/skills.ts";
import { statusSystem } from "../game/systems/status.ts";
import { installDamageRules } from "../game/damage.ts";
import { RoomCleared, RoomEntered } from "../game/events.ts";
import { createAudio } from "../engine/audio/index.ts";
import { installAudio, unlockOnGesture } from "../game/audioBridge.ts";
import { bindAudio } from "../game/settings.ts";
import { WorldManager } from "../game/world/WorldManager.ts";
import { spawnBullet, spawnDrop, spawnEnemy, spawnPlayer, spawnTotem } from "../game/entities/factory.ts";
import { weaponsSystem } from "../game/systems/weapons.ts";
import { totemsSystem } from "../game/systems/totems.ts";
import { navSystem } from "../game/systems/nav.ts";
import { animationSystem } from "../game/systems/animation.ts";
import { rollDrop } from "../game/systems/weapons.ts";
import { installAffixes } from "../game/affixes.ts";
import { implantSystem, installImplants } from "../game/implants.ts";
import { applyReward, buildRewards, rewardAffix, type RewardOption } from "../game/rewards.ts";
import { installDebugHooks } from "../game/debug.ts";
import { connectDevChannel } from "../game/devChannel.ts";
import { Loop } from "#core/kernel/index.ts";

const STEP_MS = 1000 / 60;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/**
 * 编排层：只负责接线和时钟。
 * 楼层/房间交给 WorldManager，实体构造交给 entities/factory，绘制交给 renderer。
 */
export class Game {
  private app!: Application;
  private renderer!: Renderer;
  private detach?: () => void;
  private detachDev?: () => void;
  private detachAudio?: () => void;

  private world = new World();
  private schedule = new Schedule();

  private loop = new Loop(STEP_MS, 5);
  private onEscape?: (event: KeyboardEvent) => void;
  private clearedEvents = 0;
  private transitions = 0;

  /** 页面级生命周期：Game 活着期间的一切都挂在这里 */
  private life = new Lifetime().activate();
  /** 局级生命周期：重开一局整个换掉 */
  private runLife: Lifetime = this.life.fork().activate();
  /** 世界协调器：不留资源，只借用 run 的生命周期 */
  private manager: WorldManager | null = null;
  private rewards: RewardOption[] = [];

  private detached = false;
  private disposed = false;
  private initDone = false;

  async init(host: HTMLDivElement) {
    this.app = new Application();
    await this.app.init({
      background: 0x0a0e14,
      resizeTo: host,
      antialias: false,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: "webgl",
    });
    if (this.detached) {
      this.dispose();
      return;
    }
    host.appendChild(this.app.canvas);
    // 纹理烘焙必须在任何实体创建之前
    prepareAssets(this.app.renderer);
    this.renderer = new Renderer(this.app, this.world);
    this.renderer.init();
    installFx(this.world, this.renderer);

    this.setupWorld();
    // 音频：真实现 + 事件桥；浏览器要用户手势后才出声，首次交互解锁
    const audio = createAudio();
    bindAudio(audio);
    const releaseGesture = unlockOnGesture(audio);
    const detachBridge = installAudio(this.world, audio);
    this.detachAudio = () => { releaseGesture(); detachBridge(); audio.dispose(); };
    // 开发期：接编辑器热更新（生产构建里是空函数）
    this.detachDev = connectDevChannel();
    this.detach = attachInput(this.app.canvas);
    this.onEscape = (event: KeyboardEvent) => {
      if (event.code !== "Escape") return;
      const mode = hud.get().mode;
      if (mode === "playing") this.pause();
      else if (mode === "paused") this.resume();
    };
    window.addEventListener("keydown", this.onEscape);
    installDebugHooks({
      world: this.world,
      floor: () => this.manager?.floor ?? null,
      visited: () => this.manager?.visited ?? 0,
      views: () => this.renderer.viewCount,
      counters: () => ({ clearedEvents: this.clearedEvents, transitions: this.transitions }),
      gotoRoom: (id) => {
        const floor = this.manager?.floor;
        if (floor?.nodes.some((n) => n.id === id)) this.manager?.enter(id, null);
      },
      spawnAt: (typeId: string, x: number, y: number) => {
        const scope = this.manager?.roomScope;
        if (scope) spawnEnemy(this.world, scope, typeId, x, y);
      },
      spawn: (typeId: string) => {
        const scope = this.manager?.roomScope;
        const player = playerEntity(this.world);
        if (!scope || player === undefined) return;
        const pos = this.world.get(player, Position);
        if (pos) spawnEnemy(this.world, scope, typeId, pos.x + 200, pos.y);
      },
      openReward: () => {
        this.openReward();
      },
      drop: (weaponId, affixId) => {
        const scope = this.manager?.roomScope;
        const player = playerEntity(this.world);
        if (!scope || player === undefined) return;
        const pos = this.world.get(player, Position);
        if (pos) spawnDrop(this.world, scope, pos.x + 40, pos.y, { weaponId, affixId });
      },
    });
    api.bind(this);

    this.app.ticker.add(this.onTick);
    this.startRun("human", Number(new URLSearchParams(location.search).get("seed")) || 0);
    hud.patch({ mode: "menu" });
    this.renderer.say("", 0);
    this.initDone = true;
    if (this.detached) this.dispose();
  }

  private setupWorld() {
    const w = this.world;
    w.setResource<RoomCtx>(ROOM, makeRoomCtx());
    w.setResource<RunCtx>(RUN, makeRunCtx());
    w.setResource<EffectQueue>(EFFECTS, new EffectQueue());
    w.setResource<ViewCtx>(VIEW, { camX: 0, camY: 0, width: 1440, height: 900, zoom: 1 });
    w.setResource<DebugCtx>(DEBUG, { autoAim: false, autoWalk: null });

    // 开发期：带 shape 的组件在 add 时过一遍 @gdd/db 的校验
    w.validateComponents = true;

    w.bus.on(Transitioned, () => {
      this.transitions++;
    });

    w.bus.on(RoomCleared, (event) => {
      this.clearedEvents++;
      this.renderer.renderRoomWalls(roomCtx(w).walls);
      this.say(event.type === "boss" ? "傀儡核心停止运转" : "区域清空 —— 门已开启", 1.6);

      // 精英 / Boss 清空 → 三选一（会暂停游戏）
      if ((event.type === "elite" || event.type === "boss") && this.rewards.length === 0) {
        this.openReward();
      }

      // 掉落：精英/Boss 必掉，普通战斗房 45%
      const chance = event.type === "elite" || event.type === "boss" ? 1 : 0.45;
      const scope = this.manager?.roomScope;
      if (scope && Math.random() < chance) {
        spawnDrop(w, scope, ROOM_W / 2 + (Math.random() - 0.5) * 240, ROOM_H / 2 + (Math.random() - 0.5) * 240, rollDrop());
      }
    });

    // 房间数据就绪 → HUD 与提示（表现层自己重绘场景）
    w.bus.on(RoomEntered, (event) => {
      hud.patch({
        room: event.visited,
        rooms: event.total,
        roomType: LABEL[event.type as RoomNode["type"]],
        seed: runCtx(w).seed,
      });
      this.say(event.type === "boss" ? "BOSS：失控工业傀儡" : `${LABEL[event.type as RoomNode["type"]]}房`, 1.8);
    });

    installDamageRules(w);
    installAffixes(w);
    installImplants(w);

    this.schedule
      .add("playerControl", (world, ctx) => playerControlSystem(world, ctx.dt), { phase: 0 })
      .add("skills", (world, ctx) => skillsSystem(world, ctx.dt), { phase: 5 })
      .add("weapons", (world, ctx) => weaponsSystem(world, ctx.dt), { phase: 8 })
      .add("projectiles", (world, ctx) => projectilesSystem(world, ctx.dt), { phase: 10 })
      .add("nav", (world) => navSystem(world), { phase: 11 })
      .add("enemies", (world, ctx) => enemiesSystem(world, ctx.dt), { phase: 20 })
      .add("implants", (world, ctx) => implantSystem(world, ctx.dt), { phase: 20 })
      .add("status", (world, ctx) => statusSystem(world, ctx.dt), { phase: 22 })
      .add("totems", (world, ctx) => totemsSystem(world, ctx.dt), { phase: 24 })
      .add("animation", (world, ctx) => animationSystem(world, ctx.dt), { phase: 26 })
      .add("roomFlow", (world) => roomFlowSystem(world), { phase: 30 })
      .add("hudSync", (world) => hudSyncSystem(world, () => this.manager?.visited ?? 0), { phase: 40 });
  }

  start(race: Race, seed?: number) {
    if (this.detached) return;
    this.startRun(race, seed ?? runCtx(this.world).seed);
  }

  pause() {
    if (hud.get().mode === "playing") hud.patch({ mode: "paused" });
  }

  resume() {
    if (hud.get().mode === "paused") hud.patch({ mode: "playing" });
  }

  private openReward() {
    const w = this.world;
    const player = playerEntity(w);
    const race = player === undefined ? "human" : (w.get(player, PlayerTag)?.race ?? "human");
    this.rewards = buildRewards(w, race);
    hud.patch({
      mode: "reward",
      rewards: this.rewards.map((option) => ({
        kind: option.kind,
        name: option.name,
        desc: option.desc,
        affix: rewardAffix(option),
      })),
    });
  }

  pickReward(index: number) {
    if (this.detached) return;
    const option = this.rewards[index];
    if (!option) return;
    const player = playerEntity(this.world);
    if (player !== undefined) applyReward(this.world, player, option);
    this.rewards = [];
    hud.patch({ mode: "playing", rewards: [] });
  }

  toMenu() {
    if (this.detached) return;
    this.runLife.dispose();
    this.runLife = this.life.fork().activate();
    for (const e of this.world.query(PlayerTag).collect()) this.world.despawn(e);
    this.manager = null;
    this.rewards = [];
    this.renderer.say("", 0);
    hud.patch({ mode: "menu", over: false, won: false, message: "" });
  }

  restart() {
    if (this.detached) return;
    this.startRun(this.playerRace() ?? "human");
  }

  destroy() {
    this.detached = true;
    if (this.initDone) this.dispose();
  }

  private dispose() {
    if (this.disposed) return;
    this.disposed = true;
    api.unbind(this);
    if (this.onEscape) window.removeEventListener("keydown", this.onEscape);
    this.detach?.();
    this.detachDev?.();
    this.detachAudio?.();
    if (!this.app) return;
    this.app.ticker.remove(this.onTick);
    this.life.dispose();
    this.world.dispose();
    this.app.destroy(true, { children: true });
    this.app = undefined as unknown as Application;
  }

  private playerRace(): Race | undefined {
    const pe = playerEntity(this.world);
    return pe === undefined ? undefined : this.world.get(pe, PlayerTag)?.race;
  }

  private startRun(race: Race, seed?: number) {
    const w = this.world;
    const run = runCtx(w);
    run.seed = seed && seed > 0 ? seed : Math.floor(Math.random() * 999999) + 1;
    run.kills = 0;
    run.trauma = 0;
    run.freeze = 0;
    run.over = false;
    run.won = false;

    // 重开一局：局作用域整个销毁（房间、订阅、资源包一起清）
    this.runLife.dispose();
    this.runLife = this.life.fork().activate();
    for (const e of w.query(PlayerTag).collect()) w.despawn(e);

    this.rewards = [];
    this.manager = new WorldManager(w, this.runLife);
    this.manager.begin(run.seed);

    spawnPlayer(w, race);
    this.manager.enter(this.manager.floor!.startId, null);

    hud.patch({ mode: "playing", over: false, won: false, race, kills: 0, seed: run.seed });
    this.say(race === "human" ? "改造者：电磁拳 [E] / 冲刺 [Space]" : "刻印者：魂爆 [E] / 冲刺 [Space]", 3);
  }

  // ------------------------------------------------------------------- tick

  private onTick = () => {
    if (this.detached || !this.app) return;

    // 时间策略交给 Loop：这里只负责把 ticker 的 delta 喂进去
    const tick = this.loop.advance(this.app.ticker.deltaMS);
    for (let i = 0; i < tick.steps; i++) this.step(STEP_MS / 1000);

    const view = this.world.resource<ViewCtx>(VIEW);
    const run = runCtx(this.world);
    this.renderer.render(tick.alpha, view.camX, view.camY, run.trauma, tick.deltaMs / 1000, view.zoom);
  };

  private step(dt: number) {
    const w = this.world;
    const run = runCtx(w);
    if (hud.get().mode !== "playing") return;

    if (run.freeze > 0) {
      run.freeze -= dt;
      run.trauma = Math.max(0, run.trauma - dt * 3);
      input.clearFrame();
      return;
    }

    if (run.over || run.won) {
      if (actions.pressed("restart")) this.startRun(this.playerRace() ?? "human");
      input.clearFrame();
      return;
    }

    this.renderer.beforeStep();
    this.updateView();
    this.schedule.run(w, { dt, elapsed: this.loop.elapsedSec, frame: this.loop.frame });

    const scope = this.manager?.roomScope;
    for (const eff of w.resource<EffectQueue>(EFFECTS).drain()) {
      if (eff.type === "bullet") {
        if (scope) spawnBullet(w, scope, eff);
      } else if (eff.type === "enemy") {
        if (scope) spawnEnemy(w, scope, eff.typeId, eff.x, eff.y);
      } else if (eff.type === "burst") {
        this.renderer.emitParticles(eff.x, eff.y, eff.count, eff.color, eff.speed ?? 180);
      } else if (eff.type === "totem") {
        if (scope) spawnTotem(w, scope, eff.x, eff.y, eff.radius, eff.damage, eff.time, eff.color);
      } else if (eff.type === "shake") {
        run.trauma = clamp(run.trauma + eff.amount, 0, 1);
      } else if (eff.type === "hitstop") {
        run.freeze = Math.max(run.freeze, eff.seconds);
      }
    }

    w.commands.flush();
    w.bus.drain();

    const room = roomCtx(w);
    if (room.transition) {
      const dir = room.transition;
      room.transition = null;
      const next = this.manager?.neighbor(dir);
      if (next) this.manager!.enter(next.id, dir);
    }

    run.trauma = Math.max(0, run.trauma - dt * 1.8);
    input.clearFrame();
  }

  private updateView() {
    const view = this.world.resource<ViewCtx>(VIEW);
    const zoom = viewZoom(this.app.screen.height);
    view.zoom = zoom;
    // 世界单位下的可视范围
    view.width = this.app.screen.width / zoom;
    view.height = this.app.screen.height / zoom;
    const pe = playerEntity(this.world);
    if (pe === undefined) return;
    const pos = this.world.require(pe, Position);
    const vw = view.width;
    const vh = view.height;
    view.camX = clamp(pos.x - vw / 2, 0, Math.max(0, ROOM_W - vw));
    view.camY = clamp(pos.y - vh / 2, 0, Math.max(0, ROOM_H - vh));
  }

  private say(text: string, secs: number) {
    this.renderer.say(text, secs);
  }

}

const LABEL: Record<RoomNode["type"], string> = {
  start: "起点",
  combat: "战斗",
  elite: "精英",
  shop: "商店",
  event: "事件",
  rest: "休息",
  boss: "BOSS",
};