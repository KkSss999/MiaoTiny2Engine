export const ROOM_W = 1800;
export const ROOM_H = 1100;
/** 门洞宽度 */
export const DOOR_GAP = 170;
/** 外墙厚度 */
export const WALL_T = 44;

export type { Rect } from "#content/templates.ts";
/** 敌人原型 id（见 enemies 表） */
export type EnemyKind = string;
export type Spawn = { x: number; y: number; kind: EnemyKind };
export type PropSpawn = { x: number; y: number; kind: "barrel" | "crystal" };