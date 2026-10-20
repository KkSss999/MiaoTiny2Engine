import type { Entity, World } from "@core/ecs/index.ts";
import { Aim, Loadout, Pickup, Position, type WeaponSlot } from "../components.ts";
import { allAffixes, allWeapons, getWeapon } from "../content.ts";
import { input } from "../input.ts";
import { effects } from "../combat.ts";
import { playerEntity, runCtx } from "../query.ts";
import { fireWeapon } from "../weapons.ts";

export function currentSlot(world: World, player: Entity): WeaponSlot | undefined {
  const lo = world.get(player, Loadout);
  if (!lo) return undefined;
  return lo.slots[lo.active];
}

export function equip(world: World, player: Entity, weaponId: string, affixId: string): void {
  const lo = world.get(player, Loadout);
  if (!lo) return;
  if (lo.slots.length < 2) {
    lo.slots.push({ weaponId, affixId });
    lo.active = lo.slots.length - 1;
    return;
  }
  lo.slots[lo.active] = { weaponId, affixId };
}

export function rollDrop(): WeaponSlot {
  const weapons = allWeapons();
  const affixes = allAffixes();
  const weapon = weapons[Math.floor(Math.random() * weapons.length)];
  const affix = affixes[Math.floor(Math.random() * affixes.length)];
  return { weaponId: weapon.id, affixId: affix.id };
}

/** 开火 / 切枪 / 拾取 */
export function weaponsSystem(world: World, dt: number): void {
  const player = playerEntity(world);
  if (player === undefined) return;

  const lo = world.get(player, Loadout);
  const pos = world.get(player, Position);
  const aim = world.get(player, Aim);
  if (!lo || !pos || !aim) return;

  lo.cd = Math.max(0, lo.cd - dt);

  const run = runCtx(world);
  if (run.over || run.won) return;

  // 切枪
  if (input.consume("KeyQ") && lo.slots.length > 1) {
    lo.active = (lo.active + 1) % lo.slots.length;
    lo.cd = Math.max(lo.cd, 0.2);
  }

  const slot = lo.slots[lo.active];
  const weapon = slot ? getWeapon(slot.weaponId) : undefined;
  if (weapon && input.down && lo.cd <= 0) {
    lo.cd = weapon.cooldown;
    fireWeapon({
      world,
      player,
      x: pos.x,
      y: pos.y,
      angle: aim.angle,
      weapon,
      affixId: slot.affixId,
    });
  }

  // 拾取
  for (const e of world.query(Pickup, Position).collect()) {
    const p = world.get(e, Position);
    const pick = world.get(e, Pickup);
    if (!p || !pick) continue;
    if (Math.hypot(p.x - pos.x, p.y - pos.y) > 44) continue;
    equip(world, player, pick.weaponId, pick.affixId);
    world.commands.despawn(e);
    effects(world).push({ type: "burst", x: p.x, y: p.y, color: 0xffd166, count: 10, speed: 240 });
  }
}