import type { World } from "#core/ecs/index.ts";
import { Health, Implants, Level, Loadout, PlayerTag, Shield, Skills } from "../components.ts";
import { IMPLANTS } from "../implants.ts";
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
    implants: (w.get(pe, Implants)?.ids ?? []).map((id) => IMPLANTS[id]?.name ?? id).join(" · "),
    shield: Math.round(w.get(pe, Shield)?.value ?? 0),
    shieldMax: Math.round(w.get(pe, Shield)?.max ?? 0),
    skillName: skill?.name ?? "",
    // 保留一位小数：float 每帧都在变，会让 HUD 每帧重渲染
    skillCd: Math.round((first?.cd ?? 0) * 10) / 10,
    skillCdMax: skill?.cooldown ?? 1,
    over: run.over,
    won: run.won,
  });
}