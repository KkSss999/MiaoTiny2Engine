import type { World } from "@core/ecs/index.ts";
import { Health, PlayerTag } from "../components.ts";
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
    over: run.over,
    won: run.won,
  });
}
