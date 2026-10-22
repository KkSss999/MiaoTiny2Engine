import test from "node:test";
import assert from "node:assert/strict";
import { World, defineComponent } from "../index.ts";
import { EntityAllocator } from "../entity.ts";
import { EntityScope } from "../scope.ts";
import { DataChanged } from "../../db/index.ts";

const A = defineComponent("regression.A", () => ({ a: 1 }));
const B = defineComponent("regression.B", () => ({ b: 2 }));
const Excluded = defineComponent("regression.Excluded", () => ({}));

test("query projections preserve requested column order in callbacks and chunks", () => {
  const w = new World(); w.spawn(A, B);
  for (const query of [w.query(A, B), w.queryExcluding([Excluded], A, B)]) {
    query.forEach((_e, a, b) => { assert.equal(a.a, 1); assert.equal(b.b, 2); });
  }
  for (const query of [w.query(B, A), w.queryExcluding([Excluded], B, A)]) {
    query.forEach((_e, b, a) => { assert.equal(b.b, 2); assert.equal(a.a, 1); });
    assert.deepEqual([...query.chunks()][0].columns, [[{ b: 2 }], [{ a: 1 }]]);
  }
});

test("stale handles cannot observe, overwrite or acquire ownership of recycled entities", () => {
  const w = new World(); const old = w.spawn(A); w.despawn(old); const fresh = w.spawn(A);
  assert.equal(w.has(old, A), false);
  assert.throws(() => w.set(old, A, { a: 99 }));
  assert.throws(() => w.entityLifetime(old));
  assert.throws(() => w.createScope().adopt(old));
  assert.deepEqual(w.get(fresh, A), { a: 1 });
});

test("clear invalidates handles, old scopes, queries, resources and queued work", () => {
  const w = new World(); const scope = new EntityScope(w); const old = scope.spawn(A);
  const q = w.query(A); assert.equal(q.count, 1);
  let calls = 0; w.bus.on(DataChanged, () => calls++);
  w.commands.despawn(old); w.bus.post(DataChanged, { schema: "test", type: "delete", key: old });
  w.setResource("old", 1); w.clear();
  assert.equal(scope.isDisposed, true); assert.equal(scope.size, 0);
  assert.equal(w.commands.pending, 0); assert.equal(w.bus.pending, 0);
  assert.equal(w.tryResource("old"), undefined); assert.equal(q.count, 0);
  const fresh = w.spawn(A); w.commands.flush(); w.bus.drain(); scope.dispose();
  assert.notEqual(old, fresh); assert.equal(w.isAlive(old), false); assert.equal(w.isAlive(fresh), true);
  assert.equal(calls, 0); assert.equal(q.count, 1);
});

test("generation exhaustion retires slots, never resurrecting ancient handles", () => {
  const allocator = new EntityAllocator(); const ancient = allocator.create(); allocator.destroy(ancient);
  for (let i = 0; i < 4100; i++) { const e = allocator.create(); assert.notEqual(e, ancient); allocator.destroy(e); }
  assert.equal(allocator.isAlive(ancient), false);
});

test("dispose is terminal and removes all data and queued work", () => {
  const w = new World(); const e = w.spawn(A); w.setResource("x", 1); w.commands.despawn(e);
  w.dispose(); w.dispose();
  assert.equal(w.isDisposed, true); assert.equal(w.entityCount, 0); assert.equal(w.commands.pending, 0);
  assert.equal(w.tryResource("x"), undefined);
  assert.throws(() => w.spawn()); assert.throws(() => w.createScope());
  assert.throws(() => w.setResource("x", 2)); assert.throws(() => w.commands.run(() => {}));
});

test("throwing deletion listeners cannot skip lifecycle cleanup or scope membership cleanup", () => {
  const w = new World(); const scope = w.createScope(); const e = scope.spawn(A);
  const life = w.entityLifetime(e); const component = w.componentLifetime(e, A);
  w.bus.on(DataChanged, () => { throw new Error("subscriber"); }, { priority: 100 });
  assert.throws(() => w.despawn(e), /subscriber/);
  assert.equal(life.disposed, true); assert.equal(component.disposed, true); assert.equal(scope.size, 0);
});

test("component deletion completes old cleanup before a listener recreates it", () => {
  const w = new World(); const e = w.spawn(A); const old = w.componentLifetime(e, A);
  w.onRemove(A, () => w.add(e, A)); w.remove(e, A);
  assert.equal(old.disposed, true); assert.equal(w.componentLifetime(e, A).disposed, false);
});

test("command failure preserves untouched commands and clear cancels detached batches", () => {
  const w = new World(); const seen: number[] = [];
  w.commands.run(() => { w.commands.run(() => { seen.push(3); }); throw new Error("failed"); });
  w.commands.run(() => { seen.push(2); });
  assert.throws(() => w.commands.flush(), /failed/); assert.equal(w.commands.pending, 2);
  w.commands.flush(); assert.deepEqual(seen, [2, 3]);
  w.commands.run(() => w.clear()).run(() => { seen.push(4); }); w.commands.flush();
  assert.deepEqual(seen, [2, 3]);
});

test("component registry rejects conflicting names but permits identical definitions", () => {
  const create = () => ({ value: 0 }); const type = defineComponent("regression.registry", create);
  assert.equal(defineComponent("regression.registry", create), type);
  assert.throws(() => defineComponent("regression.registry", () => ({ other: 0 })), /different definition/);
});


test("scope spawn handles synchronous creation-listener despawn, reset and scope disposal", () => {
  for (const action of ["despawn", "clear", "scope"] as const) {
    const w = new World(); const scope = w.createScope();
    w.onEntity((change) => {
      if (change.type !== "create") return;
      if (action === "despawn") w.despawn(change.entity);
      else if (action === "clear") w.clear();
      else scope.dispose();
    });
    assert.throws(() => scope.spawn());
    assert.equal(scope.size, 0); assert.equal(w.entityCount, 0);
  }
});

test("scope adopt does not retain entities whose lifetime already ended", () => {
  const w = new World(); const scope = w.createScope(); const e = w.spawn();
  w.entityLifetime(e).dispose();
  assert.throws(() => scope.adopt(e), /disposed lifetime/);
  assert.equal(scope.size, 0);
});
