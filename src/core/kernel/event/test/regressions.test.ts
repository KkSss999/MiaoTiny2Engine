import test from "node:test";
import assert from "node:assert/strict";
import { Lifetime } from "../lifecycle.ts";
import { EventBus } from "../bus.ts";
import { defineEvent } from "../token.ts";

test("late lifetime children and subscriptions cannot escape disposal", () => {
  const life = new Lifetime(); life.dispose();
  assert.equal(life.fork().disposed, true);
  const child = new Lifetime(); life.adopt(child); assert.equal(child.disposed, true);
  const bus = new EventBus(); const token = defineEvent<number>("regression.terminal");
  assert.throws(() => bus.scoped(life).on(token, () => {}), /disposed/);
  const scope = bus.scoped(); scope.dispose(); assert.throws(() => scope.on(token, () => {}), /disposed/);
  assert.equal(bus.hasListeners(token), false);
});
test("lifetime adoption reparents and rejects cycles", () => {
  const a = new Lifetime(); const b = new Lifetime(); const child = a.fork();
  b.adopt(child); a.dispose(); assert.equal(child.disposed, false);
  assert.throws(() => child.adopt(b), /cycle/); b.dispose(); assert.equal(child.disposed, true);
});
test("failed drain preserves unattempted events ahead of new posts", () => {
  const bus = new EventBus(); const e = defineEvent<number>("regression.drain"); const seen: number[] = [];
  bus.on(e, n => { seen.push(n); if (n === 1) { bus.post(e, 3); throw new Error("failed"); } });
  bus.post(e, 1); bus.post(e, 2); assert.throws(() => bus.drain(), /failed/);
  assert.equal(bus.pending, 2); bus.drain(); assert.deepEqual(seen, [1, 2, 3]);
});
test("reset during drain cancels detached batch", () => {
  const bus = new EventBus(); const e = defineEvent<number>("regression.cancel"); const seen: number[] = [];
  bus.on(e, n => { seen.push(n); bus.clearPending(); }); bus.post(e, 1); bus.post(e, 2); bus.drain();
  assert.deepEqual(seen, [1]);
});
test("nested drain fails predictably and remaining queue can be resumed", () => {
  const bus = new EventBus(); const e = defineEvent<number>("regression.nested");
  const off = bus.on(e, () => bus.drain()); bus.post(e, 1); bus.post(e, 2);
  assert.throws(() => bus.drain(), /not reentrant/); off(); assert.equal(bus.drain(), 1);
});
test("clearing bus during emit cancels old onAny snapshot", () => {
  const bus = new EventBus(); const e = defineEvent<void>("regression.clearAny"); let seen = 0;
  bus.on(e, () => bus.clear()); bus.onAny(() => seen++); bus.emit(e, undefined); assert.equal(seen, 0);
});
