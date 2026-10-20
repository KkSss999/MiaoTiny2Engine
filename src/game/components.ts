import { defineComponent } from "@core/ecs/index.ts";
import { defineShape, s } from "@core/db/index.ts";
import type { EnemyKind } from "./rooms";
import type { Race } from "./api";
import type { Layer } from "./layers";
import type { MachineData } from "@core/fsm/index.ts";

export const Position = defineComponent(
  "Position",
  () => ({ x: 0, y: 0 }),
  defineShape("Position", { x: s.number(), y: s.number() }),
);
export const Velocity = defineComponent("Velocity", () => ({ x: 0, y: 0 }));
export const Circle = defineComponent("Circle", () => ({ r: 16 }));
export const Health = defineComponent(
  "Health",
  () => ({ hp: 100, max: 100 }),
  defineShape("Health", { hp: s.number(), max: s.number() }),
);

export const PlayerTag = defineComponent("PlayerTag", () => ({
  race: "human" as Race,
  fireCd: 0,
  dashCd: 0,
  dashX: 1,
  dashY: 0,
  dashes: 2,
  maxDashes: 2,
  invuln: 0,
  heat: 0,
  souls: 0,
  overheated: false,
  revived: false,
}));

export const Aim = defineComponent("Aim", () => ({ angle: 0 }));

export const EnemyTag = defineComponent("EnemyTag", () => ({
  kind: "melee" as EnemyKind,
  speed: 0,
  cd: 0,
  flash: 0,
}));

/** 行为状态机：纯数据，可序列化 */
export const Brain = defineComponent<MachineData>(
  "Brain",
  () => ({ state: "", time: 0, stack: [], triggers: [] }),
  defineShape("Brain", {
    state: s.string(),
    time: s.number(),
    stack: s.array(s.object({ state: s.string(), time: s.number() })),
    triggers: s.array(s.string()),
  }),
);

export const BulletTag = defineComponent("BulletTag", () => ({
  dmg: 12,
  friendly: true,
  life: 1.6,
  speed: 900,
  affix: "",
  pierce: 0,
  aoeRadius: 0,
  aoeDamage: 0,
}));

export const PropTag = defineComponent("PropTag", () => ({
  kind: "barrel" as "barrel" | "crystal",
  hp: 30,
}));

/** 表现层引用：逻辑只说要什么，怎么画由 render 层决定 */
export const SpriteRef = defineComponent("SpriteRef", () => ({
  spriteId: "debug.box",
  layer: "actor" as Layer,
  rotation: "none" as "none" | "aim" | "velocity",
  scale: 1,
  /** 出现时是否播弹出动画（表现层读取） */
  popIn: false,
  /** 覆盖颜色（null = 用资源原色） */
  tint: null as number | null,
}));
/** 状态效果：燃烧 / 冰冻 / 诅咒…… 一个组件装全部实例 */
export type StatusInstance = { id: string; time: number; tick: number; magnitude: number };

export const Statuses = defineComponent(
  "Statuses",
  () => ({ list: [] as StatusInstance[] }),
  defineShape("Statuses", {
    list: s.array(
      s.object({
        id: s.string(),
        time: s.number(),
        tick: s.number(),
        magnitude: s.number().min(0),
      }),
    ),
  }),
);

export const Level = defineComponent(
  "Level",
  () => ({ level: 1, xp: 0, next: 20 }),
  defineShape("Level", {
    level: s.number().int().min(1),
    xp: s.number().min(0),
    next: s.number().int().min(1),
  }),
);

export type SkillSlot = { id: string; cd: number };

export const Skills = defineComponent(
  "Skills",
  () => ({ list: [] as SkillSlot[] }),
  defineShape("Skills", {
    list: s.array(s.object({ id: s.string(), cd: s.number().min(0) })),
  }),
);
/** 携带的武器：最多两把，active 指向当前手里那把 */
export type WeaponSlot = { weaponId: string; affixId: string };

export const Loadout = defineComponent(
  "Loadout",
  () => ({ slots: [] as WeaponSlot[], active: 0, cd: 0 }),
  defineShape("Loadout", {
    slots: s.array(s.object({ weaponId: s.string(), affixId: s.string() })),
    active: s.number().int().min(0),
    cd: s.number().min(0),
  }),
);

/** 地上的武器掉落 */
export const Pickup = defineComponent(
  "Pickup",
  () => ({ weaponId: "", affixId: "" }),
  defineShape("Pickup", { weaponId: s.string(), affixId: s.string() }),
);

/** 魂火灯一类的放置物 */
export const Totem = defineComponent(
  "Totem",
  () => ({ radius: 120, damage: 6, interval: 0.5, tick: 0, time: 6 }),
  defineShape("Totem", {
    radius: s.number().min(0),
    damage: s.number().min(0),
    interval: s.number().min(0.05),
    tick: s.number(),
    time: s.number(),
  }),
);

/** 被击退：速度衰减 */
export const Knock = defineComponent(
  "Knock",
  () => ({ x: 0, y: 0, time: 0 }),
  defineShape("Knock", { x: s.number(), y: s.number(), time: s.number().min(0) }),
);
/** 已装备的植入体/刻印 */
export const Implants = defineComponent(
  "Implants",
  () => ({ ids: [] as string[], cds: [] as { id: string; cd: number }[] }),
  defineShape("Implants", {
    ids: s.array(s.string()),
    cds: s.array(s.object({ id: s.string(), cd: s.number().min(0) })),
  }),
);

/** 护盾：先于血量吸收伤害 */
export const Shield = defineComponent(
  "Shield",
  () => ({ value: 40, max: 40, timer: 0 }),
  defineShape("Shield", {
    value: s.number().min(0),
    max: s.number().min(0),
    timer: s.number().min(0),
  }),
);
