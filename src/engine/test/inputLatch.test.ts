import test from "node:test";
import assert from "node:assert/strict";
import { InputLatch } from "../inputmap/index.ts";
import { FrameDriver, Runtime } from "../runtime/index.ts";
import { Loop } from "../../core/kernel/index.ts";

const bindings = { fire: ["Space", "KeyF"], accept: ["Space"] };
function setup() {
  const input = new InputLatch(bindings);
  const runtime = new Runtime({ clock: new Loop(10), faultOnEventBacklog: true });
  const driver = new FrameDriver({ runtime, input });
  return { input, runtime, driver };
}
test("zero-step frames retain one edge until the first fixed step", () => {
  const { input, runtime, driver } = setup(); const seen: boolean[] = [];
  runtime.schedule.add("read", () => seen.push(input.takePress("fire")));
  input.press("Space"); driver.frame(4); driver.frame(4); assert.deepEqual(seen, []);
  driver.frame(2); driver.frame(20); assert.deepEqual(seen, [true, false, false]);
});
test("catch-up consumes edges once and preserves held state", () => {
  const { input, runtime, driver } = setup(); const seen: boolean[][] = [];
  runtime.schedule.add("read", () => seen.push([input.takePress("fire"), input.takePress("fire"), input.down("fire")]));
  input.press("Space"); driver.frame(20);
  assert.deepEqual(seen, [[true, false, true], [false, false, true]]);
  const other = setup(); const unconsumed: boolean[] = [];
  other.runtime.schedule.add("read", (_, c) => { if (c.frame === 2) unconsumed.push(other.input.takePress("fire")); });
  other.input.press("Space"); other.driver.frame(20); assert.deepEqual(unconsumed, [false]);
});
test("control consumption and reset prevent ghost actions", () => {
  const input = new InputLatch(bindings); const runtime = new Runtime({ clock: new Loop(10), faultOnEventBacklog: true });
  const driver = new FrameDriver({ runtime, input, control: () => { input.takeControlPress("accept"); } });
  const seen: boolean[] = []; runtime.schedule.add("read", () => seen.push(input.takePress("fire")));
  input.press("Space"); driver.frame(10); assert.deepEqual(seen, [false]);
  input.release("Space"); input.press("KeyF"); input.release("KeyF"); driver.frame(10);
  assert.equal(seen.at(-1), true); assert.equal(input.down("fire"), false);
  input.press("KeyF"); driver.frame(4); input.reset(); input.press("KeyF", true); driver.frame(6);
  assert.equal(seen.at(-1), false); assert.equal(input.down("fire"), false);
});
test("action aliases share physical edges and all matching bindings are consumed", () => {
  const input = new InputLatch(bindings); input.press("Space"); input.press("KeyF");
  input.beginFrame(); input.finishFrame(); input.beginStep();
  assert.equal(input.takePress("fire"), true); assert.equal(input.takePress("accept"), false);
  assert.equal(input.takePress("fire"), false); input.finishStep();
  assert.throws(() => input.takePress("fire"), /step/);
});
test("repeat and repeated ingress do not retrigger held controls", () => {
  const { input, runtime, driver } = setup(); const seen: boolean[] = [];
  runtime.schedule.add("read", () => seen.push(input.takePress("fire")));
  input.press("Space"); driver.frame(10); input.press("Space", true); input.press("Space"); driver.frame(10);
  input.release("Space"); input.press("Space"); driver.frame(10); assert.deepEqual(seen, [true, false, true]);
});
test("latch isolates binding configuration and rejects overlapping phases", () => {
  const map = { go: ["KeyG"] }; const input = new InputLatch(map); map.go[0] = "KeyX";
  input.press("KeyG"); input.beginFrame(); assert.throws(() => input.beginFrame(), /frame/);
  input.finishFrame(); input.beginStep(); assert.equal(input.takePress("go"), true);
  assert.throws(() => input.beginStep(), /step/); input.finishStep(); input.reset();
});
test("unknown action names do not inherit object prototype bindings", () => {
  const input = new InputLatch(); input.beginFrame(); assert.equal(input.takeControlPress("toString"), false);
  input.finishFrame(); input.beginStep(); assert.equal(input.down("constructor"), false); assert.equal(input.takePress("__proto__"), false); input.finishStep();
});
