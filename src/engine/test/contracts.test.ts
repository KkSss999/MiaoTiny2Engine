import test from "node:test";
import assert from "node:assert/strict";
import { Runtime } from "../runtime/index.ts";
import { Loop } from "../../core/kernel/time/Loop.ts";
import { defineEvent } from "../../core/kernel/event/token.ts";
import { MemoryStorage } from "../../core/db/adapters.ts";
import { createSavePort } from "../save/index.ts";
import { createAssetCatalog, parseManifest } from "../assets/manifest.ts";

test("runtime advances distinct simulation frames, pauses and resets", () => {
  const rt = new Runtime({ clock: new Loop(10) }); const frames: number[][] = [];
  rt.schedule.add("record", (_, c) => frames.push([c.frame, c.elapsed]));
  rt.advance(25); assert.deepEqual(frames, [[1, .01], [2, .02]]);
  rt.pause(); rt.advance(100); assert.equal(rt.frame, 2);
  rt.resume(); rt.advance(5); assert.equal(rt.frame, 3);
  rt.reset(); assert.equal(rt.frame, 0); rt.advance(10); assert.deepEqual(frames.at(-1), [1, .01]);
  rt.dispose(); assert.throws(() => rt.advance(10), /disposed/);
});
test("runtime orders systems commands events and faults without leaking queued work", () => {
  const rt = new Runtime({ clock: new Loop(10) }); const order: string[] = [];
  const e = defineEvent<void>("runtime.order");
  rt.world.bus.on(e, () => order.push("event"));
  rt.schedule.add("system", world => { order.push("system"); world.commands.run(() => order.push("command")); world.bus.post(e, undefined); });
  rt.advance(10); assert.deepEqual(order, ["system", "command", "event"]); assert.equal(rt.world.commands.pending, 0);
  rt.schedule.add("fail", world => { world.commands.run(() => order.push("command")); world.bus.post(e, undefined); throw new Error("broken system"); });
  assert.throws(() => rt.advance(10), /broken system/);
  assert.equal(rt.faulted, true); assert.equal(rt.world.bus.pending, 0); assert.equal(rt.world.commands.pending, 0);
  assert.throws(() => rt.resume(), /faulted/); rt.schedule.remove("fail"); rt.reset(); rt.advance(10);
});
test("save port shares StorageAdapter and propagates parse and persistence failures", async () => {
  const storage = new MemoryStorage(); const save = createSavePort(storage);
  await save.write("a", { value: 3 }); assert.equal(await storage.read("a"), '{"value":3}');
  assert.deepEqual(await save.read("a"), { value: 3 }); await save.remove("a"); assert.equal(await save.read("a"), null);
  await storage.write("a", "invalid"); await assert.rejects(save.read("a"));
  await assert.rejects(save.write("a", undefined), /serializable/);
  const failing = createSavePort({ read: async () => null, write: async () => { throw new Error("quota"); }, delete: async () => { throw new Error("denied"); } });
  await assert.rejects(failing.write("a", 1), /quota/); await assert.rejects(failing.remove("a"), /denied/);
});
test("asset manifests validate duplicates, shapes and isolate caller mutation", () => {
  const raw = { sprites: [{ id: "one", size: [8, 8] }], sheets: [], audio: [] };
  const assets = createAssetCatalog(raw); raw.sprites[0].id = "changed";
  assert.equal(assets.getSpriteEntry("one")?.id, "one");
  assets.getManifest().sprites[0].id = "mutated"; assert.equal(assets.getSpriteEntry("one")?.id, "one");
  assert.throws(() => parseManifest({ ...raw, sprites: [{ id: "x" }, { id: "x" }] }));
  assert.throws(() => parseManifest({ ...raw, sheets: [{ id: "s", rows: 0 }] }));
  assert.throws(() => parseManifest({ ...raw, audio: [{ id: "a", src: "a.ogg", volume: NaN }] }));
  assert.throws(() => parseManifest(null));
});
test("runtime rejects reentrant ticks and resets until outside the tick", () => {
  const rt = new Runtime({ clock: new Loop(10) });
  rt.schedule.add("nested", () => rt.advance(10));
  assert.throws(() => rt.advance(10), /not reentrant/); assert.equal(rt.faulted, true);
  rt.schedule.remove("nested"); rt.reset();
  rt.schedule.add("reset", () => rt.reset()); assert.throws(() => rt.advance(10), /during a simulation tick/);
  rt.schedule.remove("reset"); rt.reset(); rt.advance(10); assert.equal(rt.frame, 1);
});
