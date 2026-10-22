import test from "node:test";
import assert from "node:assert/strict";
import { FrameDriver, Runtime } from "../runtime/index.ts";
import { InputLatch } from "../inputmap/index.ts";
import { Loop, defineEvent } from "../../core/kernel/index.ts";
import { defineComponent } from "../../core/ecs/index.ts";

const Tick = defineEvent<number>("driver.tick");
const Body = defineComponent("driver.body", () => ({ x: 0 }));
function setup(extra: { control?: () => void; update?: () => void; render?: () => void } = {}) {
  const runtime = new Runtime({ clock: new Loop(10), faultOnEventBacklog: true });
  const input = new InputLatch({ fire: ["Space"] });
  const driver = new FrameDriver({ runtime, input, ...extra });
  return { runtime, input, driver };
}
test("driver orders one fixed step before presentation", () => {
  const trace: string[] = [];
  class TracedInput extends InputLatch {
    override beginStep() { trace.push("begin:1"); super.beginStep(); }
    override finishStep() { super.finishStep(); trace.push("finish:1"); }
  }
  const runtime = new Runtime({ clock: new Loop(10), faultOnEventBacklog: true });
  runtime.schedule.add("system", w => { trace.push("system:1"); w.commands.run(() => trace.push("command:1")); w.bus.post(Tick, 1); });
  runtime.world.bus.on(Tick, () => trace.push("event:1"));
  const driver = new FrameDriver({ runtime, input: new TracedInput(), control: () => { trace.push("input"); }, update: () => { trace.push("update"); }, render: () => { trace.push("render"); } });
  driver.frame(10); assert.equal(driver.state, "idle"); trace.push("boundary");
  assert.deepEqual(trace, ["input", "begin:1", "system:1", "command:1", "event:1", "finish:1", "update", "render", "boundary"]);
  assert.equal(runtime.frame, 1);
});
test("event commands wait for the following step commit", () => {
  const trace: string[] = []; const { runtime, driver } = setup({ render: () => { trace.push(`render:${runtime.world.isAlive(entity)}`); } });
  const entity = runtime.world.spawn(Body);
  runtime.schedule.add("read", (w, c) => { trace.push(`system:${c.frame}:${w.isAlive(entity)}`); w.bus.post(Tick, c.frame); });
  runtime.world.bus.on(Tick, n => { trace.push(`event:${n}`); if (n === 1) runtime.world.commands.run(() => { trace.push("remove:2"); runtime.world.despawn(entity); }); });
  driver.frame(10); driver.frame(0); assert.equal(runtime.world.isAlive(entity), true);
  driver.frame(10);
  assert.deepEqual(trace, ["system:1:true", "event:1", "render:true", "render:true", "system:2:true", "remove:2", "event:2", "render:false"]);
});
test("commands created during flush wait for the next commit", () => {
  const { runtime, driver } = setup(); const trace: string[] = [];
  runtime.world.commands.run(() => { trace.push("first"); runtime.world.commands.run(() => { trace.push("later"); }); });
  driver.frame(10); assert.deepEqual(trace, ["first"]); driver.frame(0); assert.equal(runtime.world.commands.pending, 1);
  driver.frame(10); assert.deepEqual(trace, ["first", "later"]);
});
test("pause requested in a batch applies after that batch", () => {
  let renders = 0; const { runtime, input, driver } = setup({ render: () => { renders++; } });
  const frames: number[] = []; runtime.schedule.add("pause", (w, c) => { frames.push(c.frame); if (c.frame === 1) driver.setPaused(true); w.bus.post(Tick, c.frame); });
  runtime.world.bus.on(Tick, n => { if (n === 2) runtime.world.commands.run(() => { throw Error("must remain pending"); }); });
  input.press("Space"); driver.frame(20); assert.deepEqual(frames, [1, 2]); assert.equal(runtime.paused, true);
  driver.frame(100); assert.equal(runtime.world.commands.pending, 1); assert.equal(renders, 2); assert.equal(input.down("fire"), false);
});
test("reset from a callback runs outside advance without flushing pending work", () => {
  let renders = 0; const { runtime, input, driver } = setup({ render: () => { renders++; } });
  const entity = runtime.world.spawn(Body); const seen: number[] = [];
  runtime.schedule.add("reset", (_, c) => { seen.push(c.frame); if (c.frame === 1) driver.requestReset(); });
  runtime.world.bus.on(Tick, () => { throw Error("not delivered"); });
  input.press("Space"); driver.frame(20);
  assert.deepEqual(seen, [1, 2]); assert.equal(renders, 0); assert.equal(runtime.frame, 0);
  assert.equal(runtime.world.isAlive(entity), false); assert.equal(runtime.schedule.names.length, 1); assert.equal(input.down("fire"), false);
  assert.equal(runtime.world.bus.hasListeners(Tick), false);
  driver.setPaused(true); runtime.world.commands.run(() => { throw Error("not flushed on reset"); }); driver.requestReset();
  assert.equal(runtime.world.commands.pending, 0); assert.equal(runtime.paused, false);
});
test("reset requested by update skips render on a zero-step frame", () => {
  let render = 0; const { runtime, driver } = setup({ update: () => { driver.requestReset(); }, render: () => { render++; } });
  runtime.world.spawn(Body); driver.frame(0); assert.equal(render, 0); assert.equal(runtime.world.entityCount, 0); assert.equal(driver.state, "idle");
});
test("stop coalesces and completes without a future frame", () => {
  let renders = 0; const { runtime, driver } = setup({ render: () => { renders++; } }); const seen: number[] = [];
  const scope = runtime.world.createScope(); scope.lifetime.onDispose(() => { driver.requestReset(); driver.requestStop(); });
  runtime.schedule.add("stop", (_, c) => { seen.push(c.frame); driver.requestReset(); driver.requestStop(); });
  driver.frame(20); assert.deepEqual(seen, [1, 2]); assert.equal(renders, 0);
  assert.equal(driver.state, "stopped"); assert.equal(runtime.isDisposed, true); assert.equal(runtime.schedule.names.length, 0);
  driver.requestStop(); driver.requestReset(); assert.throws(() => driver.frame(0), /stopped/);
  const idle = setup(); idle.driver.requestStop(); assert.equal(idle.runtime.isDisposed, true);
});
test("fault skips projection and still clears entered step input", () => {
  let finishes = 0; let renders = 0;
  class TracedInput extends InputLatch { override finishStep() { finishes++; super.finishStep(); } }
  const runtime = new Runtime({ clock: new Loop(10), faultOnEventBacklog: true }); const input = new TracedInput({ fire: ["Space"] });
  const driver = new FrameDriver({ runtime, input, render: () => { renders++; } });
  runtime.schedule.add("fail", w => { w.commands.run(() => {}); w.bus.post(Tick, 1); throw Error("system failed"); });
  input.press("Space"); assert.throws(() => driver.frame(10), /system failed/);
  assert.equal(finishes, 1); assert.equal(runtime.frame, 0); assert.equal(runtime.world.commands.pending, 0); assert.equal(runtime.world.bus.pending, 0);
  assert.equal(input.down("fire"), false); assert.equal(renders, 0); assert.equal(driver.state, "faulted");
  assert.throws(() => driver.frame(10), /faulted/); runtime.schedule.remove("fail"); driver.requestReset(); driver.frame(10); assert.equal(runtime.frame, 1);
});
test("presentation failures preserve completed time and require reset", () => {
  let fail = true; let renders = 0; const { runtime, driver } = setup({ update: () => { if (fail) throw Error("update failed"); }, render: () => { renders++; } });
  assert.throws(() => driver.frame(10), /update failed/); assert.equal(runtime.frame, 1); assert.equal(renders, 0); assert.equal(driver.state, "faulted");
  fail = false; driver.requestReset(); driver.frame(10); assert.equal(renders, 1);
});
test("nested frames and async callbacks fail visibly", () => {
  const nested = setup({ update: () => { nested.driver.frame(0); } }); assert.throws(() => nested.driver.frame(0), /reentrant/);
  const asynchronous = setup({ update: async () => { throw Error("async rejection"); } });
  assert.throws(() => asynchronous.driver.frame(0), /synchronous/); assert.equal(asynchronous.driver.state, "faulted");
});
test("driver requires strict backlog policy and preserves interpolation across pause", () => {
  assert.throws(() => new FrameDriver({ runtime: new Runtime() }), /backlog/);
  const values: number[] = []; const runtime = new Runtime({ clock: new Loop(10), faultOnEventBacklog: true });
  const driver = new FrameDriver({ runtime, update: view => { values.push(view.alpha); } });
  driver.frame(14); driver.setPaused(true); driver.frame(100); driver.setPaused(false); driver.frame(6);
  assert.deepEqual(values, [.4, .4, 0]); assert.equal(runtime.frame, 2);
  assert.throws(() => driver.frame(NaN), /finite/); assert.equal(driver.state, "idle");
});

