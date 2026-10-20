import { ROOM_W, ROOM_H, DOOR_GAP, WALL_T, type Rect } from "../rooms";
import type { Dir } from "./floor";

/**
 * 四面外墙，门所在的一侧留出缺口；门未开启时缺口被塞住（变成不可通过的墙）。
 * 这样"门"不是特判，而是普通碰撞，玩家真的一步走进门洞才触发换房。
 */
export function boundaryWalls(doors: Dir[], open: boolean): Rect[] {
  const walls: Rect[] = [];
  const half = DOOR_GAP / 2;
  const cx = ROOM_W / 2;
  const cy = ROOM_H / 2;

  const has = (d: Dir) => doors.includes(d);

  // 上
  if (!has("N")) walls.push({ x: 0, y: 0, w: ROOM_W, h: WALL_T });
  else {
    walls.push({ x: 0, y: 0, w: cx - half, h: WALL_T });
    walls.push({ x: cx + half, y: 0, w: cx - half, h: WALL_T });
    if (!open) walls.push({ x: cx - half, y: 0, w: DOOR_GAP, h: WALL_T });
  }
  // 下
  if (!has("S")) walls.push({ x: 0, y: ROOM_H - WALL_T, w: ROOM_W, h: WALL_T });
  else {
    walls.push({ x: 0, y: ROOM_H - WALL_T, w: cx - half, h: WALL_T });
    walls.push({ x: cx + half, y: ROOM_H - WALL_T, w: cx - half, h: WALL_T });
    if (!open) walls.push({ x: cx - half, y: ROOM_H - WALL_T, w: DOOR_GAP, h: WALL_T });
  }
  // 左
  if (!has("W")) walls.push({ x: 0, y: 0, w: WALL_T, h: ROOM_H });
  else {
    walls.push({ x: 0, y: 0, w: WALL_T, h: cy - half });
    walls.push({ x: 0, y: cy + half, w: WALL_T, h: cy - half });
    if (!open) walls.push({ x: 0, y: cy - half, w: WALL_T, h: DOOR_GAP });
  }
  // 右
  if (!has("E")) walls.push({ x: ROOM_W - WALL_T, y: 0, w: WALL_T, h: ROOM_H });
  else {
    walls.push({ x: ROOM_W - WALL_T, y: 0, w: WALL_T, h: cy - half });
    walls.push({ x: ROOM_W - WALL_T, y: cy + half, w: WALL_T, h: cy - half });
    if (!open) walls.push({ x: ROOM_W - WALL_T, y: cy - half, w: WALL_T, h: DOOR_GAP });
  }

  return walls;
}

/** 进门时玩家的落点：从哪一侧的门进来 */
export function entryPoint(from: Dir): { x: number; y: number } {
  switch (from) {
    case "E": return { x: ROOM_W - 150, y: ROOM_H / 2 };
    case "W": return { x: 150, y: ROOM_H / 2 };
    case "N": return { x: ROOM_W / 2, y: 150 };
    case "S": return { x: ROOM_W / 2, y: ROOM_H - 150 };
  }
}
