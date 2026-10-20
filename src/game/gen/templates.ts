import { ROOM_W, ROOM_H, type Rect, type Spawn, type PropSpawn, type EnemyKind } from "../rooms.ts";
import type { Dir, RoomType } from "./floor.ts";
import type { Rng } from "#core/kernel/index.ts";
import { getTemplate } from "#content/index.ts";

export type { Slot, RoomTemplate } from "./templateData.ts";
export { TEMPLATES } from "./templateData.ts";

export type RoomBuild = { walls: Rect[]; spawns: Spawn[]; props: PropSpawn[] };

const LANE = 340;
const LANE_HALF = 150;

function doorLanes(doors: Dir[]): Rect[] {
  const cx = ROOM_W / 2 - LANE_HALF;
  const cy = ROOM_H / 2 - LANE_HALF;
  const lanes: Rect[] = [];
  for (const d of doors) {
    if (d === "E") lanes.push({ x: ROOM_W - LANE, y: cy, w: LANE, h: LANE_HALF * 2 });
    if (d === "W") lanes.push({ x: 0, y: cy, w: LANE, h: LANE_HALF * 2 });
    if (d === "N") lanes.push({ x: cx, y: 0, w: LANE_HALF * 2, h: LANE });
    if (d === "S") lanes.push({ x: cx, y: ROOM_H - LANE, w: LANE_HALF * 2, h: LANE });
  }
  return lanes;
}

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** 生成房间内部：模板 → 镜像/抖动/删减 → 门通道保护 → 散布障碍 */
export function buildRoom(templateId: string, doors: Dir[], rng: Rng, type: RoomType): RoomBuild {
  const tpl = getTemplate(templateId);
  const flipX = rng.chance(0.5);
  const flipY = rng.chance(0.5);
  const lanes = doorLanes(doors);

  const mapRect = (r: Rect): Rect => ({
    x: flipX ? ROOM_W - r.x - r.w : r.x,
    y: flipY ? ROOM_H - r.y - r.h : r.y,
    w: r.w,
    h: r.h,
  });

  const walls: Rect[] = [];
  for (const w of tpl.walls) {
    if (rng.chance(tpl.dropChance ?? 0.15)) continue;
    const r = mapRect(w);
    const jittered = {
      x: r.x + rng.int(-14, 14),
      y: r.y + rng.int(-14, 14),
      w: r.w,
      h: r.h,
    };
    if (lanes.some((l) => overlap(jittered, l))) continue;
    if (jittered.x < 120 || jittered.y < 120) continue;
    if (jittered.x + jittered.w > ROOM_W - 120 || jittered.y + jittered.h > ROOM_H - 120) continue;
    walls.push(roundRect(jittered));
  }

  // 散布障碍：在空地上撒小箱子，保持门到中心的可走性
  const scatterCount = type === "boss" ? 0 : type === "start" ? 2 : rng.int(3, 7);
  const blocked = (r: Rect) =>
    lanes.some((l) => overlap(r, l)) || walls.some((w) => overlap(r, w)) ||
    Math.hypot(r.x + r.w / 2 - ROOM_W / 2, r.y + r.h / 2 - ROOM_H / 2) < 210;

  for (let i = 0; i < scatterCount; i++) {
    for (let tries = 0; tries < 20; tries++) {
      const size = rng.int(60, 110);
      const cand: Rect = {
        x: rng.int(180, ROOM_W - 180 - size),
        y: rng.int(180, ROOM_H - 180 - size),
        w: size,
        h: size,
      };
      if (blocked(cand)) continue;
      walls.push(roundRect(cand));
      break;
    }
  }

  const spawns: Spawn[] = [];
  const props: PropSpawn[] = [];
  const enemyCap = type === "start" || type === "shop" || type === "rest" || type === "boss" ? 0 : type === "elite" ? 99 : 3;

  for (const s of tpl.slots) {
    const p = {
      x: flipX ? ROOM_W - s.x : s.x,
      y: flipY ? ROOM_H - s.y : s.y,
    };
    const jx = clampNum(p.x + rng.int(-40, 40), 140, ROOM_W - 140);
    const jy = clampNum(p.y + rng.int(-40, 40), 140, ROOM_H - 140);
    if (s.kind === "enemy") {
      if (spawns.length >= enemyCap) continue;
      if (walls.some((w) => overlap(w, { x: jx - 20, y: jy - 20, w: 40, h: 40 }))) continue;
      spawns.push({ x: jx, y: jy, kind: rng.chance(0.65) ? "melee" : "charger" });
    } else {
      if (!rng.chance(0.75)) continue;
      if (walls.some((w) => overlap(w, { x: jx - 26, y: jy - 26, w: 52, h: 52 }))) continue;
      props.push({ x: jx, y: jy, kind: s.kind === "barrel" ? "barrel" : "crystal" });
    }
  }

  // 精英房追加两个敌人
  if (type === "elite") {
    while (spawns.length < 5) {
      const cand = { x: rng.int(300, ROOM_W - 300), y: rng.int(300, ROOM_H - 300) };
      if (walls.some((w) => overlap(w, { x: cand.x - 20, y: cand.y - 20, w: 40, h: 40 }))) continue;
      spawns.push({ x: cand.x, y: cand.y, kind: rng.chance(0.3) ? "turret" : rng.chance(0.4) ? "sentry" : rng.chance(0.5) ? "charger" : "melee" });
    }
  }

  return { walls, spawns, props };
}

function roundRect(r: Rect): Rect {
  return { x: Math.round(r.x / 10) * 10, y: Math.round(r.y / 10) * 10, w: Math.round(r.w / 10) * 10, h: Math.round(r.h / 10) * 10 };
}

const clampNum = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export type { EnemyKind };