import { EntityScope, type World } from "@core/ecs/index.ts";
import type { Lifetime } from "@core/event/index.ts";
import { DELTA, OPPOSITE, generateFloor, type Dir, type Floor, type RoomNode, type RoomType } from "../gen/floor.ts";
import { buildRoom } from "../gen/templates.ts";
import { boundaryWalls, entryPoint } from "../gen/boundary.ts";
import { makeRng } from "../gen/prng.ts";
import { ROOM_H, ROOM_W } from "../rooms.ts";
import { PlayerTag, Position } from "../components.ts";
import { playerEntity, roomCtx } from "../combat.ts";
import { spawnEnemy, spawnProp } from "../entities/factory.ts";
import { RoomEntered } from "../events.ts";

const SAFE: RoomType[] = ["start", "shop", "rest", "event"];

/**
 * 世界/楼层协调器。
 *
 * 不是原子层：它就是「楼层图（数据）+ 当前房间作用域（资源）+ 已清状态（数据）」的组合。
 * 自己不留资源，所以不需要独立生命周期 —— 只借用 run 的 Lifetime 来装房间作用域。
 */
export class WorldManager {
  private world: World;
  private runLife: Lifetime;
  private rooms = new Map<string, { cleared: boolean }>();
  private scope: EntityScope | null = null;
  private _floor: Floor | null = null;
  private _current: RoomNode | null = null;
  private _visited = 0;

  constructor(world: World, runLife: Lifetime) {
    this.world = world;
    this.runLife = runLife;
  }

  get floor(): Floor | null {
    return this._floor;
  }

  get current(): RoomNode | null {
    return this._current;
  }

  get visited(): number {
    return this._visited;
  }

  get roomScope(): EntityScope | null {
    return this.scope;
  }

  /** 开新的一局：重新生成楼层，清空访问状态 */
  begin(seed: number): void {
    this.scope?.dispose();
    this.scope = null;
    this._floor = generateFloor(seed);
    this._current = null;
    this.rooms.clear();
    this._visited = 0;
  }

  neighbor(dir: Dir): RoomNode | null {
    const cur = this._current;
    if (!cur || !this._floor) return null;
    const [dx, dy] = DELTA[dir];
    return this._floor.nodes.find((n) => n.gx === cur.gx + dx && n.gy === cur.gy + dy) ?? null;
  }

  /** 进入房间：销毁上一间的作用域，装新的 */
  enter(id: string, traveled: Dir | null): void {
    const floor = this._floor;
    if (!floor) return;
    const node = floor.nodes.find((n) => n.id === id);
    if (!node) return;

    const w = this.world;
    const room = roomCtx(w);

    this.scope?.dispose();
    this.scope = w.createScope(this.runLife);

    const rng = makeRng(hashId(floor.seed, id));
    const build = buildRoom(floor.templateOf[id] ?? "open", node.doors, rng, node.type);
    const safe = SAFE.includes(node.type);

    let entry = this.rooms.get(id);
    if (!entry) {
      entry = { cleared: safe };
      this.rooms.set(id, entry);
      this._visited++;
    }

    this._current = node;
    room.node = node;
    room.doors = node.doors;
    room.interiorWalls = build.walls;
    room.cleared = entry.cleared;
    room.transition = null;
    room.walls = [...build.walls, ...boundaryWalls(node.doors, room.cleared)];

    for (const pr of build.props) spawnProp(w, this.scope, pr.kind, pr.x, pr.y);
    if (!room.cleared) {
      for (const s of build.spawns) spawnEnemy(w, this.scope, s.kind, s.x, s.y);
      if (node.type === "boss") spawnEnemy(w, this.scope, "boss", ROOM_W / 2, ROOM_H / 2);
    }

    const pe = playerEntity(w);
    if (pe !== undefined) {
      const pos = w.require(pe, Position);
      const at = traveled ? entryPoint(OPPOSITE[traveled]) : { x: 150, y: ROOM_H / 2 };
      pos.x = at.x;
      pos.y = at.y;
      const pt = w.get(pe, PlayerTag);
      if (pt) pt.invuln = Math.max(pt.invuln, 0.6);
    }

    w.bus.emit(RoomEntered, { roomId: node.id, type: node.type, visited: this._visited, total: floor.nodes.length });
  }

  dispose(): void {
    this.scope?.dispose();
    this.scope = null;
  }
}

function hashId(seed: number, s: string): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}
