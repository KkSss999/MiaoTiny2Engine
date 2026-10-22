import test from "node:test";
import assert from "node:assert/strict";
import { EventBus, EventScope, defineEvent } from "../index.ts";

const Hit = defineEvent<{ dmg: number; target: string }>("test.Hit");
const Kill = defineEvent<{ id: string }>("test.Kill");
const Tick = defineEvent<number>("test.Tick");

test("emit: synchronously dispatch to listeners", () => {
  const bus = new EventBus();
  const got: number[] = [];
  bus.on(Hit, (e) => got.push(e.dmg));
  bus.emit(Hit, { dmg: 7, target: "a" });
  bus.emit(Hit, { dmg: 9, target: "b" });
  assert.deepEqual(got, [7, 9]);
});

test("emit returns whether listeners exist", () => {
  const bus = new EventBus();
  assert.equal(bus.emit(Tick, 1), false);
  bus.on(Tick, () => {});
  assert.equal(bus.emit(Tick, 1), true);
});

test("unsubscribe: the returned function cancels the subscription", () => {
  const bus = new EventBus();
  const got: number[] = [];
  const off = bus.on(Tick, (v) => got.push(v));
  bus.emit(Tick, 1);
  off();
  bus.emit(Tick, 2);
  assert.deepEqual(got, [1]);
  assert.equal(bus.hasListeners(Tick), false);
});

test("once: invoke once, including reentrant dispatch", () => {
  const bus = new EventBus();
  let count = 0;
  bus.once(Tick, () => {
    count++;
    bus.emit(Tick, 99);
  });
  bus.emit(Tick, 1);
  bus.emit(Tick, 2);
  assert.equal(count, 1);
});

test("priority: higher values first; ties use subscription order", () => {
  const bus = new EventBus();
  const order: string[] = [];
  bus.on(Tick, () => order.push("normal-1"));
  bus.on(Tick, () => order.push("high"), { priority: 10 });
  bus.on(Tick, () => order.push("normal-2"));
  bus.on(Tick, () => order.push("low"), { priority: -5 });
  bus.emit(Tick, 0);
  assert.deepEqual(order, ["high", "normal-1", "normal-2", "low"]);
});

test("post + drain: FIFO dispatch clears pending events", () => {
  const bus = new EventBus();
  const got: number[] = [];
  bus.on(Tick, (v) => got.push(v));
  bus.post(Tick, 1);
  bus.post(Tick, 2);
  bus.post(Tick, 3);
  assert.equal(bus.pending, 3);
  assert.deepEqual(got, [], "no dispatch before drain");
  const n = bus.drain();
  assert.equal(n, 3);
  assert.deepEqual(got, [1, 2, 3]);
  assert.equal(bus.pending, 0);
});

test("drain: events posted during dispatch enter the next pass", () => {
  const bus = new EventBus();
  const got: number[] = [];
  bus.on(Tick, (v) => {
    got.push(v);
    if (v < 3) bus.post(Tick, v + 1);
  });
  bus.post(Tick, 1);
  bus.drain();
  assert.deepEqual(got, [1, 2, 3]);
});

test("drain: maxPasses prevents infinite chains", () => {
  const bus = new EventBus();
  let fired = 0;
  bus.on(Tick, () => {
    fired++;
    bus.post(Tick, 0);
  });
  bus.post(Tick, 0);
  bus.drain(5);
  assert.equal(fired, 5);
});

test("unsubscribe during dispatch: removed listeners do not run again in this pass", () => {
  const bus = new EventBus();
  const order: string[] = [];
  const off2 = bus.on(Tick, () => order.push("second"), { priority: 0 });
  bus.on(
    Tick,
    () => {
      order.push("first");
      off2();
    },
    { priority: 10 },
  );
  bus.emit(Tick, 0);
  assert.deepEqual(order, ["first"]);

  order.length = 0;
  bus.emit(Tick, 0);
  assert.deepEqual(order, ["first"]);
});

test("subscribe during dispatch: new listeners run starting with the next pass", () => {
  const bus = new EventBus();
  const order: string[] = [];
  let added = false;
  bus.on(Tick, () => {
    order.push("a");
    if (!added) {
      added = true;
      bus.on(Tick, () => order.push("late"));
    }
  });
  bus.emit(Tick, 0);
  assert.deepEqual(order, ["a"], "snapshot semantics: new listeners are invisible in this pass");
  bus.emit(Tick, 0);
  assert.deepEqual(order, ["a", "a", "late"]);
});

test("onAny: observe all events for debugging", () => {
  const bus = new EventBus();
  const seen: string[] = [];
  bus.onAny((token, payload) => seen.push(`${token.name}:${JSON.stringify(payload)}`));
  bus.emit(Hit, { dmg: 1, target: "x" });
  bus.emit(Kill, { id: "e1" });
  assert.deepEqual(seen, ['test.Hit:{"dmg":1,"target":"x"}', 'test.Kill:{"id":"e1"}']);
});

test("EventScope: bulk unsubscribe", () => {
  const bus = new EventBus();
  const got: string[] = [];
  const scope = new EventScope(bus);
  scope.on(Tick, () => got.push("a"));
  scope.on(Kill, () => got.push("b"));
  bus.emit(Tick, 0);
  bus.emit(Kill, { id: "x" });
  scope.dispose();
  bus.emit(Tick, 0);
  bus.emit(Kill, { id: "y" });
  assert.deepEqual(got, ["a", "b"]);
});

test("off: unsubscribe by function reference", () => {
  const bus = new EventBus();
  const fn = () => {};
  bus.on(Tick, fn);
  assert.equal(bus.off(Tick, fn), true);
  assert.equal(bus.off(Tick, fn), false);
  assert.equal(bus.hasListeners(Tick), false);
});

test("defineEvent: the same name returns the same token", () => {
  const A = defineEvent<number>("test.Same");
  const B = defineEvent<number>("test.Same");
  assert.equal(A.id, B.id);
});

test("many listeners and dispatch remain functional", () => {
  const bus = new EventBus();
  let n = 0;
  for (let i = 0; i < 1000; i++) bus.on(Tick, () => n++);
  bus.emit(Tick, 0);
  assert.equal(n, 1000);
  bus.clear();
  assert.equal(bus.hasListeners(Tick), false);
});
