import { Rectangle, Texture } from "pixi.js";

export type SheetGrid = { frameWidth: number; frameHeight: number; cols: number; rows: number };

/**
 * Slice an untrimmed grid atlas. Frames share the caller's source; destroy these
 * frames with destroy(false), then release the source after all consumers end.
 */
export function sliceAtlas(atlas: Texture, grid: SheetGrid): Texture[] {
  if (![grid.frameWidth, grid.frameHeight, grid.cols, grid.rows].every(v => Number.isSafeInteger(v) && v > 0)) {
    throw new RangeError("Grid dimensions must be positive safe integers");
  }
  if (atlas.rotate || atlas.trim) throw new Error("Grid atlas must not be rotated or trimmed");
  if (grid.cols * grid.frameWidth > atlas.frame.width || grid.rows * grid.frameHeight > atlas.frame.height) {
    throw new RangeError("Grid exceeds atlas bounds");
  }
  const frames: Texture[] = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      frames.push(new Texture({ source: atlas.source, frame: new Rectangle(
        atlas.frame.x + col * grid.frameWidth, atlas.frame.y + row * grid.frameHeight,
        grid.frameWidth, grid.frameHeight,
      ) }));
    }
  }
  return frames;
}
