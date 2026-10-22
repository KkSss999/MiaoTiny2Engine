import test from "node:test";
import assert from "node:assert/strict";
import { Loop } from "./Loop.ts";

const loop = (maxSteps = 4) => new Loop(10, maxSteps, 100);

test("一帧刚好一个步长：跑 1 步，alpha 为 0", () => {
  const l = loop();
  const tick = l.advance(10);
  assert.equal(tick.steps, 1);
  assert.equal(tick.alpha, 0);
  assert.equal(l.frame, 1);
  assert.equal(l.elapsedSec, 0.01);
});

test("不够一个步长：跑 0 步，alpha 累积", () => {
  const l = loop();
  let tick = l.advance(4);
  assert.equal(tick.steps, 0);
  assert.equal(tick.alpha, 0.4);

  tick = l.advance(4);
  assert.equal(tick.steps, 0);
  assert.equal(Math.round(tick.alpha * 100) / 100, 0.8);

  tick = l.advance(4);
  assert.equal(tick.steps, 1, "攒够 10ms 就跑一步");
  assert.equal(Math.round(tick.alpha * 100) / 100, 0.2);
});

test("一帧多步：25ms → 2 步，alpha 0.5", () => {
  const l = loop();
  const tick = l.advance(25);
  assert.equal(tick.steps, 2);
  assert.equal(tick.alpha, 0.5);
  assert.equal(l.frame, 2);
});

test("追帧上限：超出部分被丢弃，alpha 不越界", () => {
  const l = loop(4);
  const tick = l.advance(1000);
  assert.equal(tick.steps, 4, "最多跑 maxSteps 步");
  assert.ok(tick.alpha >= 0 && tick.alpha < 1);
  assert.ok(l.droppedSteps > 0, "丢掉的步数被记录");
  assert.equal(tick.deltaMs, 100, "单帧耗时被截断到 maxDeltaMs");
});

test("丢弃之后不会死亡螺旋：下一帧恢复正常", () => {
  const l = loop(4);
  l.advance(1000);
  const next = l.advance(10);
  assert.equal(next.steps, 1);
});

test("负数和超大值都被夹住", () => {
  const l = loop();
  assert.equal(l.advance(-5).steps, 0);
  assert.equal(l.advance(0).steps, 0);
  const big = l.advance(10000);
  assert.equal(big.deltaMs, 100);
});

test("reset 清空全部状态", () => {
  const l = loop();
  l.advance(55);
  l.reset();
  assert.equal(l.frame, 0);
  assert.equal(l.elapsedSec, 0);
  assert.equal(l.droppedSteps, 0);
  assert.equal(l.advance(10).steps, 1);
});

test("alpha 永远落在 [0, 1)", () => {
  const l = loop();
  for (const d of [0, 3, 7, 10, 11, 9.9, 16, 1]) {
    const tick = l.advance(d);
    assert.ok(tick.alpha >= 0 && tick.alpha < 1, `alpha=${tick.alpha}`);
  }
});

test("overflow drops whole steps but preserves interpolation remainder", () => {
  const l = loop(2); const tick = l.advance(55);
  assert.equal(tick.steps, 2); assert.equal(tick.alpha, 0.5); assert.equal(l.droppedSteps, 3);
  assert.equal(l.advance(5).steps, 1);
});
test("invalid timing values fail before corrupting the clock", () => {
  assert.throws(() => new Loop(0)); assert.throws(() => new Loop(10, 0));
  const l = loop(); assert.throws(() => l.advance(NaN)); assert.throws(() => l.advance(Infinity));
  assert.equal(l.advance(10).steps, 1);
});
