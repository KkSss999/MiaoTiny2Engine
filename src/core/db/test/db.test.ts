import test from "node:test";
import assert from "node:assert/strict";
import { s, Database, Table, defineTable, MemoryStorage, ValidationError, Store, StoreChanged, defineSchema, getSchema, schemaNames, type Change, defineShape, LocalStorageAdapter } from "../index.ts";
import { EventBus } from "../../kernel/index.ts";

// ---------------------------------------------------------------- schema

test("schema：基础类型 + 约束", () => {
  const shape = {
    id: s.string().key(),
    damage: s.number().min(0).max(100),
    name: s.string().min(1),
    kind: s.enumOf(["gun", "melee"] as const),
    tags: s.array(s.string()),
    enabled: s.boolean(),
  };
  const parsed = s.object(shape).run(
    { id: "a", damage: 10, name: "钉枪", kind: "gun", tags: ["工业", "远程"], enabled: true },
    "",
    [],
  );
  assert.deepEqual(parsed, { id: "a", damage: 10, name: "钉枪", kind: "gun", tags: ["工业", "远程"], enabled: true });
});

test("schema：越界 / 类型错 / 枚举错都会报出字段路径", () => {
  const shape = { hp: s.number().int().min(0), kind: s.enumOf(["a", "b"] as const) };
  const issues: { path: string; message: string }[] = [];
  s.object(shape).run({ hp: -1, kind: "c" }, "", issues);
  assert.equal(issues.length, 2);
  assert.deepEqual(issues.map((i) => i.path).sort(), ["hp", "kind"]);
});

test("schema：必填缺失 vs optional vs default", () => {
  const shape = { a: s.number(), b: s.number().optional(), c: s.number().default(7) };
  const issues: { path: string; message: string }[] = [];
  const missing = s.object(shape).run({}, "", issues);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].path, "a");
  assert.equal((missing as { c: number }).c, 7, "default 会被填上");

  const ok = s.object(shape).run({ a: 1, b: 2 }, "", []);
  assert.deepEqual(ok, { a: 1, b: 2, c: 7 });
});

test("schema：未知字段会被拒绝（防止拼写错误静默丢失）", () => {
  const issues: { path: string; message: string }[] = [];
  s.object({ a: s.number() }).run({ a: 1, typo: 2 }, "", issues);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /未知字段/);
});

test("schema：嵌套 object 与数组下标路径", () => {
  const shape = {
    hitbox: s.object({ r: s.number().min(0) }),
    list: s.array(s.object({ x: s.number() })),
  };
  const issues: { path: string; message: string }[] = [];
  s.object(shape).run({ hitbox: { r: -1 }, list: [{ x: 0 }, { x: "bad" }] }, "", issues);
  assert.deepEqual(issues.map((i) => i.path).sort(), ["hitbox.r", "list[1].x"]);
});

test("schema：refine 自定义约束", () => {
  const even = s.number().refine((v) => v % 2 === 0, "必须是偶数");
  const issues: { path: string; message: string }[] = [];
  even.run(3, "n", issues);
  assert.equal(issues[0].message, "必须是偶数");
});

test("schema：没有 .key() 会直接报错", () => {
  assert.throws(() => defineTable("bad", { id: s.string() }), /主键/);
});

// ----------------------------------------------------------------- table

const Weapon = {
  id: s.string().min(1).key(),
  name: s.string(),
  damage: s.number().min(0),
  tags: s.array(s.string()),
};

test("table：insert / get / update / remove", () => {
  const t = defineTable("weapons", Weapon);
  t.insert({ id: "nail", name: "钉枪", damage: 8, tags: ["工业"] });
  assert.equal(t.get("nail")?.name, "钉枪");
  assert.equal(t.size, 1);

  t.update("nail", { damage: 12 });
  assert.equal(t.get("nail")?.damage, 12);

  assert.equal(t.remove("nail"), true);
  assert.equal(t.remove("nail"), false);
  assert.equal(t.size, 0);
});

test("table：主键重复 / 校验失败都会抛", () => {
  const t = defineTable("w2", Weapon);
  t.insert({ id: "a", name: "A", damage: 1, tags: [] });
  assert.throws(() => t.insert({ id: "a", name: "B", damage: 1, tags: [] }), ValidationError);
  assert.throws(() => t.insert({ id: "b", name: "B", damage: -5, tags: [] }), /damage/);
});

test("table：update 会重新校验", () => {
  const t = defineTable("w3", Weapon);
  t.insert({ id: "a", name: "A", damage: 1, tags: [] });
  assert.throws(() => t.update("a", { damage: -1 }), /damage/);
  assert.equal(t.get("a")?.damage, 1, "失败不应写入");
});

