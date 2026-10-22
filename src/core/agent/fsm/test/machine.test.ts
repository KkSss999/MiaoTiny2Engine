import test from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../../../kernel/index.ts";
import { createMachine, fire, is, step, push, pop, reset, Transitioned, Pushed, Popped, type MachineDef } from "../index.ts";

type Ctx = { hp: number; angry: boolean; log: string[] };

type S = "idle" | "chase" | "attack" | "stagger";

function makeDef(): MachineDef<Ctx, S> {
  return {
    id: "guard",
    initial: "idle",
    states: {
      idle: {
        transitions: [{ when: (c) => c.angry, to: "chase" }],
      },
      chase: {
        enter: (c) => c.log.push("enter:chase"),
        exit: (c) => c.log.push("exit:chase"),
        update: (c, dt) => c.log.push(`update:chase:${dt}`),
        transitions: [
          { on: "hit", to: "stagger", interrupt: true },
          { after: 1.5, to: "idle" },
        ],
      },
      attack: {
        minTime: 0.3,
        transitions: [{ after: 0.5, to: "chase" }],
      },
      stagger: {
        minTime: 0.2,
        enter: (c) => c.log.push("enter:stagger"),
        transitions: [{ after: 0.2, to: "chase" }],
      },
    },
  };
}

const ctx = (): Ctx => ({ hp: 100, angry: false, log: [] });

test("initial state", () => {
  const def = makeDef();
  const m = createMachine(def);
  assert.equal(m.state, "idle");
  assert.equal(m.time, 0);
});

test("when: transition when the condition matches", () => {
  const def = makeDef();
  const m = createMachine(def);
  const c = ctx();
  step(def, m, c, 0.016);
  assert.equal(m.state, "idle");
  c.angry = true;
  step(def, m, c, 0.016);
  assert.equal(m.state, "chase");
});

test("after: transition after the required duration", () => {
  const def = makeDef();
  const m = createMachine(def);
  const c = ctx();
  m.state = "chase";
  step(def, m, c, 1.0);
  assert.equal(m.state, "chase", "1 second is less than 1.5 seconds");
  step(def, m, c, 0.6);
  assert.equal(m.state, "idle");
});

test("on: trigger-driven transitions consume and clear triggers in the same frame", () => {
  const def = makeDef();
  const m = createMachine(def);
  const c = ctx();
  m.state = "chase";
  fire(m, "hit");
  step(def, m, c, 0.016);
  assert.equal(m.state, "stagger");
  assert.deepEqual(m.triggers, []);

  // Triggers do not survive into the next frame.
  m.state = "chase";
  step(def, m, c, 0.016);
  assert.equal(m.state, "chase", "hit has already been consumed");
});

test("transitions use declaration order and the first match wins", () => {
  const def: MachineDef<Ctx, "a" | "b" | "c"> = {
    id: "order",
    initial: "a",
    states: {
      a: { transitions: [{ when: () => true, to: "b" }, { when: () => true, to: "c" }] },
      b: { transitions: [] },
      c: { transitions: [] },
    },
  };
  const m = createMachine(def);
  step(def, m, ctx(), 0.016);
  assert.equal(m.state, "b");
});

test("minTime: blocks non-interrupt transitions but allows interrupts", () => {
  const def: MachineDef<Ctx, "attack" | "stagger" | "idle"> = {
    id: "minTime",
    initial: "attack",
    states: {
      attack: {
        minTime: 0.3,
        transitions: [
          { on: "hit", to: "stagger" },
          { on: "panic", to: "idle", interrupt: true },
        ],
      },
      stagger: { transitions: [] },
      idle: { transitions: [] },
    },
  };

  const m = createMachine(def);
  const c = ctx();

  // minTime blocks ordinary transitions.
  fire(m, "hit");
  step(def, m, c, 0.1);
  assert.equal(m.state, "attack", "minTime 0.3 has not elapsed; hit has no effect");

  // Interrupt transitions ignore minTime.
  fire(m, "panic");
  step(def, m, c, 0.1);
  assert.equal(m.state, "idle");

  // Ordinary transitions apply only after minTime.
  const m2 = createMachine(def);
  fire(m2, "hit");
  step(def, m2, c, 0.35);
  assert.equal(m2.state, "stagger");
});

test("enter / exit / update invocation order", () => {
  const def = makeDef();
  const m = createMachine(def);
  const c = ctx();
  c.angry = true;
  step(def, m, c, 0.1);
  assert.deepEqual(c.log.slice(0, 1), ["enter:chase"]);

  c.log.length = 0;
  step(def, m, c, 0.1);
  assert.match(c.log[0], /^update:chase:/, "update runs first");
  assert.equal(m.state, "chase");

  fire(m, "hit");
  step(def, m, c, 0.01);
  assert.ok(c.log.includes("exit:chase"));
  assert.ok(c.log.includes("enter:stagger"));
  assert.ok(c.log.indexOf("exit:chase") < c.log.indexOf("enter:stagger"));
});

test("stagger returns to chase when its duration expires", () => {
  const def = makeDef();
  const m = createMachine(def);
  const c = ctx();
  m.state = "stagger";
  step(def, m, c, 0.25);
  assert.equal(m.state, "chase");
});

test("push / pop: resume the original state and time after interruption", () => {
  const def = makeDef();
  const m = createMachine(def);
  const c = ctx();
  m.state = "chase";
  step(def, m, c, 0.4);
  const before = m.time;

  push(def, m, "stagger", c);
  assert.equal(m.state, "stagger");
  assert.equal(m.time, 0);
  assert.equal(m.stack.length, 1);

  pop(def, m, c);
  assert.equal(m.state, "chase");
  assert.equal(m.time, before, "resume the original timer rather than restarting it");
});

