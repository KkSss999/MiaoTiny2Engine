import test from "node:test";
import assert from "node:assert/strict";
import { defineShape, s } from "../../db/index.ts";
import { World, defineComponent } from "../index.ts";

const Body = defineComponent(
  "shape.Body",
  () => ({ x: 0, y: 0 }),
  defineShape("shape.Body", { x: s.number(), y: s.number() }),
);

test("component shapes: no checks when validation is disabled", () => {
  const w = new World();
  const e = w.spawn();
  w.add(e, Body, { x: 1, y: 2 });
  assert.deepEqual(w.require(e, Body), { x: 1, y: 2 });
});

test("component shapes: @gdd/db rejects invalid data when validation is enabled", () => {
  const w = new World();
  w.validateComponents = true;
  const e = w.spawn();
  w.add(e, Body, { x: 1, y: 2 });
  assert.deepEqual(w.require(e, Body), { x: 1, y: 2 });

  const e2 = w.spawn();
  assert.throws(() => w.add(e2, Body, { x: "bad", y: 0 } as never), /validation failed|Expected number/);
  assert.equal(w.has(e2, Body), false);
});

test("component shapes: populate defaults before validating missing fields", () => {
  const w = new World();
  w.validateComponents = true;
  const e = w.spawn();
  w.add(e, Body, { x: 5 } as never);
  assert.deepEqual(w.require(e, Body), { x: 5, y: 0 });
});