test("table：二级索引（标量）", () => {
  const t = defineTable("w4", Weapon);
  t.indexBy("damage");
  t.insert({ id: "a", name: "A", damage: 5, tags: [] });
  t.insert({ id: "b", name: "B", damage: 5, tags: [] });
  t.insert({ id: "c", name: "C", damage: 9, tags: [] });

  assert.equal(t.find("damage", 5).length, 2);
  t.update("a", { damage: 9 });
  assert.equal(t.find("damage", 5).length, 1);
  t.remove("b");
  assert.equal(t.find("damage", 5).length, 0);
  assert.equal(t.find("damage", 9).length, 2);
});

test("table：数组字段的多值索引", () => {
  const t = defineTable("w5", Weapon);
  t.indexBy("tags");
  t.insert({ id: "a", name: "A", damage: 1, tags: ["火", "远程"] });
  t.insert({ id: "b", name: "B", damage: 1, tags: ["远程"] });
  assert.equal(t.find("tags", "远程").length, 2);
  assert.equal(t.find("tags", "火").length, 1);
  t.update("a", { tags: ["冰"] });
  assert.equal(t.find("tags", "远程").length, 1);
  assert.equal(t.find("tags", "冰").length, 1);
});

test("table：where / all 快照", () => {
  const t = defineTable("w6", Weapon);
  for (let i = 0; i < 5; i++) t.insert({ id: `w${i}`, name: `W${i}`, damage: i, tags: [] });
  assert.equal(t.all().length, 5);
  assert.equal(t.where((r) => r.damage >= 3).length, 2);
  const snap = t.all();
  t.remove("w0");
  assert.equal(snap.length, 5, "all() 返回的是快照");
});

// -------------------------------------------------------------- database

const Meta = { key: s.string().key(), value: s.number() };

function makeDb() {
  const db = new Database();
  const weapons = defineTable("weapons", Weapon);
  const meta = defineTable("meta", Meta);
  db.register(weapons);
  db.register(meta);
  return { db, weapons, meta };
}

test("db：seed 内容表并 export", () => {
  const { db, weapons } = makeDb();
  const n = db.seed("weapons", [{ id: "a", name: "A", damage: 1, tags: [] }]);
  assert.equal(n, 1);
  const snap = db.export();
  assert.equal(snap.version, 1);
  assert.equal((snap.tables.weapons as unknown[]).length, 1);
  assert.equal(weapons.size, 1);
});

test("db：import 往返一致", () => {
  const { db } = makeDb();
  db.seed("weapons", [{ id: "a", name: "A", damage: 1, tags: ["x"] }]);
  const snap = JSON.parse(JSON.stringify(db.export()));

  const { db: db2 } = makeDb();
  db2.import(snap);
  assert.deepEqual(db2.export(), snap);
});

test("db：import 会拒绝未注册的表 / 过新版本 / 坏数据", () => {
  const { db } = makeDb();
  assert.throws(() => db.import({ version: 1, tables: { nope: [] } }), /未注册/);
  assert.throws(() => db.import({ version: 99, tables: {} }), /版本/);
  assert.throws(() => db.import({ version: 1, tables: { weapons: [{ id: "a" }] } }), /weapons/);
});

test("db：版本迁移从 v1 到 v2", () => {
  const { db } = makeDb();
  db.version = 2;
  db.addMigration({
    from: 1,
    migrate: (snap) => ({
      version: 2,
      tables: {
        ...snap.tables,
        weapons: (snap.tables.weapons as { damage: number }[]).map((w) => ({ ...w, damage: w.damage * 2 })),
      },
    }),
  });

  const migrated = db.import({ version: 1, tables: { weapons: [{ id: "a", name: "A", damage: 5, tags: [] }] } });
  assert.equal(migrated, 1);
  assert.equal((db.export().tables.weapons[0] as { damage: number }).damage, 10);
});

test("db：缺迁移会明确报错", () => {
  const { db } = makeDb();
  db.version = 3;
  assert.throws(() => db.import({ version: 1, tables: {} }), /缺少从 v1/);
});

test("db：save / load 走适配器", async () => {
  const storage = new MemoryStorage();
  const { db } = makeDb();
  db.seed("weapons", [{ id: "a", name: "A", damage: 3, tags: [] }]);
  await db.save(storage, "slot1");

  const { db: db2 } = makeDb();
  const result = await db2.load(storage, "slot1");
  assert.equal(result.ok, true);
  assert.equal(db2.table<{ id: string }>("weapons").find("id", "a").length, 1);
});

