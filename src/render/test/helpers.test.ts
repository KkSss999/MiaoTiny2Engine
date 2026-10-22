import test from "node:test";
import assert from "node:assert/strict";
import { followCamera, shakeOffset } from "../camera.ts";
import { Tweens } from "../tweens.ts";
import type { Entity } from "../../core/ecs/index.ts";

test("camera uses caller bounds, including an offset origin and small worlds", () => {
  const bounds = { x: 10, y: 20, width: 100, height: 80 };
  assert.deepEqual(followCamera(-100, 1000, 20, 20, bounds), { x: 10, y: 80 });
  assert.deepEqual(followCamera(100, 100, 200, 200, bounds), { x: 10, y: 20 });
  assert.throws(() => followCamera(0, 0, -1, 20, bounds), RangeError);
});

test("camera shake has explicit RNG and no random consumption while idle", () => {
  assert.deepEqual(shakeOffset(0, () => { throw new Error("unused"); }), { x: 0, y: 0 });
  assert.deepEqual(shakeOffset(0.5, () => 1, 20), { x: 5, y: 5 });
});

test("tweens replace, complete, clear and reject invalid timing", () => {
  const tweens = new Tweens();
  const entity = 123 as Entity;
  assert.throws(() => tweens.add(entity, 0, 1, 0), RangeError);
  tweens.add(entity, 0, 10, 1);
  tweens.update(0.5);
  assert.equal(tweens.get(entity), 8.75);
  tweens.add(entity, 20, 30, 1);
  tweens.update(1);
  assert.equal(tweens.get(entity), 30);
  tweens.update(0);
  assert.equal(tweens.get(entity), undefined);
  tweens.add(entity, 0, 1, 1);
  tweens.clear(entity);
  tweens.update(0.5);
  assert.equal(tweens.get(entity), undefined);
  assert.throws(() => tweens.update(NaN), RangeError);
});
