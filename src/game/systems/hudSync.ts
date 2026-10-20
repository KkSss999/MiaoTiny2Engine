import type { World } from "@core/ecs/index.ts";
import { Health, Level, Loadout, PlayerTag, Skills } from "../components.ts";
import { getAffix, getWeapon } from "../content.ts";
import { SKILLS } from "../skills.ts";
import { playerEntity, roomCtx, runCtx } from "../combat.ts";
import { hud } from "../store.ts";

const TYPE_LABEL: Record<string, string> = {
  start: "起点",
  combat: "战斗",
  elite: "精英",
  shop: "商店",
  event: "事件",
  rest: "休息",
  boss: "BOSS",
};

export function hudSyncSystem(w: World, visited: () => number): void {
  const pe = playerEntity(w);
  const room = roomCtx(w);
  const run = runCtx(w);
  if (pe === undefined) return;
  const pt = w.require(pe, PlayerTag);
  const hp = w.require(pe, Health);
  const lv = w.get(pe, Level);
  const slots = w.get(pe, Skills);
  const lo = w.get(pe, Loadout);
  const slotsList = lo?.slots ?? [];
  const slotName = (i: number) => (slotsList[i] ? (getWeapon(slotsList[i].weaponId)?.name ?? "") : "");
  const slotAffix = (i: number) => (slotsList[i] ? (getAffix(slotsList[i].affixId)?.name ?? "") : "");
  const first = slots?.list[0];
  const skill = first ? SKILLS[first.id] : undefined;

  hud.patch({
    hp: Math.max(0, Math.round(hp.hp)),
    maxHp: hp.max,
    heat: Math.round(pt.heat),
    souls: Math.round(pt.souls),
    dashes: pt.dashes,
    maxDashes: pt.maxDashes,
    race: pt.race,
    kills: run.kills,
    seed: run.seed,
    roomType: room.node ? TYPE_LABEL[room.node.type] ?? room.node.type : "",
    room: visited(),
    level: lv?.level ?? 1,
    xp: lv?.xp ?? 0,
    xpNext: lv?.next ?? 20,
    weapon1: slotName(0),
    affix1: slotAffix(0),
    weapon2: slotName(1),
    affix2: slotAffix(1),
    activeSlot: lo?.active ?? 0,
    skillName: skill?.name ?? "",
    skillCd: first?.cd ?? 0,
    skillCdMax: skill?.cooldown ?? 1,
    over: run.over,
    won: run.won,
  });
}