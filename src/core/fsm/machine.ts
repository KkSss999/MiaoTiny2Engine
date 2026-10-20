import type { EventBus } from "../event/index.ts";
import { Popped, Pushed, Transitioned } from "./events.ts";

export type StateId = string;

/**
 * 状态机的全部运行时数据：纯数据，可以 JSON 序列化、放进 ECS 组件、存档。
 * 状态机本身不持有任何游戏对象。
 */
export type MachineData<S extends StateId = StateId> = {
  state: S;
  /** 在当前状态里待了多久（秒，由 dt 累加，不读时钟） */
  time: number;
  /** 被打断时压栈的旧状态 */
  stack: { state: S; time: number }[];
  /** 本 tick 待消费的触发器 */
  triggers: string[];
};

export type Transition<C, S extends StateId> = {
  to: S;
  /** 事件触发：本 tick fire 过这个触发器 */
  on?: string;
  /** 每 tick 判定，必须无副作用 */
  when?: (ctx: C) => boolean;
  /** 进入当前状态后经过多少秒 */
  after?: number;
  /** 无视 minTime 强行转移 */
  interrupt?: boolean;
};

export type StateDef<C, S extends StateId> = {
  /** 必须停留的最短时间，期间只有 interrupt 转移能离开 */
  minTime?: number;
  enter?: (ctx: C) => void;
  exit?: (ctx: C) => void;
  update?: (ctx: C, dt: number) => void;
  transitions?: Transition<C, S>[];
};

export type MachineDef<C, S extends StateId = StateId> = {
  id: string;
  initial: S;
  states: Record<S, StateDef<C, S>>;
};

export type StepResult<S extends StateId> = { from: S; to: S } | null;

export function createMachine<C, S extends StateId>(def: MachineDef<C, S>): MachineData<S> {
  return { state: def.initial, time: 0, stack: [], triggers: [] };
}

/** 投递触发器；本 tick 内有效，step 结束后清空 */
export function fire<S extends StateId>(data: MachineData<S>, trigger: string): void {
  if (!data.triggers.includes(trigger)) data.triggers.push(trigger);
}

export function is<S extends StateId>(data: MachineData<S>, state: S): boolean {
  return data.state === state;
}

/**
 * 推进一帧。
 * 顺序：当前状态 update → time 累加 → 按声明顺序找第一条满足的转移 → 执行。
 * 触发器在 tick 结束时清空（事件只对当帧有效）。
 */
export function step<C, S extends StateId>(
  def: MachineDef<C, S>,
  data: MachineData<S>,
  ctx: C,
  dt: number,
  bus?: EventBus,
): StepResult<S> {
  const current = def.states[data.state];
  if (!current) throw new Error(`机器 ${def.id} 没有状态 ${data.state}`);

  current.update?.(ctx, dt);
  data.time += dt;

  const minTime = current.minTime ?? 0;
  let matched: Transition<C, S> | null = null;

  for (const t of current.transitions ?? []) {
    if (data.time < minTime && !t.interrupt) continue;
    if (t.on !== undefined) {
      if (!data.triggers.includes(t.on)) continue;
    } else if (t.when !== undefined) {
      if (!t.when(ctx)) continue;
    } else if (t.after !== undefined) {
      if (data.time < t.after) continue;
    } else {
      continue;
    }
    matched = t;
    break;
  }

  const result = matched ? applyTransition(def, data, matched.to, ctx) : null;
  data.triggers.length = 0;
  if (result && bus) bus.emit(Transitioned, { machine: def.id, from: result.from, to: result.to });
  return result;
}

/** 打断当前状态，压栈后进入新状态 */
export function push<C, S extends StateId>(
  def: MachineDef<C, S>,
  data: MachineData<S>,
  state: S,
  ctx: C,
  bus?: EventBus,
): void {
  const from = data.state;
  def.states[data.state]?.exit?.(ctx);
  data.stack.push({ state: data.state, time: data.time });
  data.state = state;
  data.time = 0;
  def.states[state]?.enter?.(ctx);
  if (bus) bus.emit(Pushed, { machine: def.id, from, to: state });
}

/** 恢复到压栈的状态（不重新触发 enter，语义是"继续"） */
export function pop<C, S extends StateId>(
  def: MachineDef<C, S>,
  data: MachineData<S>,
  ctx: C,
  bus?: EventBus,
): boolean {
  const prev = data.stack.pop();
  if (!prev) return false;
  const from = data.state;
  def.states[data.state]?.exit?.(ctx);
  data.state = prev.state;
  data.time = prev.time;
  if (bus) bus.emit(Popped, { machine: def.id, from, to: prev.state });
  return true;
}

export function reset<C, S extends StateId>(def: MachineDef<C, S>, data: MachineData<S>, ctx: C): void {
  def.states[data.state]?.exit?.(ctx);
  data.state = def.initial;
  data.time = 0;
  data.stack = [];
  data.triggers = [];
  def.states[def.initial]?.enter?.(ctx);
}

function applyTransition<C, S extends StateId>(
  def: MachineDef<C, S>,
  data: MachineData<S>,
  to: S,
  ctx: C,
): StepResult<S> {
  const from = data.state;
  def.states[from]?.exit?.(ctx);
  data.state = to;
  data.time = 0;
  const next = def.states[to];
  if (!next) throw new Error(`机器 ${def.id} 转移到了未定义状态 ${to}`);
  next.enter?.(ctx);
  return { from, to };
}