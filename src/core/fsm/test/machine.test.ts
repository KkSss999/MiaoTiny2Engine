import test from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../../event/index.ts";
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

test("初始状态", () => {
  const def = makeDef();
  const m = createMachine(def);
  assert.equal(m.state, "idle");
  assert.equal(m.time, 0);
});

test("when：条件满足即转移", () => {
  const def = makeDef();
  const m = createMachine(def);
  const c = ctx();
  step(def, m, c, 0.016);
  assert.equal(m.state, "idle");
  c.angry = true;
  step(def, m, c, 0.016);
  assert.equal(m.state, "chase");
});

test("after：停留够时间才转移", () => {
  const def = makeDef();
  const m = createMachine(def);
  const c = ctx();
  m.state = "chase";
  step(def, m, c, 1.0);
  assert.equal(m.state, "chase", "1 秒还不够 1.5 秒");
  step(def, m, c, 0.6);
  assert.equal(m.state, "idle");
});

test("on：触发器驱动，且当帧消费完即清空", () => {
  const def = makeDef();
  const m = createMachine(def);
  const c = ctx();
  m.state = "chase";
  fire(m, "hit");
  step(def, m, c, 0.016);
  assert.equal(m.state, "stagger");
  assert.deepEqual(m.triggers, []);

  // 触发器不残留到下一帧
  m.state = "chase";
  step(def, m, c, 0.016);
  assert.equal(m.state, "chase", "hit 已经被消费掉了");
});

test("转移按声明顺序，第一条命中即生效", () => {
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

test("minTime：拦住所有非 interrupt 转移，interrupt 可以穿透", () => {
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

  // 普通转移被 minTime 拦住
  fire(m, "hit");
  step(def, m, c, 0.1);
  assert.equal(m.state, "attack", "minTime 0.3 未到，hit 不生效");

  // interrupt 转移无视 minTime
  fire(m, "panic");
  step(def, m, c, 0.1);
  assert.equal(m.state, "idle");

  // 过了 minTime 之后普通转移才生效
  const m2 = createMachine(def);
  fire(m2, "hit");
  step(def, m2, c, 0.35);
  assert.equal(m2.state, "stagger");
});

test("enter / exit / update 调用顺序", () => {
  const def = makeDef();
  const m = createMachine(def);
  const c = ctx();
  c.angry = true;
  step(def, m, c, 0.1);
  assert.deepEqual(c.log.slice(0, 1), ["enter:chase"]);

  c.log.length = 0;
  step(def, m, c, 0.1);
  assert.match(c.log[0], /^update:chase:/, "先 update");
  assert.equal(m.state, "chase");

  fire(m, "hit");
  step(def, m, c, 0.01);
  assert.ok(c.log.includes("exit:chase"));
  assert.ok(c.log.includes("enter:stagger"));
  assert.ok(c.log.indexOf("exit:chase") < c.log.indexOf("enter:stagger"));
});

test("stagger 到点自动回到 chase", () => {
  const def = makeDef();
  const m = createMachine(def);
  const c = ctx();
  m.state = "stagger";
  step(def, m, c, 0.25);
  assert.equal(m.state, "chase");
});

test("push / pop：打断后恢复原来的 state 和 time", () => {
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
  assert.equal(m.time, before, "继续原来的计时，而不是重新开始");
});

test("pop 空栈返回 false", () => {
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

test("序列化往返：状态机数据可以 JSON 存读", () => {
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

test("未定义状态直接报错", () => {
  const def = makeDef();
  const m = createMachine(def);
  m.state = "nope" as S;
  assert.throws(() => step(def, m, ctx(), 0.016), /没有状态/);
});

test("一个完整的敌人行为：巡逻 → 发现 → 攻击 → 受击硬直", () => {
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
  assert.equal(m.state, "attack", "minTime 内不许被打断");

  step(def, m, c, 0.5);
  assert.equal(m.state, "attack");

  fire(m, "hit");
  step(def, m, c, 0.016);
  assert.equal(m.state, "stagger", "过了最短停留才可以被打断");
});

test("转移广播到事件总线（FSM 消费 Event）", () => {
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

test("push / pop 也广播", () => {
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

test("不传 bus 时不广播，行为不变", () => {
  const def = makeDef();
  const m = createMachine(def);
  const c = ctx();
  c.angry = true;
  const result = step(def, m, c, 0.016);
  assert.deepEqual(result, { from: "idle", to: "chase" });
});
