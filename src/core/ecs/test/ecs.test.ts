import test from "node:test";
import assert from "node:assert/strict";
import { World, defineComponent, Schedule, createEventChannel } from "../index.ts";

const Position = defineComponent("t.Position", () => ({ x: 0, y: 0 }));
const Velocity = defineComponent("t.Velocity", () => ({ x: 0, y: 0 }));
const Health = defineComponent<number>("t.Health", () => 100);
const Tag = defineComponent("t.Tag", () => ({ name: "" }));

test("spawn / despawn：句柄代数递增，旧句柄不会复活", () => {
  const w = new World();
  const a = w.spawn();
  assert.equal(w.isAlive(a), true);
  assert.equal(w.despawn(a), true);
  assert.equal(w.isAlive(a), false);

  const b = w.spawn();
  assert.notEqual(a, b, "复用了索引但代数必须不同");
  assert.equal(w.isAlive(a), false);
  assert.equal(w.isAlive(b), true);
  assert.equal(w.entityCount, 1);

  w.add(b, Position);
  assert.equal(w.get(a, Position), undefined, "死句柄读不到组件");
});

test("add: 迁移到新 archetype 时保留其它组件", () => {
  const w = new World();
  const e = w.spawn();
  w.add(e, Position, { x: 3, y: 4 });
  w.add(e, Velocity, { x: 1, y: 0 });

  assert.deepEqual(w.require(e, Position), { x: 3, y: 4 });
  assert.deepEqual(w.require(e, Velocity), { x: 1, y: 0 });
  assert.equal(w.query(Position, Velocity).count, 1);
});

test("add 幂等：重复加同一组件只是改值", () => {
  const w = new World();
  const e = w.spawn();
  w.add(e, Position, { x: 1 });
  w.add(e, Position, { x: 9 });
  assert.equal(w.require(e, Position).x, 9);
  assert.equal(w.query(Position).count, 1);
});

test("remove: 只摘掉指定组件，其余数据不丢", () => {
  const w = new World();
  const e = w.spawn();
  w.add(e, Position, { x: 7 });
  w.add(e, Velocity);
  w.remove(e, Velocity);

  assert.equal(w.has(e, Velocity), false);
  assert.equal(w.require(e, Position).x, 7);
  assert.equal(w.query(Position).count, 1);
  assert.equal(w.query(Position, Velocity).count, 0);
});

test("query 缓存：新建 archetype 后能自动匹配到", () => {
  const w = new World();
  const q = w.query(Position);
  assert.equal(q.count, 0);

  const e = w.spawn();
  w.add(e, Position);
  assert.equal(q.count, 1, "同一个 query 对象应看到新 archetype");
});

test("swap-remove：删中间实体后，剩余实体的数据仍然正确", () => {
  const w = new World();
  const a = w.spawn();
  const b = w.spawn();
  const c = w.spawn();
  w.add(a, Position, { x: 1 });
  w.add(b, Position, { x: 2 });
  w.add(c, Position, { x: 3 });

  w.despawn(b);

  assert.equal(w.require(a, Position).x, 1);
  assert.equal(w.require(c, Position).x, 3);
  assert.equal(w.query(Position).count, 2);

  w.add(a, Velocity, { x: 10 });
  assert.deepEqual(w.require(a, Velocity), { x: 10, y: 0 });
  assert.equal(w.require(c, Position).x, 3, "搬动过的实体不能串数据");
});

test("forEach / chunks 传值正确", () => {
  const w = new World();
  for (let i = 0; i < 3; i++) {
    const e = w.spawn();
    w.add(e, Position, { x: i });
    w.add(e, Velocity, { x: i * 2 });
  }

  const seen: number[] = [];
  w.query(Position, Velocity).forEach((_e, pos, vel) => {
    seen.push(pos.x + vel.x);
  });
  assert.deepEqual(seen.sort((a, b) => a - b), [0, 3, 6]);

  let rows = 0;
  for (const chunk of w.query(Position).chunks()) {
    rows += chunk.entities.length;
    assert.equal(chunk.columns[0].length, chunk.entities.length);
  }
  assert.equal(rows, 3);
});

test("queryExcluding 过滤带标记的实体", () => {
  const w = new World();
  const a = w.spawn();
  const b = w.spawn();
  w.add(a, Position);
  w.add(b, Position);
  w.add(b, Tag, { name: "corpse" });

  assert.equal(w.query(Position).count, 2);
  assert.equal(w.queryExcluding([Tag], Position).count, 1);
});

test("commands：结构变更延迟到 flush", () => {
  const w = new World();
  const e = w.spawn();
  w.add(e, Position);

  w.commands.remove(e, Position).add(e, Velocity);
  assert.equal(w.has(e, Position), true, "flush 前不变");
  assert.equal(w.commands.pending, 2);

  w.commands.flush();
  assert.equal(w.has(e, Position), false);
  assert.equal(w.has(e, Velocity), true);
});

