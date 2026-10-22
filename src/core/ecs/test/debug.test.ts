import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../world.ts";
import { defineComponent } from "../component.ts";
import { DebugRegistry, countComponents, inspectEntity, listEntities } from "../debug.ts";

const Position = defineComponent("DbgPosition", () => ({ x: 0, y: 0 }));
const Tag = defineComponent("DbgTag", () => ({ value: 1 }));

test("debug registry: register, run, list and mount", () => {
  const registry = new DebugRegistry();
  registry.register("add", (a: number, b: number) => a + b, "Add two numbers");

  assert.equal(registry.run("add", [2, 3]), 5);
  assert.equal(registry.list()[0].name, "add");
  assert.equal(registry.has("add"), true);

  const target: Record<string, unknown> = {};
  registry.install(target, "__dbg");
  const api = target.__dbg as { add: (a: number, b: number) => number; help: () => unknown[] };
  assert.equal(api.add(4, 5), 9);
  assert.equal(api.help().length, 1);

  assert.throws(() => registry.run("nope"), /No debug command/);
});

test("entity introspection: component snapshot / filtering / counts", () => {
  const world = new World();
  const a = world.spawn(Position);
  world.add(a, Position, { x: 15, y: 25 });
  const b = world.spawn(Position, Tag);

  const snapshot = inspectEntity(world, a);
  assert.deepEqual(snapshot?.DbgPosition, { x: 15, y: 25 });

  assert.equal(listEntities(world).length, 2);
  assert.equal(listEntities(world, ["DbgTag"]).length, 1);
  assert.equal(listEntities(world, ["DbgTag"])[0].entity, b);

  const counts = countComponents(world);
  assert.equal(counts.DbgPosition, 2);
  assert.equal(counts.DbgTag, 1);

  world.despawn(a);
  assert.equal(inspectEntity(world, a), null, "destroyed entities cannot be inspected");
  assert.equal(listEntities(world).length, 1);
});