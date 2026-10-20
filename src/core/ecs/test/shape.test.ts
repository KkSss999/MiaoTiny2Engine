import test from "node:test";
import assert from "node:assert/strict";
import { defineShape, s } from "../../db/index.ts";
import { World, defineComponent } from "../index.ts";

const Body = defineComponent(
  "shape.Body",
  () => ({ x: 0, y: 0 }),
  defineShape("shape.Body", { x: s.number(), y: s.number() }),
);

test("组件形状：未开启校验时不做检查", () => {
  const w = new World();
  const e = w.spawn();
  w.add(e, Body, { x: 1, y: 2 });
  assert.deepEqual(w.require(e, Body), { x: 1, y: 2 });
});

test("组件形状：开启校验后，坏数据被 @gdd/db 拦住", () => {
  const w = new World();
  w.validateComponents = true;
  const e = w.spawn();
  w.add(e, Body, { x: 1, y: 2 });
  assert.deepEqual(w.require(e, Body), { x: 1, y: 2 });

  const e2 = w.spawn();
  assert.throws(() => w.add(e2, Body, { x: "bad", y: 0 } as never), /校验失败|期望 number/);
  assert.equal(w.has(e2, Body), false);
});

test("组件形状：缺字段会被补上默认值后校验", () => {
  const w = new World();
  w.validateComponents = true;
  const e = w.spawn();
  w.add(e, Body, { x: 5 } as never);
  assert.deepEqual(w.require(e, Body), { x: 5, y: 0 });
});
