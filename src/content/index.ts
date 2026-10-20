import { Database } from "#core/db/index.ts";
import { TEMPLATES, type RoomTemplate } from "../game/gen/templateData.ts";
import { AffixTable, AnimationTable, EnemyTable, RoomTemplates, StatusTable, WeaponTable } from "./schema.ts";

import weaponsJson from "../../content/weapons.json" with { type: "json" };
import enemiesJson from "../../content/enemies.json" with { type: "json" };
import affixesJson from "../../content/affixes.json" with { type: "json" };
import statusesJson from "../../content/statuses.json" with { type: "json" };
import animationsJson from "../../content/animations.json" with { type: "json" };

// 表定义从这里转发，老的 `from "#content/index.ts"` 引用不用改
export { AffixTable, AnimationTable, EnemyTable, RoomTemplates, StatusTable, WeaponTable };

/** 内容数据：改 JSON 即可，不用改代码 */
export const CONTENT = {
  weapons: weaponsJson,
  enemies: enemiesJson,
  affixes: affixesJson,
  statuses: statusesJson,
  animations: animationsJson,
};

export const contentDb = new Database();
contentDb.register(RoomTemplates);
contentDb.register(StatusTable);
contentDb.register(WeaponTable);
contentDb.register(AffixTable);
contentDb.register(EnemyTable);
contentDb.register(AnimationTable);

let loaded = false;

/** 内容表入库。幂等：测试里反复建世界也只灌一次。 */
export function loadContent(): number {
  if (loaded) return 0;
  loaded = true;
  let n = contentDb.seed("roomTemplates", Object.values(TEMPLATES));
  n += contentDb.seed("enemies", CONTENT.enemies);
  n += contentDb.seed("statuses", CONTENT.statuses);
  n += contentDb.seed("weapons", CONTENT.weapons);
  n += contentDb.seed("affixes", CONTENT.affixes);
  n += contentDb.seed("animations", CONTENT.animations);
  return n;
}

// 模块加载即入库：内容表是只读数据，早点失败比运行时炸好
loadContent();

/**
 * 开发期热更新：把编辑器改动直接应用到运行中的内容表。
 * 只接受已注册的表，走 schema 校验（update 内部会 parse）。
 */
export function applyContentPatch(table: string, row: Record<string, unknown>): boolean {
  const known: Record<string, { update: (key: string, patch: unknown) => unknown; has: (key: string) => boolean }> = {
    weapons: WeaponTable as never,
    enemies: EnemyTable as never,
    affixes: AffixTable as never,
    statuses: StatusTable as never,
  };
  const def = known[table];
  if (!def) return false;
  const id = String(row.id ?? "");
  if (!id || !def.has(id)) return false;
  def.update(id, row);
  return true;
}

export type AnimationClip = {
  id: string;
  sheet: string;
  frames: number[];
  fps: number;
  loop: boolean;
};

export const getClip = (id: string): AnimationClip | undefined => AnimationTable.get(id) as AnimationClip | undefined;
export const allClips = (): AnimationClip[] => AnimationTable.list() as AnimationClip[];

export function getTemplate(id: string): RoomTemplate {
  const row = RoomTemplates.get(id);
  if (!row) return TEMPLATES.open;
  return row as unknown as RoomTemplate;
}

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

export type EnemyDef = {
  id: string;
  name: string;
  sprite: string;
  hp: number;
  radius: number;
  speed: number;
  damage: number;
  behavior: string;
  xp: number;
  projectileSpeed: number;
  projectileDamage: number;
  projectileInterval: number;
  projectileRange: number;
  chargeSpeed: number;
  chargeDamage: number;
  chargeInterval: number;
  chargeDuration: number;
  summonId: string;
  summonCount: number;
  keepDistance: number;
  fanCount: number;
  fanSpread: number;
  radialCount: number;
  telegraph: number;
  recover: number;
  exposeMul: number;
  flankRadius: number;
};

export const getEnemy = (id: string): EnemyDef | undefined => EnemyTable.get(id) as EnemyDef | undefined;
export const allEnemies = (): EnemyDef[] => EnemyTable.list() as EnemyDef[];