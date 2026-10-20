import type { Entity } from "#core/ecs/index.ts";
import type { World } from "#core/ecs/index.ts";
import { Position } from "../components.ts";
import { buildNav, cellIndexOf, computeFlow, type NavGrid } from "#core/nav/index.ts";
import { playerEntity, roomCtx } from "../query.ts";
import { NAV } from "../resources.ts";
import { ROOM_H, ROOM_W } from "../rooms.ts";

/**
 * 每帧维护导航场：
 * - 换房间重建格子（墙变了）
 * - 玩家跨格才重算流场
 */
export function navSystem(world: World): void {
  const room = roomCtx(world);
  if (!room.node) return;

  let nav = world.tryResource<NavGrid>(NAV);
  if (!nav || nav.roomId !== room.node.id) {
    nav = buildNav([...room.walls, ...room.interiorWalls], ROOM_W, ROOM_H);
    nav.roomId = room.node.id;
    world.setResource(NAV, nav);
  }

  const player: Entity | undefined = playerEntity(world);
  if (player === undefined) return;
  const pos = world.get(player, Position);
  if (!pos) return;

  if (cellIndexOf(nav, pos.x, pos.y) !== nav.startCell) computeFlow(nav, pos.x, pos.y);
}
