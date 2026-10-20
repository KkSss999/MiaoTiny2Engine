import type { World } from "@core/ecs/index.ts";
import { PlayerTag, Position } from "../game/components.ts";
import { EntityKilled, PlayerDamaged } from "../game/events.ts";
import { playerEntity } from "../game/combat.ts";
import type { Renderer } from "./Renderer.ts";

/**
 * 事件 → 表现。
 * 逻辑层只负责"发生了什么"，这里决定"看起来怎么样"。
 */
export function installFx(world: World, renderer: Renderer): () => void {
  const offKill = world.bus.on(EntityKilled, ({ entity }) => {
    const pos = world.get(entity, Position);
    if (pos) renderer.emitParticles(pos.x, pos.y, 9, 0xd7263d, 220);
  });

  const offHit = world.bus.on(PlayerDamaged, ({ amount }) => {
    const pe = playerEntity(world);
    if (pe === undefined) return;
    const pos = world.get(pe, Position);
    const pt = world.get(pe, PlayerTag);
    if (pos) renderer.emitParticles(pos.x, pos.y, Math.min(14, 4 + amount), pt?.race === "undead" ? 0x39e0c8 : 0xffd166, 180);
  });

  return () => {
    offKill();
    offHit();
  };
}
