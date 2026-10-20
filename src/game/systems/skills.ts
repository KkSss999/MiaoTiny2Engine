import type { World } from "#core/ecs/index.ts";
import { Aim, PlayerTag, Position, Skills } from "../components.ts";
import { input } from "../input.ts";
import { playerEntity, runCtx } from "../query.ts";
import { SKILLS } from "../skills.ts";

/** 技能系统：冷却、资源检查、施法。输入只认一个触发键。 */
export function skillsSystem(world: World, dt: number): void {
  const player = playerEntity(world);
  if (player === undefined) return;

  const pt = world.get(player, PlayerTag);
  const slots = world.get(player, Skills);
  const pos = world.get(player, Position);
  const aim = world.get(player, Aim);
  if (!pt || !slots || !pos || !aim) return;

  for (const slot of slots.list) slot.cd = Math.max(0, slot.cd - dt);

  const run = runCtx(world);
  if (run.over || run.won) return;
  if (!input.consume("KeyE")) return;

  for (const slot of slots.list) {
    if (slot.cd > 0) continue;
    const def = SKILLS[slot.id];
    if (!def) continue;

    if (def.cost?.kind === "heat" && (pt.overheated || pt.heat + def.cost.amount > 100)) continue;
    if (def.cost?.kind === "soul" && pt.souls < def.cost.amount) continue;

    def.cast({ world, player, x: pos.x, y: pos.y, angle: aim.angle });
    slot.cd = def.cooldown;
    if (def.cost?.kind === "heat") pt.heat += def.cost.amount;
    if (def.cost?.kind === "soul") pt.souls -= def.cost.amount;
    break;
  }
}