test("值类型组件（number）也能正确存取", () => {
  const w = new World();
  const e = w.spawn();
  w.add(e, Health, 42);
  assert.equal(w.require(e, Health), 42);
  w.set(e, Health, 7);
  assert.equal(w.require(e, Health), 7);
});

test("schedule：按 phase 再按加入顺序执行", () => {
  const w = new World();
  const order: string[] = [];
  const s = new Schedule();
  s.add("late", () => order.push("late"), { phase: 10 });
  s.add("early", () => order.push("early"), { phase: -5 });
  s.add("mid1", () => order.push("mid1"));
  s.add("mid2", () => order.push("mid2"));
  s.run(w, { dt: 0, elapsed: 0, frame: 1 });
  assert.deepEqual(order, ["early", "mid1", "mid2", "late"]);
});

test("hooks：组件的 add/remove 回调", () => {
  const w = new World();
  const log: string[] = [];
  w.onAdd(Position, (e, v) => log.push(`add ${e} ${v.x}`));
  w.onRemove(Position, (e) => log.push(`remove ${e}`));

  const e = w.spawn();
  w.add(e, Position, { x: 5 });
  w.remove(e, Position);
  assert.deepEqual(log, [`add ${e} 5`, `remove ${e}`]);
});

test("despawn：实体销毁级联销毁全部组件作用域", () => {
  const w = new World();
  const e = w.spawn();
  w.add(e, Position);
  w.add(e, Health);

  const removed: string[] = [];
  w.componentLifetime(e, Position).onDispose(() => removed.push("pos"));
  w.componentLifetime(e, Health).onDispose(() => removed.push("hp"));

  w.despawn(e);
  assert.deepEqual(removed.sort(), ["hp", "pos"]);
});

test("remove 组件：只销毁该组件的作用域", () => {
  const w = new World();
  const e = w.spawn();
  w.add(e, Position);
  w.add(e, Health);

  const removed: string[] = [];
  w.componentLifetime(e, Position).onDispose(() => removed.push("pos"));
  w.componentLifetime(e, Health).onDispose(() => removed.push("hp"));

  w.remove(e, Position);
  assert.deepEqual(removed, ["pos"]);

  // 重新加回来会拿到一个新的作用域
  w.add(e, Position);
  w.componentLifetime(e, Position).onDispose(() => removed.push("pos2"));
  w.remove(e, Position);
  assert.deepEqual(removed, ["pos", "pos2"]);
});

test("实体生命周期：随实体销毁级联，父作用域先于子作用域", () => {
  const w = new World();
  const e = w.spawn();
  const order: string[] = [];
  w.entityLifetime(e).onDispose(() => order.push("entity"));
  w.add(e, Position);
  w.componentLifetime(e, Position).onDispose(() => order.push("component"));
  w.despawn(e);
  assert.deepEqual(order, ["component", "entity"]);
});

test("world.dispose：世界销毁级联所有实体作用域", () => {
  const w = new World();
  const a = w.spawn();
  const b = w.spawn();
  const order: string[] = [];
  w.entityLifetime(a).onDispose(() => order.push("a"));
  w.entityLifetime(b).onDispose(() => order.push("b"));
  w.dispose();
  assert.equal(order.length, 2);
});

test("组件作用域可以挂任意清理逻辑（视图、定时器、订阅）", () => {
  const w = new World();
  const e = w.spawn();
  w.add(e, Position);
  let cleaned = 0;
  const life = w.componentLifetime(e, Position);
  life.onDispose(() => cleaned++);
  w.despawn(e);
  assert.equal(cleaned, 1);
  // 重复销毁不会重复触发
  life.dispose();
  assert.equal(cleaned, 1);
});

test("event channel：push / drain", () => {
  const ch = createEventChannel<{ dmg: number }>();
  ch.push({ dmg: 3 });
  ch.push({ dmg: 5 });
  assert.equal(ch.size, 2);
  const all = ch.drain();
  assert.deepEqual(all.map((e) => e.dmg), [3, 5]);
  assert.equal(ch.size, 0);
});

test("批量压力：1000 实体增删后数据一致", () => {
  const w = new World();
  const ids: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const e = w.spawn();
    w.add(e, Position, { x: i });
    ids.push(e);
  }
  for (let i = 0; i < 1000; i += 3) w.despawn(ids[i]);

  let sum = 0;
  let n = 0;
  w.query(Position).forEach((_e, p) => {
    sum += p.x;
    n++;
  });

  let expectedN = 0;
  let expectedSum = 0;
  for (let i = 0; i < 1000; i++) {
    if (i % 3 === 0) continue;
    expectedN++;
    expectedSum += i;
  }
  assert.equal(n, expectedN);
  assert.equal(sum, expectedSum);
});