import { defineTable, s } from "#core/db/index.ts";

/**
 * 内容表的形状定义（不含数据）。
 *
 * 单独拆出来是为了让工具链（开发 API、编辑器）能在 Node 里直接引用：
 * 数据在 content/*.json，schema 在这里，两边都不依赖浏览器。
 */
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

/** 敌人原型：数值 + 行为 id + 表现资源，全部是数据 */
export const EnemyTable = defineTable("enemies", {
  id: s.string().min(1).key(),
  name: s.string(),
  sprite: s.string(),
  hp: s.number().min(1),
  radius: s.number().min(4),
  speed: s.number().min(0),
  damage: s.number().min(0),
  behavior: s.string(),
  xp: s.number().int().min(0).default(6),
  projectileSpeed: s.number().min(0).default(0),
  projectileDamage: s.number().min(0).default(0),
  projectileInterval: s.number().min(0).default(1.7),
  projectileRange: s.number().min(0).default(900),
  chargeSpeed: s.number().min(0).default(0),
  chargeDamage: s.number().min(0).default(0),
  chargeInterval: s.number().min(0).default(3.2),
  chargeDuration: s.number().min(0).default(0.45),
  summonId: s.string().default(""),
  summonCount: s.number().int().min(0).default(0),
  /** 与目标保持的距离（0 = 不保持） */
  keepDistance: s.number().min(0).default(0),
  /** 每次开火的扇形发数 */
  fanCount: s.number().int().min(1).default(1),
  fanSpread: s.number().min(0).default(0),
  /** 环形弹幕发数（0 = 不用） */
  radialCount: s.number().int().min(0).default(0),
  /** 出手前摇（秒），0 = 瞬发 */
  telegraph: s.number().min(0).default(0),
  /** 出手后的破绽时间（秒） */
  recover: s.number().min(0).default(0),
  /** 破绽期间受到伤害的倍率 */
  exposeMul: s.number().min(1).default(1.5),
  /** 包夹半径（0 = 不参与包夹） */
  flankRadius: s.number().min(0).default(0),
});