test("db：load 处理空档 / 坏 JSON", async () => {
  const storage = new MemoryStorage();
  const { db } = makeDb();
  const empty = await db.load(storage, "none");
  assert.equal(empty.ok, false);

  await storage.write("broken", "{not json");
  const broken = await db.load(storage, "broken");
  assert.equal(broken.ok, false);
  if (!broken.ok) assert.match(broken.error, /JSON/);
});

test("db：坏存档不会污染已有数据", async () => {
  const storage = new MemoryStorage();
  const { db } = makeDb();
  db.seed("weapons", [{ id: "keep", name: "K", damage: 1, tags: [] }]);
  await storage.write("bad", JSON.stringify({ version: 1, tables: { weapons: [{ id: "x" }] } }));
  const res = await db.load(storage, "bad");
  assert.equal(res.ok, false);
  assert.equal(db.table<{ id: string }>("weapons").all().length, 1);
});

test("table 泛型：defineTable 推导出正确的行类型", () => {
  const t: Table<typeof Weapon> = defineTable("typed", Weapon);
  t.insert({ id: "a", name: "A", damage: 1, tags: ["t"] });
  const row = t.require("a");
  const name: string = row.name;
  const damage: number = row.damage;
  assert.equal(name, "A");
  assert.equal(damage, 1);
});
// ------------------------------------------------------------- store / bus

test("Store：变更广播 create / update / delete", () => {
  const store = new Store(defineSchema("bus.probe", { id: s.string().key(), v: s.number() }));
  const seen: string[] = [];
  store.onChange((c) => seen.push(`${c.type}:${String(c.key)}`));

  store.create({ id: "a", v: 1 });
  store.update("a", { v: 2 });
  store.delete("a");

  assert.deepEqual(seen, ["create:a", "update:a", "delete:a"]);
});

test("Store：update 变更里带 before / after", () => {
  const store = new Store(defineSchema("bus.probe2", { id: s.string().key(), v: s.number() }));
  store.create({ id: "a", v: 1 });
  let captured: Change | undefined;
  store.onChange((c) => {
    if (c.type === "update") captured = c as Change;
  });
  store.update("a", { v: 9 });
  assert.equal((captured?.before as { v: number }).v, 1);
  assert.equal((captured?.after as { v: number }).v, 9);
});

test("Store.bind：变更转发到事件总线（DB 消费 Event）", () => {
  const bus = new EventBus();
  const store = new Store(defineSchema("bus.probe3", { id: s.string().key(), v: s.number() }));
  store.bind(bus);

  const got: string[] = [];
  bus.on(StoreChanged, (c) => got.push(`${c.schema}:${c.type}`));

  store.create({ id: "a", v: 1 });
  store.delete("a");

  assert.deepEqual(got, ["bus.probe3:create", "bus.probe3:delete"]);
});

test("defineSchema：具名 schema 可复用、可校验、带默认值", () => {
  const schema = defineSchema("content.weapon", {
    id: s.string().key(),
    damage: s.number().min(0),
    pellets: s.number().int().default(1),
  });
  assert.equal(getSchema("content.weapon"), schema);
  assert.ok(schemaNames().includes("content.weapon"));

  const row = schema.create({ id: "nail", damage: 8 });
  assert.equal(row.pellets, 1);
  assert.throws(() => schema.create({ id: "x", damage: -1 }), ValidationError);
});

test("Table 的二级索引由总线驱动", () => {
  const t = defineTable("indexBus", { id: s.string().key(), tags: s.array(s.string()) });
  t.indexBy("tags");
  t.insert({ id: "a", tags: ["火"] });
  t.insert({ id: "b", tags: ["火", "冰"] });
  assert.equal(t.find("tags", "火").length, 2);
  t.update("a", { tags: ["冰"] });
  assert.equal(t.find("tags", "火").length, 1);
  assert.equal(t.find("tags", "冰").length, 2);
});

// --------------------------------------------------------- safety regressions

test("import duplicate keys in a later table leaves every live table and index untouched", () => {
  const { db, weapons, meta } = makeDb();
  weapons.indexBy("tags");
  weapons.insert({ id: "old", name: "old", damage: 1, tags: ["keep"] });
  meta.insert({ key: "old", value: 1 });
  const before = db.export();
  let changes = 0;
  weapons.onChange(() => changes++);
  assert.throws(() => db.import({ version: 1, tables: {
    weapons: [{ id: "new", name: "new", damage: 2, tags: ["new"] }],
    meta: [{ key: "same", value: 1 }, { key: "same", value: 2 }],
  } }), /主键重复/);
  assert.deepEqual(db.export(), before);
  assert.equal(weapons.find("tags", "keep").length, 1);
  assert.equal(changes, 0);
});

