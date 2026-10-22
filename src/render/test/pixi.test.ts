import test from "node:test";
import assert from "node:assert/strict";
import { Assets, Container, Texture } from "pixi.js";
import { createLayers, attachLayers } from "../layerContainers.ts";
import { Particles } from "../particles.ts";
import { sliceAtlas } from "../sheets.ts";
import { loadImageTexture } from "../assets.ts";

test("layers reject duplicates and use caller ordering", () => {
  assert.throws(() => createLayers([{ id: "a", zIndex: 0 }, { id: "a", zIndex: 1 }]), /duplicate/);
  const root = new Container();
  const layers = createLayers([{ id: "background", zIndex: -10 }, { id: "actors", zIndex: 5, sortableChildren: true }]);
  attachLayers(root, layers);
  assert.equal(root.children.length, 2);
  assert.equal(layers.get("actors")?.sortableChildren, true);
  assert.equal(root.sortableChildren, true);
  root.destroy({ children: true });
});

test("particles use caller texture, obey capacity, and dispose without destroying it", () => {
  const particles = new Particles(Texture.EMPTY, 2, 123);
  particles.emit(0, 0, 10, { color: 0xffffff, life: 1 });
  assert.equal(particles.count, 2);
  particles.update(2);
  assert.equal(particles.count, 0);
  particles.emit(0, 0, 1, { color: 0xffffff });
  particles.clear();
  assert.equal(particles.count, 0);
  particles.dispose();
  particles.dispose();
  assert.equal(Texture.EMPTY.destroyed, false);
  assert.throws(() => particles.emit(0, 0, 1, { color: 0xffffff }), /disposed/);
});

test("grid slicing validates bounds and frames share caller source", () => {
  const frames = sliceAtlas(Texture.EMPTY, { frameWidth: 1, frameHeight: 1, cols: 1, rows: 1 });
  assert.equal(frames.length, 1);
  assert.equal(frames[0].source, Texture.EMPTY.source);
  frames[0].destroy(false);
  assert.equal(Texture.EMPTY.destroyed, false);
  assert.throws(() => sliceAtlas(Texture.EMPTY, { frameWidth: 1, frameHeight: 1, cols: 2, rows: 1 }), /bounds/);
  assert.throws(() => sliceAtlas(Texture.EMPTY, { frameWidth: 0, frameHeight: 1, cols: 1, rows: 1 }), RangeError);
});

test("image loading returns cache result and exposes errors rather than placeholder success", async (t) => {
  const load = t.mock.method(Assets, "load", async () => Texture.EMPTY);
  assert.equal(await loadImageTexture("image.png"), Texture.EMPTY);
  assert.equal(load.mock.calls.length, 1);
  await assert.rejects(loadImageTexture(" "), /empty/);
  load.mock.mockImplementation(async () => { throw new Error("network failure"); });
  await assert.rejects(loadImageTexture("missing.png"), /network failure/);
  load.mock.mockImplementation(async () => ({ not: "a texture" }));
  await assert.rejects(loadImageTexture("data.json"), /not an image/);
});
