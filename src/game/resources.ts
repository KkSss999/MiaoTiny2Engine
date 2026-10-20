import type { Dir, RoomNode } from "./gen/floor";
import type { Rect } from "./rooms";

export type RoomCtx = {
  node: RoomNode | null;
  /** 当前生效的碰撞墙（含外墙，门开启后缺口不堵） */
  walls: Rect[];
  /** 模板自带的内墙，清房重算 walls 时复用 */
  interiorWalls: Rect[];
  doors: Dir[];
  cleared: boolean;
  /** roomFlow 写入，编排层在步进结束后执行换房 */
  transition: Dir | null;
};

export type RunCtx = {
  seed: number;
  kills: number;
  shots: number;
  trauma: number;
  freeze: number;
  over: boolean;
  won: boolean;
};

export type ViewCtx = { camX: number; camY: number; width: number; height: number };
export type DebugCtx = { autoAim: boolean; autoWalk: string | null };

export const ROOM = "room";
export const RUN = "run";
export const EFFECTS = "effects";
export const VIEW = "view";
export const SCOPE = "scope";
export const NAV = "nav";
export const DEBUG = "debug";

export function makeRoomCtx(): RoomCtx {
  return { node: null, walls: [], interiorWalls: [], doors: [], cleared: false, transition: null };
}

export function makeRunCtx(): RunCtx {
  return { seed: 1, kills: 0, shots: 0, trauma: 0, freeze: 0, over: false, won: false };
}