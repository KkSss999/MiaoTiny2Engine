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

const WEAPONS = [
  { id: "nailgun", name: "钉枪", behavior: "slug", damage: 8, cooldown: 0.12, pellets: 1, spread: 0.02, speed: 1000, range: 600, knockback: 0, color: 0xffd166, size: 4 },
  { id: "shotgun", name: "霰弹枪", behavior: "spread", damage: 5, cooldown: 0.75, pellets: 6, spread: 0.32, speed: 780, range: 420, knockback: 30, color: 0xffb347, size: 5 },
  { id: "chainsaw", name: "电锯", behavior: "saw", damage: 9, cooldown: 0.12, pellets: 1, spread: 0, speed: 0, range: 95, knockback: 40, color: 0xc9a227, size: 6 },
  { id: "runestaff", name: "符文法杖", behavior: "rail", damage: 14, cooldown: 0.5, pellets: 1, spread: 0, speed: 700, range: 700, knockback: 0, color: 0x9b6bff, size: 6 },
  { id: "hexgrenade", name: "咒术手雷", behavior: "lob", damage: 40, cooldown: 1.3, pellets: 1, spread: 0, speed: 420, range: 320, knockback: 0, color: 0x39e0c8, size: 7 },
  { id: "spear", name: "附魔长矛", behavior: "arc", damage: 16, cooldown: 0.35, pellets: 1, spread: 0.5, speed: 0, range: 140, knockback: 60, color: 0xd7263d, size: 5 },
  { id: "railgun", name: "电磁步枪", behavior: "rail", damage: 26, cooldown: 0.45, pellets: 1, spread: 0, speed: 1400, range: 900, knockback: 20, color: 0x66ccff, size: 5 },
  { id: "hammer", name: "外骨骼重锤", behavior: "arc", damage: 28, cooldown: 0.8, pellets: 1, spread: 1.1, speed: 0, range: 120, knockback: 220, color: 0xffa000, size: 6 },
  { id: "minigun", name: "便携机枪", behavior: "auto", damage: 5, cooldown: 0.06, pellets: 1, spread: 0.12, speed: 950, range: 600, knockback: 0, color: 0xffd166, size: 3 },
  { id: "scythe", name: "骨镰", behavior: "arc", damage: 20, cooldown: 0.55, pellets: 1, spread: 1.4, speed: 0, range: 130, knockback: 80, color: 0x39e0c8, size: 5 },
  { id: "soullamp", name: "魂火灯", behavior: "totem", damage: 6, cooldown: 1.6, pellets: 1, spread: 0, speed: 0, range: 120, knockback: 0, color: 0x39e0c8, size: 8 },
  { id: "watch", name: "诅咒怀表", behavior: "lob", damage: 24, cooldown: 1.0, pellets: 1, spread: 0, speed: 380, range: 300, knockback: 0, color: 0xb4552d, size: 6 },
];

const AFFIXES = [
  { id: "burn", name: "燃烧", power: 1 },
  { id: "freeze", name: "冰冻", power: 1 },
  { id: "chain", name: "连锁闪电", power: 1 },
  { id: "lifesteal", name: "吸血", power: 1 },
  { id: "curse", name: "诅咒", power: 1 },
  { id: "knockback", name: "击退", power: 1 },
];

export const CONTENT = {
  weapons: WEAPONS,
  affixes: AFFIXES,
  statuses: [
    { id: "burn", name: "燃烧", duration: 3, damagePerTick: 2, tickInterval: 0.5, speedMul: 1, damageTakenMul: 1 },
    { id: "freeze", name: "冰冻", duration: 2, damagePerTick: 0, tickInterval: 0.5, speedMul: 0.45, damageTakenMul: 1 },
    { id: "curse", name: "诅咒", duration: 5, damagePerTick: 0, tickInterval: 0.5, speedMul: 1, damageTakenMul: 1.3 },
  ],
};

/** 武器表：行为 + 数值。加武器 = 加一行 */
export const WeaponTable = defineTable("weapons", {
  id: s.string().min(1).key(),
  name: s.string(),
  behavior: s.string(),
  damage: s.number().min(0),
  cooldown: s.number().min(0.02),
  pellets: s.number().int().min(1).default(1),
  spread: s.number().min(0).default(0),
  speed: s.number().min(0).default(900),
  range: s.number().min(0).default(600),
  knockback: s.number().min(0).default(0),
  color: s.number().int().min(0),
  size: s.number().min(1).default(4),
});

/** 词条表：命中时触发的效果 id */
export const AffixTable = defineTable("affixes", {
  id: s.string().min(1).key(),
  name: s.string(),
  power: s.number().min(0).default(1),
});

export const contentDb = new Database();
contentDb.register(RoomTemplates);
contentDb.register(StatusTable);
contentDb.register(WeaponTable);
contentDb.register(AffixTable);

export function loadContent(): number {
  let n = contentDb.seed("roomTemplates", Object.values(TEMPLATES));
  n += contentDb.seed("statuses", CONTENT.statuses);
  n += contentDb.seed("weapons", CONTENT.weapons);
  n += contentDb.seed("affixes", CONTENT.affixes);
  return n;
}

export function getTemplate(id: string): RoomTemplate {
  const row = RoomTemplates.get(id);
  if (!row) return TEMPLATES.open;
  return row as unknown as RoomTemplate;
}

loadContent();
export type WeaponRow = {
  id: string;
  name: string;
  behavior: string;
  damage: number;
  cooldown: number;
  pellets: number;
  spread: number;
  speed: number;
  range: number;
  knockback: number;
  color: number;
  size: number;
};

export const getWeapon = (id: string): WeaponRow | undefined => WeaponTable.get(id) as WeaponRow | undefined;
export const allWeapons = (): WeaponRow[] => WeaponTable.list() as WeaponRow[];
export const getAffix = (id: string) => AffixTable.get(id);
export const allAffixes = () => AffixTable.list();