test("pop returns false for an empty stack", () => {
  const def = makeDef();
  const m = createMachine(def);
  assert.equal(pop(def, m, ctx()), false);
});

test("is / reset", () => {
  const def = makeDef();
  const m = createMachine(def);
  assert.equal(is(m, "idle"), true);
  m.state = "chase";
  m.time = 2;
  reset(def, m, ctx());
  assert.equal(m.state, "idle");
  assert.equal(m.time, 0);
});

test("serialization round trip: FSM data supports JSON persistence", () => {
  const def = makeDef();
  const m = createMachine(def);
  const c = ctx();
  m.state = "chase";
  step(def, m, c, 0.5);
  push(def, m, "stagger", c);

  const json = JSON.stringify(m);
  const restored = JSON.parse(json) as typeof m;
  assert.deepEqual(restored, m);
  assert.equal(restored.state, "stagger");
  assert.equal(restored.stack[0].state, "chase");
});

test("undefined states throw immediately", () => {
  const def = makeDef();
  const m = createMachine(def);
  m.state = "nope" as S;
  assert.throws(() => step(def, m, ctx(), 0.016), /has no state/);
});

test("complete enemy behavior: patrol → detect → attack → stagger", () => {
  type E = "patrol" | "chase" | "attack" | "stagger";
  type ECtx = { sees: boolean; inRange: boolean; log: string[] };
  const def: MachineDef<ECtx, E> = {
    id: "enemy",
    initial: "patrol",
    states: {
      patrol: { transitions: [{ when: (c) => c.sees, to: "chase" }] },
      chase: {
        transitions: [
          { on: "hit", to: "stagger", interrupt: true },
          { when: (c) => c.inRange, to: "attack" },
        ],
      },
      attack: {
        minTime: 0.4,
        transitions: [{ after: 0.6, to: "chase" }, { on: "hit", to: "stagger" }],
      },
      stagger: { minTime: 0.15, transitions: [{ after: 0.15, to: "chase" }] },
    },
  };
  const m = createMachine(def);
  const c: ECtx = { sees: false, inRange: false, log: [] };

  step(def, m, c, 0.016);
  assert.equal(m.state, "patrol");

  c.sees = true;
  step(def, m, c, 0.016);
  assert.equal(m.state, "chase");

  c.inRange = true;
  step(def, m, c, 0.016);
  assert.equal(m.state, "attack");

  fire(m, "hit");
  step(def, m, c, 0.016);
  assert.equal(m.state, "attack", "cannot interrupt before minTime");

  step(def, m, c, 0.5);
  assert.equal(m.state, "attack");

  fire(m, "hit");
  step(def, m, c, 0.016);
  assert.equal(m.state, "stagger", "can interrupt after the minimum residence time");
});

test("transitions broadcast to the event bus (FSM integrates with Event)", () => {
  const def = makeDef();
  const bus = new EventBus();
  const seen: string[] = [];
  bus.on(Transitioned, (e) => seen.push(`${e.machine}:${e.from}->${e.to}`));

  const m = createMachine(def);
  const c = ctx();
  c.angry = true;
  step(def, m, c, 0.016, bus);
  assert.deepEqual(seen, ["guard:idle->chase"]);

  fire(m, "hit");
  step(def, m, c, 0.016, bus);
  assert.deepEqual(seen, ["guard:idle->chase", "guard:chase->stagger"]);
});

test("push / pop also broadcast", () => {
  const def = makeDef();
  const bus = new EventBus();
  const seen: string[] = [];
  bus.on(Pushed, (e) => seen.push(`push:${e.from}->${e.to}`));
  bus.on(Popped, (e) => seen.push(`pop:${e.from}->${e.to}`));

  const m = createMachine(def);
  const c = ctx();
  m.state = "chase";
  push(def, m, "stagger", c, bus);
  pop(def, m, c, bus);
  assert.deepEqual(seen, ["push:chase->stagger", "pop:stagger->chase"]);
});

test("without a bus, behavior is unchanged and nothing broadcasts", () => {
  const def = makeDef();
  const m = createMachine(def);
  const c = ctx();
  c.angry = true;
  const result = step(def, m, c, 0.016);
  assert.deepEqual(result, { from: "idle", to: "chase" });
});

test("durations can depend on context, such as per-unit windup", () => {
  type C = { telegraph: number };
  const def: MachineDef<C, "windup" | "fire" | "recover"> = {
    id: "ctx-duration",
    initial: "windup",
    states: {
      windup: { transitions: [{ after: (c) => c.telegraph, to: "fire" }] },
      fire: { minTime: (c) => c.telegraph / 2, transitions: [{ after: (c) => c.telegraph / 2, to: "recover" }] },
      recover: {},
    },
  };

  const fast: C = { telegraph: 0.2 };
  const slow: C = { telegraph: 1 };

  const a = createMachine(def);
  step(def, a, slow, 0.15);
  assert.equal(a.state, "windup", "slow unit should not fire at 0.15s");

  const b = createMachine(def);
  step(def, b, fast, 0.15);
  assert.equal(b.state, "windup");
  step(def, b, fast, 0.1);
  assert.equal(b.state, "fire", "fast unit has fired at 0.25s");

  step(def, b, fast, 0.2);
  assert.equal(b.state, "recover", "enter recovery after firing");
});
