import test from "node:test";
import assert from "node:assert/strict";
import { EventBus, EventScope, defineEvent } from "../index.ts";

const Hit = defineEvent<{ dmg: number; target: string }>("test.Hit");
const Kill = defineEvent<{ id: string }>("test.Kill");
const Tick = defineEvent<number>("test.Tick");

test("emit：同步派发到监听器", () => {
  const bus = new EventBus();
  const got: number[] = [];
  bus.on(Hit, (e) => got.push(e.dmg));
  bus.emit(Hit, { dmg: 7, target: "a" });
  bus.emit(Hit, { dmg: 9, target: "b" });
  assert.deepEqual(got, [7, 9]);
});

test("emit 返回是否有监听器", () => {
  const bus = new EventBus();
  assert.equal(bus.emit(Tick, 1), false);
  bus.on(Tick, () => {});
  assert.equal(bus.emit(Tick, 1), true);
});

test("退订：返回的函数可取消订阅", () => {
  const bus = new EventBus();
  const got: number[] = [];
  const off = bus.on(Tick, (v) => got.push(v));
  bus.emit(Tick, 1);
  off();
  bus.emit(Tick, 2);
  assert.deepEqual(got, [1]);
  assert.equal(bus.hasListeners(Tick), false);
});

test("once：只触发一次（且重入也只触发一次）", () => {
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

test("priority：数值大的先跑，同优先级按订阅顺序", () => {
  const bus = new EventBus();
  const order: string[] = [];
  bus.on(Tick, () => order.push("normal-1"));
  bus.on(Tick, () => order.push("high"), { priority: 10 });
  bus.on(Tick, () => order.push("normal-2"));
  bus.on(Tick, () => order.push("low"), { priority: -5 });
  bus.emit(Tick, 0);
  assert.deepEqual(order, ["high", "normal-1", "normal-2", "low"]);
});

test("post + drain：FIFO 派发，pending 归零", () => {
  const bus = new EventBus();
  const got: number[] = [];
  bus.on(Tick, (v) => got.push(v));
  bus.post(Tick, 1);
  bus.post(Tick, 2);
  bus.post(Tick, 3);
  assert.equal(bus.pending, 3);
  assert.deepEqual(got, [], "drain 之前不派发");
  const n = bus.drain();
  assert.equal(n, 3);
  assert.deepEqual(got, [1, 2, 3]);
  assert.equal(bus.pending, 0);
});

test("drain：派发中 post 的事件进入下一轮", () => {
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

test("drain：maxPasses 防止无限连锁", () => {
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

test("派发过程中退订：本轮不再调用被退订的监听器", () => {
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

test("派发过程中新增订阅：本轮不触发，下一轮生效", () => {
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
  assert.deepEqual(order, ["a"], "快照语义：本轮看不到新监听器");
  bus.emit(Tick, 0);
  assert.deepEqual(order, ["a", "a", "late"]);
});

test("onAny：能看到所有事件（调试用）", () => {
  const bus = new EventBus();
  const seen: string[] = [];
  bus.onAny((token, payload) => seen.push(`${token.name}:${JSON.stringify(payload)}`));
  bus.emit(Hit, { dmg: 1, target: "x" });
  bus.emit(Kill, { id: "e1" });
  assert.deepEqual(seen, ['test.Hit:{"dmg":1,"target":"x"}', 'test.Kill:{"id":"e1"}']);
});

test("EventScope：批量退订", () => {
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

test("off：按函数引用退订", () => {
  const bus = new EventBus();
  const fn = () => {};
  bus.on(Tick, fn);
  assert.equal(bus.off(Tick, fn), true);
  assert.equal(bus.off(Tick, fn), false);
  assert.equal(bus.hasListeners(Tick), false);
});

test("defineEvent：同名返回同一个 token", () => {
  const A = defineEvent<number>("test.Same");
  const B = defineEvent<number>("test.Same");
  assert.equal(A.id, B.id);
});

test("大量监听器 + 派发不炸", () => {
  const bus = new EventBus();
  let n = 0;
  for (let i = 0; i < 1000; i++) bus.on(Tick, () => n++);
  bus.emit(Tick, 0);
  assert.equal(n, 1000);
  bus.clear();
  assert.equal(bus.hasListeners(Tick), false);
});