test("control pause and lifecycle requests skip simulation at the input boundary", () => {
  let update = 0; const paused = setup({ control: () => { paused.driver.setPaused(true); }, update: () => { update++; } });
  paused.runtime.schedule.add("never", () => { throw Error("paused"); }); paused.driver.frame(20);
  assert.equal(paused.runtime.frame, 0); assert.equal(update, 1);
  const reset = setup({ control: () => { reset.driver.requestReset(); }, update: () => { throw Error("no outgoing presentation"); } });
  reset.runtime.world.spawn(Body); reset.driver.frame(0); assert.equal(reset.runtime.world.entityCount, 0);
  const stop = setup({ control: () => { stop.driver.requestStop(); }, render: () => { throw Error("stopped"); } });
  stop.driver.frame(20); assert.equal(stop.driver.state, "stopped"); assert.equal(stop.runtime.frame, 0);
});
test("stop requested while reset cleans up is terminal and not recursive", () => {
  const { runtime, driver } = setup(); let cleanups = 0;
  runtime.world.createScope().lifetime.onDispose(() => { cleanups++; driver.requestReset(); driver.requestStop(); });
  driver.requestReset(); assert.equal(cleanups, 1); assert.equal(driver.state, "stopped"); assert.equal(runtime.isDisposed, true);
});
test("stop attempts input cleanup even if runtime disposal throws", () => {
  const runtime = new Runtime({ faultOnEventBacklog: true }); const input = new InputLatch({ fire: ["Space"] });
  const driver = new FrameDriver({ runtime, input }); input.press("Space"); driver.frame(0);
  runtime.dispose = () => { throw Error("dispose failed"); };
  assert.throws(() => driver.requestStop(), /dispose failed/); assert.equal(input.down("fire"), false); assert.equal(driver.state, "stopped");
  driver.requestStop(); assert.throws(() => driver.frame(0), /stopped/);
});
test("pause and resume discard pending presses without accumulating paused time", () => {
  const { runtime, input, driver } = setup(); const seen: boolean[] = [];
  runtime.schedule.add("read", () => { seen.push(input.takePress("fire")); });
  input.press("Space"); driver.frame(4); driver.setPaused(true); input.press("KeyF"); driver.frame(1000);
  driver.setPaused(false); input.press("Space", true); driver.frame(6); assert.deepEqual(seen, [false]);
  input.press("Space"); driver.frame(10); assert.deepEqual(seen, [false, true]); assert.equal(runtime.frame, 2);
});
test("render and control failures fault without reusing input", () => {
  const rendering = setup({ render: () => { throw Error("render failed"); } });
  assert.throws(() => rendering.driver.frame(10), /render failed/); assert.equal(rendering.runtime.frame, 1); assert.equal(rendering.driver.state, "faulted");
  const control = setup({ control: () => { throw Error("control failed"); } }); control.input.press("Space");
  assert.throws(() => control.driver.frame(10), /control failed/); assert.equal(control.input.down("fire"), false); assert.equal(control.runtime.frame, 0);
});
test("cleanup errors preserve the frame failure and terminal stop state", () => {
  class FailingReset extends InputLatch { override reset() { super.reset(); throw Error("input cleanup failed"); } }
  const runtime = new Runtime({ faultOnEventBacklog: true });
  const driver = new FrameDriver({ runtime, input: new FailingReset(), update: () => { throw Error("frame failed"); } });
  assert.throws(() => driver.frame(0), (error: unknown) => error instanceof AggregateError && error.errors[0].message === "frame failed" && error.errors[1].message === "input cleanup failed");
  assert.equal(driver.state, "faulted"); assert.throws(() => driver.requestStop(), /input cleanup failed/);
  assert.equal(driver.state, "stopped"); assert.equal(runtime.isDisposed, true);
});
test("rejecting a custom callback thenable does not execute it", async () => {
  let invoked = false;
  const { driver } = setup({ update: () => ({ then() { invoked = true; } }) });
  assert.throws(() => driver.frame(0), /synchronous/);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(invoked, false); assert.equal(driver.state, "faulted");
});
test("simulation pause is visible to presentation after the completed batch", () => {
  const observed: boolean[][] = []; const frames: number[] = [];
  const { runtime, input, driver } = setup({
    update: () => { observed.push([runtime.paused, input.down("fire")]); },
    render: () => { observed.push([runtime.paused, input.down("fire")]); },
  });
  runtime.schedule.add("pause", (_, c) => { frames.push(c.frame); if (c.frame === 1) driver.setPaused(true); });
  input.press("Space"); driver.frame(20);
  assert.deepEqual(frames, [1, 2]); assert.deepEqual(observed, [[true, false], [true, false]]);
});
test("event lifecycle requests settle only after the catch-up batch", () => {
  for (const action of ["reset", "stop"] as const) {
    const frames: number[] = []; const events: number[] = []; let presentations = 0;
    const { runtime, driver } = setup({ update: () => { presentations++; }, render: () => { presentations++; } });
    runtime.schedule.add("event-request", (world, c) => { frames.push(c.frame); world.bus.post(Tick, c.frame); });
    runtime.world.bus.on(Tick, frame => { events.push(frame); if (frame === 1) { if (action === "reset") driver.requestReset(); else driver.requestStop(); } });
    driver.frame(20); assert.deepEqual(frames, [1, 2]); assert.deepEqual(events, [1, 2]); assert.equal(presentations, 0);
    assert.equal(driver.state, action === "reset" ? "idle" : "stopped"); assert.equal(runtime.frame, action === "reset" ? 0 : 2);
  }
});
test("presentation lifecycle requests settle without recursive frames", () => {
  for (const phase of ["update", "render"] as const) for (const action of ["reset", "stop"] as const) {
    const calls: string[] = [];
    const request = () => { if (action === "reset") driver.requestReset(); else driver.requestStop(); };
    const { runtime, driver } = setup({
      update: () => { calls.push("update"); if (phase === "update") request(); },
      render: () => { calls.push("render"); if (phase === "render") request(); },
    });
    driver.frame(10); assert.deepEqual(calls, phase === "update" ? ["update"] : ["update", "render"]);
    assert.equal(driver.state, action === "reset" ? "idle" : "stopped"); assert.equal(runtime.frame, action === "reset" ? 0 : 1);
  }
});
test("stop still completes when its requesting event throws", () => {
  const { runtime, driver } = setup({ render: () => { throw Error("must not render"); } });
  runtime.schedule.add("post", world => { world.bus.post(Tick, 1); });
  runtime.world.bus.on(Tick, () => { driver.requestStop(); throw Error("event failed"); });
  assert.throws(() => driver.frame(20), /event failed/); assert.equal(driver.state, "stopped");
  assert.equal(runtime.isDisposed, true); assert.equal(runtime.frame, 0); assert.equal(runtime.world.bus.pending, 0);
});
