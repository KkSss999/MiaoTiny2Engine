import type { Entity, World } from "@core/ecs/index.ts";
import type { Race } from "./api.ts";
import { Health, Implants, PlayerTag } from "./components.ts";
import { allAffixes, allWeapons, getAffix, getWeapon } from "./content.ts";
import { IMPLANTS, addImplant, implantPool } from "./implants.ts";
import { equip } from "./systems/weapons.ts";

export type RewardOption =
  | { kind: "weapon"; weaponId: string; affixId: string; name: string; desc: string }
  | { kind: "implant"; implantId: string; name: string; desc: string }
  | { kind: "heal"; name: string; desc: string };

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
const shuffle = <T,>(list: T[]): T[] => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/**
 * 三选一：武器 / 未装备的植入体 / 治疗。
 * 优先保证至少一个植入体选项（如果还有槽位空着）。
 */
export function buildRewards(world: World, race: Race): RewardOption[] {
  const player = world.query(PlayerTag).collect()[0];
  const owned = player === undefined ? [] : (world.get(player, Implants)?.ids ?? []);
  const pool = implantPool(race).filter((id) => !owned.includes(id));

  const options: RewardOption[] = [];

  if (pool.length > 0) {
    const id = pick(pool);
    const def = IMPLANTS[id];
    options.push({ kind: "implant", implantId: id, name: def.name, desc: def.desc });
  }

  const weapons = shuffle(allWeapons()).slice(0, 2);
  const affixes = allAffixes();
  for (const weapon of weapons) {
    const affix = pick(affixes);
    options.push({
      kind: "weapon",
      weaponId: weapon.id,
      affixId: affix.id,
      name: `${weapon.name} · ${affix.name}`,
      desc: `伤害 ${weapon.damage} · 冷却 ${weapon.cooldown}s`,
    });
  }

  if (options.length < 3) {
    options.push({ kind: "heal", name: "应急修复", desc: "回复 40% 生命" });
  }
  return options.slice(0, 3);
}

export function applyReward(world: World, player: Entity, option: RewardOption): void {
  if (option.kind === "weapon") {
    equip(world, player, option.weaponId, option.affixId);
    return;
  }
  if (option.kind === "implant") {
    addImplant(world, player, option.implantId);
    return;
  }
  const hp = world.get(player, Health);
  if (hp) hp.hp = Math.min(hp.max, hp.hp + hp.max * 0.4);
}

export function rewardLabel(option: RewardOption): string {
  if (option.kind === "weapon") return getWeapon(option.weaponId)?.name ?? option.name;
  if (option.kind === "implant") return IMPLANTS[option.implantId]?.name ?? option.name;
  return option.name;
}

export const rewardAffix = (option: RewardOption): string =>
  option.kind === "weapon" ? (getAffix(option.affixId)?.name ?? "") : "";
