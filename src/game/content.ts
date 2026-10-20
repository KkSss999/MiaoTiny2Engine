import { Database, defineTable, s } from "@core/db/index.ts";
import { TEMPLATES, type RoomTemplate } from "./gen/templateData.ts";

/**
 * 内容表：房间模板。启动时 seed，schema 不合格直接抛，别等到运行时炸。
 * 以后武器、词条、植入体都往这里加表。
 */
export const RoomTemplates = defineTable("roomTemplates", {
  id: s.string().min(1).key(),
  walls: s.array(s.object({ x: s.number(), y: s.number(), w: s.number().min(0), h: s.number().min(0) })),
  slots: s.array(
    s.object({
      x: s.number(),
      y: s.number(),
      kind: s.enumOf(["enemy", "barrel", "crystal"] as const),
    }),
  ),
  dropChance: s.number().min(0).max(1).optional(),
});

/** 状态效果表：燃烧 / 冰冻 / 诅咒 */
export const StatusTable = defineTable("statuses", {
  id: s.string().min(1).key(),
  name: s.string(),
  duration: s.number().min(0),
  damagePerTick: s.number().min(0).default(0),
  tickInterval: s.number().min(0.05).default(0.5),
  speedMul: s.number().min(0).max(1).default(1),
  damageTakenMul: s.number().min(1).default(1),
});

export const CONTENT = {
  statuses: [
    { id: "burn", name: "燃烧", duration: 3, damagePerTick: 2, tickInterval: 0.5, speedMul: 1, damageTakenMul: 1 },
    { id: "freeze", name: "冰冻", duration: 2, damagePerTick: 0, tickInterval: 0.5, speedMul: 0.45, damageTakenMul: 1 },
    { id: "curse", name: "诅咒", duration: 5, damagePerTick: 0, tickInterval: 0.5, speedMul: 1, damageTakenMul: 1.3 },
  ],
};

export const contentDb = new Database();
contentDb.register(RoomTemplates);
contentDb.register(StatusTable);

export function loadContent(): number {
  let n = contentDb.seed("roomTemplates", Object.values(TEMPLATES));
  n += contentDb.seed("statuses", CONTENT.statuses);
  return n;
}

export function getTemplate(id: string): RoomTemplate {
  const row = RoomTemplates.get(id);
  if (!row) return TEMPLATES.open;
  return row as unknown as RoomTemplate;
}

loadContent();