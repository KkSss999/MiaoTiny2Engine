import type { World } from "#core/ecs/index.ts";
import { Anim } from "../components.ts";
import { getClip } from "#content/index.ts";

/**
 * 帧动画推进：时间累加 → 槽位取模 → 写入 frame。
 * 只算帧号，具体换哪张纹理由表现层决定。
 */
export function animationSystem(world: World, dt: number): void {
  for (const entity of world.query(Anim).collect()) {
    const anim = world.get(entity, Anim);
    if (!anim) continue;

    const clip = getClip(anim.clip);
    if (!clip || clip.frames.length === 0) continue;

    anim.time += dt;
    const index = Math.floor(anim.time * clip.fps);
    const slot = clip.loop ? index % clip.frames.length : Math.min(index, clip.frames.length - 1);
    anim.frame = slot;
  }
}
