import test from "node:test";
import assert from "node:assert/strict";
import { Store, DataChanged, defineSchema, s } from "../../db/index.ts";
import { World, defineComponent, ENTITY_SCHEMA, componentSchema, type Change } from "../index.ts";

const P = defineComponent("ev.Position", () => ({ x: 0 }));
const H = defineComponent("ev.Health", () => 100);

test("统一通道：实体创建 / 销毁", () => {
  const w = new World();
  const changes: Change[] = [];
  w.bus.on(DataChanged, (c) => changes.push(c));

  const a = w.spawn();
  w.despawn(a);

  assert.deepEqual(
    changes.map((c) => `${c.schema}:${c.type}`),
    [`${ENTITY_SCHEMA}:create`, `${ENTITY_SCHEMA}:delete`],
  );
  assert.equal(changes[0].key, a);
  assert.equal(changes[1].key, a);
});

test("统一通道：组件 create / update / delete 都是同一种记录", () => {
  const w = new World();
  const changes: Change[] = [];
  w.bus.on(DataChanged, (c) => changes.push(c));

  const e = w.spawn();
  w.add(e, P, { x: 1 });
  w.add(e, P, { x: 2 });
  w.remove(e, P);

  assert.deepEqual(
    changes.map((c) => `${c.schema}:${c.type}`),
    [
      `${ENTITY_SCHEMA}:create`,
      `${componentSchema(P)}:create`,
      `${componentSchema(P)}:update`,
      `${componentSchema(P)}:delete`,
    ],
  );
  assert.deepEqual(changes[2].before, { x: 1 });
  assert.deepEqual(changes[2].after, { x: 2 });
  assert.deepEqual(changes[3].before, { x: 2 });
});

test("set() 也产生 update 记录", () => {
  const w = new World();
  const e = w.spawn();
  w.add(e, H, 100);
  const changes: Change[] = [];
  w.bus.on(DataChanged, (c) => changes.push(c));
  w.set(e, H, 42);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].type, "update");
  assert.equal(changes[0].before, 100);
  assert.equal(changes[0].after, 42);
});

test("onAdd / onRemove 只是这条通道的过滤视图", () => {
  const w = new World();
  const log: string[] = [];
  w.onAdd(P, (_e, v) => log.push(`add:${v.x}`));
  w.onRemove(P, (_e, v) => log.push(`remove:${v.x}`));

  const e = w.spawn();
  w.add(e, P, { x: 7 });
  w.remove(e, P);
  assert.deepEqual(log, ["add:7", "remove:7"]);
});

test("onEntity：实体生命周期的便捷订阅", () => {
  const w = new World();
  const log: string[] = [];
  w.onEntity((c) => log.push(`${c.type}:${c.entity}`));
  const e = w.spawn();
  w.despawn(e);
  assert.deepEqual(log, [`create:${e}`, `delete:${e}`]);
});

test("DB 表变更与 ECS 变更落在同一条通道（真正的统一）", () => {
  const w = new World();
  const store = new Store(defineSchema("unified.weapon", { id: s.string().key(), damage: s.number() }));
  store.bind(w.bus);

  const seen: string[] = [];
  w.bus.on(DataChanged, (c) => seen.push(`${c.schema}:${c.type}`));

  w.spawn();
  store.create({ id: "nail", damage: 8 });
  store.update("nail", { damage: 12 });
  store.delete("nail");

  assert.deepEqual(seen, [
    "ecs/entity:create",
    "unified.weapon:create",
    "unified.weapon:update",
    "unified.weapon:delete",
  ]);
});

test("没有订阅者时不产生记录（hasListeners 短路）", () => {
  const w = new World();
  let calls = 0;
  const off = w.bus.on(DataChanged, () => calls++);
  off();
  w.spawn();
  assert.equal(calls, 0);
});
