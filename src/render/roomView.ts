import { Container, Graphics } from "pixi.js";
import { DOOR_GAP, ROOM_H, ROOM_W, type Rect } from "../game/rooms.ts";
import type { Dir, RoomNode } from "../game/gen/floor.ts";

/** 地板 + 墙 + 门：静态场景绘制，和实体渲染分开 */
export class RoomView {
  readonly floorRoot = new Container();
  readonly wallRoot = new Container();

  private floorG = new Graphics();
  private wallsG = new Graphics();
  private doorG = new Graphics();

  constructor() {
    this.floorRoot.addChild(this.floorG);
    this.wallRoot.addChild(this.wallsG, this.doorG);
    this.floorRoot.zIndex = -1000;
    this.wallRoot.zIndex = -999;
  }

  renderFloor(): void {
    this.floorG.clear();
    this.floorG.rect(0, 0, ROOM_W, ROOM_H).fill(0x0d1218);
    for (let x = 0; x <= ROOM_W; x += 100) this.floorG.moveTo(x, 0).lineTo(x, ROOM_H);
    for (let y = 0; y <= ROOM_H; y += 100) this.floorG.moveTo(0, y).lineTo(ROOM_W, y);
    this.floorG.stroke({ width: 1, color: 0x1b2534, alpha: 0.55 });
  }

  renderWalls(walls: Rect[]): void {
    this.wallsG.clear();
    for (const w of walls) this.wallsG.rect(w.x, w.y, w.w, w.h).fill(0x1b2230).stroke({ width: 3, color: 0x2f3b52 });
  }

  renderDoors(node: RoomNode | null, cleared: boolean): void {
    this.doorG.clear();
    if (!node) return;
    const cx = ROOM_W / 2;
    const cy = ROOM_H / 2;
    const color = cleared ? 0x39e0c8 : 0x5a1f2b;
    for (const d of node.doors as Dir[]) {
      if (d === "E") this.doorG.rect(ROOM_W - 12, cy - DOOR_GAP / 2, 12, DOOR_GAP).fill(color);
      if (d === "W") this.doorG.rect(0, cy - DOOR_GAP / 2, 12, DOOR_GAP).fill(color);
      if (d === "N") this.doorG.rect(cx - DOOR_GAP / 2, 0, DOOR_GAP, 12).fill(color);
      if (d === "S") this.doorG.rect(cx - DOOR_GAP / 2, ROOM_H - 12, DOOR_GAP, 12).fill(color);
    }
  }
}
