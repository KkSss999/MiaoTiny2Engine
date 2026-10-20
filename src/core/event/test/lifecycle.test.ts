import test from "node:test";
import assert from "node:assert/strict";
import { EventBus, Lifetime, defineEvent } from "../index.ts";

const Ping = defineEvent<number>("test.Ping");

test("Lifetime：fork 出的子节点随父销毁", () => {
  const root = new Lifetime();
  const a = root.fork();
  const b = a.fork();
  assert.equal(b.disposed, false);

  root.dispose();
  assert.equal(a.disposed, true);
  assert.equal(b.disposed, true);
});

test("Lifetime：销毁回调按注册逆序执行", () => {
  const life = new Lifetime();
  const order: string[] = [];
  life.onDispose(() => order.push("first"));
  life.onDispose(() => order.push("second"));
  life.dispose();
  assert.deepEqual(order, ["second", "first"]);
});

test("Lifetime：先销毁子节点，再执行自己的回调", () => {
  const root = new Lifetime();
  const order: string[] = [];
  root.onDispose(() => order.push("root"));
  const child = root.fork();
  child.onDispose(() => order.push("child"));
  root.dispose();
  assert.deepEqual(order, ["child", "root"]);
});

test("Lifetime：销毁后注册的回调立即执行（不会泄漏）", () => {
  const life = new Lifetime();
  life.dispose();
  let ran = false;
  life.onDispose(() => {
    ran = true;
  });
  assert.equal(ran, true);
});

test("Lifetime：dispose 幂等，回调只跑一次", () => {
  const life = new Lifetime();
  let n = 0;
  life.onDispose(() => n++);
  life.dispose();
  life.dispose();
  assert.equal(n, 1);
});

test("Lifetime：单个回调抛错不影响其它回调", () => {
  const life = new Lifetime();
  const order: string[] = [];
  life.onDispose(() => order.push("a"));
  life.onDispose(() => {
    throw new Error("boom");
  });
  life.onDispose(() => order.push("c"));
  const original = console.error;
  console.error = () => {};
  life.dispose();
  console.error = original;
  assert.deepEqual(order, ["c", "a"]);
});

test("EventBus.scoped(lifetime)：生命周期结束自动退订", () => {
  const bus = new EventBus();
  const life = new Lifetime();
  const got: number[] = [];
  const scope = bus.scoped(life);
  scope.on(Ping, (v) => got.push(v));

  bus.emit(Ping, 1);
  assert.deepEqual(got, [1]);

  life.dispose();
  bus.emit(Ping, 2);
  assert.deepEqual(got, [1], "销毁后不再收到事件");
});

test("父生命周期销毁，孙作用域的订阅也会退订", () => {
  const bus = new EventBus();
  const root = new Lifetime();
  const child = root.fork();
  const got: number[] = [];
  bus.scoped(child).on(Ping, (v) => got.push(v));

  child.dispose();
  bus.emit(Ping, 1);
  assert.deepEqual(got, []);

  root.dispose();
  bus.emit(Ping, 2);
  assert.deepEqual(got, []);
});

test("activate 状态流转", () => {
  const life = new Lifetime();
  assert.equal(life.active, false);
  life.activate();
  assert.equal(life.active, true);
  life.dispose();
  assert.equal(life.disposed, true);
  assert.equal(life.active, false);
});
