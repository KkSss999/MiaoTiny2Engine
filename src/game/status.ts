import type { Entity, World } from "#core/ecs/index.ts";
import { Statuses, type StatusInstance } from "./components.ts";
import { StatusTable } from "#content/index.ts";

export function applyStatus(world: World, entity: Entity, id: string, magnitude = 1): void {
  const def = StatusTable.get(id);
  if (!def) return;
  if (!world.has(entity, Statuses)) world.add(entity, Statuses);
  const st = world.get(entity, Statuses);
  if (!st) return;

  const existing = st.list.find((s) => s.id === id);
  if (existing) {
    existing.time = Math.max(existing.time, def.duration);
    existing.magnitude = Math.max(existing.magnitude, magnitude);
    return;
  }
  st.list.push({ id, time: def.duration, tick: 0, magnitude });
}

export function hasStatus(world: World, entity: Entity, id: string): boolean {
  const st = world.get(entity, Statuses);
  return st ? st.list.some((s) => s.id === id) : false;
}

function statusMul(world: World, entity: Entity, pick: (def: { speedMul: number; damageTakenMul: number }) => number): number {
  const st = world.get(entity, Statuses);
  if (!st || st.list.length === 0) return 1;
  let mul = 1;
  for (const inst of st.list) {
    const def = StatusTable.get(inst.id);
    if (!def) continue;
    mul *= pick(def);
  }
  return mul;
}

/** 移速倍率（冰冻/迟缓） */
export const speedMul = (world: World, entity: Entity): number => statusMul(world, entity, (d) => d.speedMul);

/** 受伤倍率（诅咒） */
export const damageTakenMul = (world: World, entity: Entity): number =>
  statusMul(world, entity, (d) => d.damageTakenMul);

export function removeExpired(status: StatusInstance): boolean {
  return status.time <= 0;
}
