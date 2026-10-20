import type { World } from "#core/ecs/index.ts";
import { Health, Statuses } from "../components.ts";
import { StatusTable } from "#content/index.ts";
import { dealDamage } from "../damage.ts";

/** 状态效果 tick：计时、结算持续伤害、过期清理 */
export function statusSystem(world: World, dt: number): void {
  const entities = world.query(Statuses).collect();
  for (const e of entities) {
    const st = world.get(e, Statuses);
    if (!st || st.list.length === 0) continue;
    const hp = world.get(e, Health);
    if (hp && hp.hp <= 0) continue;

    for (let i = st.list.length - 1; i >= 0; i--) {
      const inst = st.list[i];
      const def = StatusTable.get(inst.id);
      if (!def) {
        st.list.splice(i, 1);
        continue;
      }
      inst.time -= dt;
      inst.tick -= dt;
      if (def.damagePerTick > 0 && inst.tick <= 0) {
        inst.tick = def.tickInterval;
        dealDamage(world, {
          source: null,
          target: e,
          amount: def.damagePerTick * inst.magnitude,
          kind: "dot",
          tags: [inst.id],
        });
      }
      if (inst.time <= 0) st.list.splice(i, 1);
    }
  }
}