test("import commits all tables and indexes before notifying, even if a listener throws", async () => {
  const { db, weapons, meta } = makeDb();
  weapons.indexBy("tags");
  weapons.insert({ id: "old", name: "old", damage: 1, tags: ["old"] });
  const observed: string[] = [];
  weapons.onChange(() => {
    assert.equal(meta.require("new").value, 9);
    assert.equal(weapons.find("tags", "new").length, 1);
    assert.equal(weapons.find("tags", "old").length, 0);
    throw new Error("observer failure");
  });
  weapons.onChange((change) => observed.push(change.type));
  meta.onChange(() => observed.push("meta"));
  const storage = new MemoryStorage();
  await storage.write("new", JSON.stringify({ version: 1, tables: {
    weapons: [{ id: "new", name: "new", damage: 2, tags: ["new"] }],
    meta: [{ key: "new", value: 9 }],
  } }));
  const result = await db.load(storage, "new");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.committed, true);
    assert.match(result.error, /committed/);
  }
  assert.deepEqual(observed, ["delete", "create", "meta"]);
  assert.equal(weapons.size, 1);
  assert.equal(meta.size, 1);
});

test("DB boundaries detach mutable input, return values, predicates and notifications", () => {
  const table = defineTable("detached.rows", { id: s.string().key(), tags: s.array(s.string()), extra: s.any<{ nested: number[] }>() });
  table.indexBy("tags");
  const input = { id: "a", tags: ["original"], extra: { nested: [1] } };
  const created = table.insert(input);
  input.extra.nested.push(2);
  created.tags.push("create");
  table.require("a").tags.push("require");
  table.get("a")!.extra.nested.push(3);
  table.list()[0].tags.push("list");
  table.find("tags", "original")[0].tags.push("find");
  table.query((row) => { row.tags.push("predicate"); return true; });
  table.onChange((change) => { change.after?.tags.push("listener"); });
  let second: string[] = [];
  table.onChange((change) => { second = change.after!.tags; });
  table.update("a", { tags: ["updated"] }).tags.push("update");
  assert.deepEqual(table.require("a"), { id: "a", tags: ["updated"], extra: { nested: [1] } });
  assert.deepEqual(second, ["updated"]);
  assert.equal(table.find("tags", "updated").length, 1);
  assert.equal(table.find("tags", "listener").length, 0);
});

test("invalid migration output and malformed snapshots never change rows", () => {
  for (const output of [null, { version: NaN, tables: {} }, { version: 3, tables: {} }, { version: 2, tables: { meta: {} } }]) {
    const { db, meta } = makeDb();
    db.version = 2;
    meta.insert({ key: "keep", value: 1 });
    const before = db.export();
    db.addMigration({ from: 1, migrate: () => output as never });
    assert.throws(() => db.import({ version: 1, tables: {} }));
    assert.deepEqual(db.export(), before);
  }
});

test("schema registration rejects ambiguous replacement definitions", () => {
  const shape = { id: s.string().key(), value: s.number() };
  const schema = defineSchema("duplicate.contract", shape);
  assert.equal(defineSchema("duplicate.contract", shape), schema);
  assert.equal(defineSchema("duplicate.contract", { ...shape }), schema);
  assert.throws(() => defineSchema("duplicate.contract", { id: s.string().key(), value: s.string() }), /Conflicting/);
  assert.throws(() => defineSchema("duplicate.contract", shape, { version: 2 }), /version/);
});

test("shape registration rejects incompatible aliases", () => {
  const shape = { value: s.number() };
  const definition = defineShape("duplicate.shape", shape);
  assert.equal(defineShape("duplicate.shape", shape), definition);
  assert.throws(() => defineShape("duplicate.shape", { value: s.string() }), /Conflicting/);
});

test("DB rejects nonprimitive primary keys before mutation", () => {
  const table = defineTable("invalid.key", { id: s.any().key() });
  for (const id of [{}, [], NaN, Infinity, null]) assert.throws(() => table.insert({ id }), /主键/);
  assert.equal(table.size, 0);
});

test("localStorage adapter fails observably when unavailable", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: undefined });
  try {
    const adapter = new LocalStorageAdapter();
    await assert.rejects(adapter.read("x"), /unavailable/);
    await assert.rejects(adapter.write("x", "{}"), /unavailable/);
    await assert.rejects(adapter.delete("x"), /unavailable/);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
