import type { Entity, World } from "@core/ecs/index.ts";
import { PlayerTag } from "./components.ts";
import { ROOM, RUN, type RoomCtx, type RunCtx } from "./resources.ts";

export function playerEntity(w: World): Entity | undefined {
  return w.query(PlayerTag).collect()[0];
}

export const roomCtx = (w: World) => w.resource<RoomCtx>(ROOM);
export const runCtx = (w: World) => w.resource<RunCtx>(RUN);
