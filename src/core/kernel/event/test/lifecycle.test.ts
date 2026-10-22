import test from "node:test";
import assert from "node:assert/strict";
import { EventBus, Lifetime, defineEvent } from "../index.ts";

const Ping = defineEvent<number>("test.Ping");

test("Lifetime: forked children are disposed with their parent", () => {
  const root = new Lifetime();
  const a = root.fork();
  const b = a.fork();
  assert.equal(b.disposed, false);

  root.dispose();
  assert.equal(a.disposed, true);
  assert.equal(b.disposed, true);
});

test("Lifetime: disposal callbacks run in reverse registration order", () => {
  const life = new Lifetime();
  const order: string[] = [];
  life.onDispose(() => order.push("first"));
  life.onDispose(() => order.push("second"));
  life.dispose();
  assert.deepEqual(order, ["second", "first"]);
});

test("Lifetime: dispose children before running own callbacks", () => {
  const root = new Lifetime();
  const order: string[] = [];
  root.onDispose(() => order.push("root"));
  const child = root.fork();
  child.onDispose(() => order.push("child"));
  root.dispose();
  assert.deepEqual(order, ["child", "root"]);
});

test("Lifetime: callbacks registered after disposal run immediately without leaks", () => {
  const life = new Lifetime();
  life.dispose();
  let ran = false;
  life.onDispose(() => {
    ran = true;
  });
  assert.equal(ran, true);
});

test("Lifetime: dispose is idempotent and callbacks run once", () => {
  const life = new Lifetime();
  let n = 0;
  life.onDispose(() => n++);
  life.dispose();
  life.dispose();
  assert.equal(n, 1);
});

test("Lifetime: one callback failure does not prevent others", () => {
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

test("EventBus.scoped(lifetime): unsubscribe automatically on disposal", () => {
  const bus = new EventBus();
  const life = new Lifetime();
  const got: number[] = [];
  const scope = bus.scoped(life);
  scope.on(Ping, (v) => got.push(v));

  bus.emit(Ping, 1);
  assert.deepEqual(got, [1]);

  life.dispose();
  bus.emit(Ping, 2);
  assert.deepEqual(got, [1], "no events received after disposal");
});

test("parent disposal unsubscribes grandchild scopes too", () => {
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

test("activate state transitions", () => {
  const life = new Lifetime();
  assert.equal(life.active, false);
  life.activate();
  assert.equal(life.active, true);
  life.dispose();
  assert.equal(life.disposed, true);
  assert.equal(life.active, false);
});
