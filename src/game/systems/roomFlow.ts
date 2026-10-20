import type { World } from "@core/ecs/index.ts";
import { EnemyTag, Health, Position } from "../components.ts";
import { playerEntity, roomCtx, runCtx } from "../combat.ts";
import { RoomCleared } from "../events.ts";
import { boundaryWalls } from "../gen/boundary.ts";
import { DELTA, type Dir } from "../gen/floor.ts";
import { ROOM_H, ROOM_W } from "../rooms.ts";

export function roomFlowSystem(w: World): void {
  const room = roomCtx(w);
  const run = runCtx(w);
  if (!room.node) return;

  if (!room.cleared) {
    const enemies = w.query(EnemyTag, Health).collect();
    let alive = 0;
    for (const e of enemies) if ((w.get(e, Health)?.hp ?? 0) > 0) alive++;
    if (alive === 0) {
      room.cleared = true;
      room.walls = [...room.interiorWalls, ...boundaryWalls(room.doors, true)];
      if (room.node.type === "boss") run.won = true;
      w.bus.post(RoomCleared, { roomId: room.node.id, type: room.node.type });
    }
    return;
  }

  const pe = playerEntity(w);
  if (pe === undefined) return;
  const pos = w.require(pe, Position);

  for (const d of room.doors) {
    if (!isOut(d, pos)) continue;
    const [dx, dy] = DELTA[d];
    const next = { x: room.node.gx + dx, y: room.node.gy + dy };
    void next;
    room.transition = d as Dir;
    return;
  }
}

function isOut(d: Dir, pos: { x: number; y: number }): boolean {
  switch (d) {
    case "E": return pos.x > ROOM_W + 24;
    case "W": return pos.x < -24;
    case "N": return pos.y < -24;
    case "S": return pos.y > ROOM_H + 24;
  }
}
