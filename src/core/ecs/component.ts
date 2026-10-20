import type { ShapeDef } from "../db/index.ts";

let nextComponentId = 0;
const byName = new Map<string, ComponentType<unknown>>();
const byId: ComponentType<unknown>[] = [];

export interface ComponentType<T = unknown> {
  readonly id: number;
  readonly name: string;
  /** 缺省值工厂：add 时不给值就用它 */
  readonly create: () => T;
  /** 数据形状来自 @gdd/db；开启校验时 add 会过一遍 */
  readonly shape?: ShapeDef;
}

/**
 * 组件类型 = 一个稳定 id + 一个缺省值工厂。
 * 组件本身永远是纯数据（可以 JSON 序列化），不要放函数进去。
 */
export function defineComponent<T>(
  name: string,
  create: () => T = () => ({}) as T,
  shape?: ShapeDef,
): ComponentType<T> {
  const existing = byName.get(name);
  if (existing) return existing as ComponentType<T>;
  const type: ComponentType<T> = { id: nextComponentId++, name, create, shape };
  byName.set(name, type as ComponentType<unknown>);
  byId[type.id] = type as ComponentType<unknown>;
  return type;
}

export function getComponentById(id: number): ComponentType<unknown> | undefined {
  return byId[id];
}

export function componentName(type: ComponentType<unknown>): string {
  return type.name;
}

export type ValueOf<T> = T extends ComponentType<infer U> ? U : never;
