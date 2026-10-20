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

export const contentDb = new Database();
contentDb.register(RoomTemplates);

export function loadContent(): number {
  return contentDb.seed("roomTemplates", Object.values(TEMPLATES));
}

export function getTemplate(id: string): RoomTemplate {
  const row = RoomTemplates.get(id);
  if (!row) return TEMPLATES.open;
  return row as unknown as RoomTemplate;
}

loadContent();
