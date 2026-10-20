import { ROOM_H, ROOM_W } from "../game/rooms.ts";
import { makeRng } from "#core/kernel/index.ts";

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const rng = makeRng(0x5eed1234);

export type CameraState = { x: number; y: number };

/**
 * 固定的世界可视高度（世界单位）。
 * 不管窗口多大，玩家看到的纵向范围一致，难度才不会被显示器改变。
 */
export const VIEW_HEIGHT = 640;

/**
 * 视图缩放 = 屏幕高度 / 固定可视高度。
 * 现阶段用小数（所有窗口看到同样大的范围）；
 * 等真像素美术进来后如果要「整数倍 + 黑边」，改这一处即可。
 */
export const viewZoom = (screenHeight: number): number =>
  Math.max(1, Math.min(4, screenHeight / VIEW_HEIGHT));

/** UI 缩放：HUD / 屏幕空间文字跟着窗口高度走 */
export const uiScale = (screenHeight: number): number =>
  // 下限设 1：小窗口不缩 HUD，否则字会小到看不清
  Math.max(1, Math.min(1.8, screenHeight / 900));

/** 跟随玩家并夹在房间内 */
export function followCamera(px: number, py: number, vw: number, vh: number): CameraState {
  return {
    x: clamp(px - vw / 2, 0, Math.max(0, ROOM_W - vw)),
    y: clamp(py - vh / 2, 0, Math.max(0, ROOM_H - vh)),
  };
}

/** 用 trauma 的平方做抖动，衰减更自然；随机走独立流，不污染玩法 */
export function shakeOffset(trauma: number): CameraState {
  const s = trauma * trauma;
  if (s <= 0.0001) return { x: 0, y: 0 };
  return {
    x: (rng.next() * 2 - 1) * s * 26,
    y: (rng.next() * 2 - 1) * s * 26,
  };
}