import test from "node:test";
import assert from "node:assert/strict";
import { World, defineComponent } from "../index.ts";

const P = defineComponent("scope.P", () => ({ x: 0 }));
const Tag = defineComponent("scope.Tag", () => ({}));

test("scope: spawned entities join the group; dispose destroys all", () => {
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

test("scope: individually destroyed entities leave the group automatically", () => {
  const w = new World();
  const scope = w.createScope();
  const a = scope.spawn(P);
  scope.spawn(P);
  assert.equal(scope.size, 2);

  w.despawn(a);
  assert.equal(scope.size, 1, "no manual removal from the group is needed");
});

test("scope: spawning after disposal throws", () => {
  const w = new World();
  const scope = w.createScope();
  scope.dispose();
  assert.throws(() => scope.spawn(P), /is disposed/);
  assert.equal(scope.isDisposed, true);
});

test("scope: dispose is idempotent", () => {
  const w = new World();
  const scope = w.createScope();
  scope.spawn(P);
  scope.dispose();
  scope.dispose();
  assert.equal(w.entityCount, 0);
});

test("scope: adopt externally created entities", () => {
  const w = new World();
  const outside = w.spawn(P);
  const scope = w.createScope();
  scope.adopt(outside);
  assert.equal(scope.has(outside), true);
  scope.dispose();
  assert.equal(w.isAlive(outside), false);
});

test("scope: lifetime can own other resources and subscriptions", () => {
  const w = new World();
  const scope = w.createScope();
  let released = 0;
  scope.lifetime.onDispose(() => released++);
  scope.spawn(P);
  scope.dispose();
  assert.equal(released, 1);
});

test("scope: parent disposal cascades to child scopes", () => {
  const w = new World();
  const room = w.createScope();
  const fx = w.createScope(room.lifetime);
  const e1 = room.spawn(P);
  const e2 = fx.spawn(Tag);

  room.dispose();
  assert.equal(w.isAlive(e1), false);
  assert.equal(w.isAlive(e2), false, "child-scope entities are destroyed too");
});

test("scope: changing rooms clears old entities and starts the next room fresh", () => {
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
