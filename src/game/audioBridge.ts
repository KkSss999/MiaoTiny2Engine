import type { World } from "#core/ecs/index.ts";
import type { AudioPort } from "../engine/audio/index.ts";
import { PlayerTag } from "./components.ts";
import { DamageLanded } from "./damage.ts";
import { EntityKilled, RoomEntered, WeaponFired } from "./events.ts";

/**
 * 音频桥：把游戏事件翻译成音效 id。
 *
 * 玩法代码不知道音频存在，音频也不知道玩法——名字和事件的对应关系只写在这里。
 * manifest 的 audio 还是空数组，所以现在确实不响；这张表就是那份"数据结构"，
 * 素材到位（manifest 加一条同 id 的条目）立刻有声，这里一行不用改。
 */
export const SFX = {
  /** 开火按武器行为分：sfx.shoot.spread / sfx.shoot.melee / ... */
  shoot: (behavior: string) => `sfx.shoot.${behavior}`,
  playerHit: "sfx.player.hit",
  enemyHit: "sfx.enemy.hit",
  enemyDeath: "sfx.enemy.death",
  roomEnter: "sfx.room.enter",
} as const;

/** 同一种音效 50ms 内只响一次：伤害是每帧都可能落的，不节流会炸成噪音 */
export const SFX_THROTTLE_MS = 50;

/** 订阅玩法事件并播声音；返回取消订阅函数 */
export function installAudio(world: World, audio: AudioPort): () => void {
  const lastAt = new Map<string, number>();

  const play = (id: string): void => {
    const now = performance.now();
    const at = lastAt.get(id);
    if (at !== undefined && now - at < SFX_THROTTLE_MS) return;
    lastAt.set(id, now);
    audio.play(id);
  };

  const offs = [
    world.bus.on(WeaponFired, (event) => play(SFX.shoot(event.behavior))),
    world.bus.on(DamageLanded, ({ packet }) => {
      play(world.has(packet.target, PlayerTag) ? SFX.playerHit : SFX.enemyHit);
    }),
    world.bus.on(EntityKilled, () => play(SFX.enemyDeath)),
    world.bus.on(RoomEntered, () => play(SFX.roomEnter)),
  ];

  return () => {
    for (const off of offs) off();
    offs.length = 0;
    lastAt.clear();
  };
}

/**
 * 首次交互解锁：浏览器只在用户手势里允许出声，所以监听一次就摘掉。
 * 返回的清理函数给 dispose 用（从来没交互过时也要能摘干净）。
 */
export function unlockOnGesture(audio: AudioPort, target: EventTarget = window): () => void {
  const release = (): void => {
    target.removeEventListener("pointerdown", release);
    target.removeEventListener("keydown", release);
  };
  const unlock = (): void => {
    audio.unlock?.();
    release();
  };
  target.addEventListener("pointerdown", unlock);
  target.addEventListener("keydown", unlock);
  return release;
}
