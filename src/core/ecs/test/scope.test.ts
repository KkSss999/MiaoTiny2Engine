import test from "node:test";
import assert from "node:assert/strict";
import { World, defineComponent } from "../index.ts";

const P = defineComponent("scope.P", () => ({ x: 0 }));
const Tag = defineComponent("scope.Tag", () => ({}));

test("scope：spawn 的实体归组，dispose 全灭", () => {
  const w = new World();
  const scope = w.createScope();
  const a = scope.spawn(P);
  const b = scope.spawn(P);
  assert.equal(scope.size, 2);
  assert.equal(w.entityCount, 2);

  scope.dispose();
  assert.equal(w.isAlive(a), false);
  assert.equal(w.isAlive(b), false);
  assert.equal(w.entityCount, 0);
  assert.equal(scope.size, 0);
});

test("scope：单独销毁的实体会自动从组里剔除", () => {
  const w = new World();
  const scope = w.createScope();
  const a = scope.spawn(P);
  scope.spawn(P);
  assert.equal(scope.size, 2);

  w.despawn(a);
  assert.equal(scope.size, 1, "不需要手动从组里删");
});

test("scope：销毁后再 spawn 会报错", () => {
  const w = new World();
  const scope = w.createScope();
  scope.dispose();
  assert.throws(() => scope.spawn(P), /已销毁/);
  assert.equal(scope.isDisposed, true);
});

test("scope：dispose 幂等", () => {
  const w = new World();
  const scope = w.createScope();
  scope.spawn(P);
  scope.dispose();
  scope.dispose();
  assert.equal(w.entityCount, 0);
});

test("scope：adopt 外部创建的实体", () => {
  const w = new World();
  const outside = w.spawn(P);
  const scope = w.createScope();
  scope.adopt(outside);
  assert.equal(scope.has(outside), true);
  scope.dispose();
  assert.equal(w.isAlive(outside), false);
});

test("scope：作用域 lifetime 可以挂其它资源（资产、订阅）", () => {
  const w = new World();
  const scope = w.createScope();
  let released = 0;
  scope.lifetime.onDispose(() => released++);
  scope.spawn(P);
  scope.dispose();
  assert.equal(released, 1);
});

test("scope：父作用域销毁级联子作用域", () => {
  const w = new World();
  const room = w.createScope();
  const fx = w.createScope(room.lifetime);
  const e1 = room.spawn(P);
  const e2 = fx.spawn(Tag);

  room.dispose();
  assert.equal(w.isAlive(e1), false);
  assert.equal(w.isAlive(e2), false, "子作用域的实体一起死");
});

test("scope：换房模拟——旧房实体全清、新房从零开始", () => {
  const w = new World();
  const roomA = w.createScope();
  roomA.spawn(P);
  roomA.spawn(P);
  roomA.spawn(Tag);

  roomA.dispose();
  const roomB = w.createScope();
  assert.equal(w.entityCount, 0);
  assert.equal(roomB.size, 0);

  const fresh = roomB.spawn(P);
  assert.equal(w.isAlive(fresh), true);
  assert.equal(roomB.size, 1);
});
