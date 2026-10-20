import { ROOM_H, ROOM_W } from "../game/rooms.ts";
import { makeRng } from "#core/rng/index.ts";

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const rng = makeRng(0x5eed1234);

export type CameraState = { x: number; y: number };

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
