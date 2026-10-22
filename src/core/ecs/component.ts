import type { ShapeDef } from "../db/index.ts";

let nextComponentId = 0;
const byName = new Map<string, ComponentType<unknown>>();
const byId: ComponentType<unknown>[] = [];

export interface ComponentType<T = unknown> {
  readonly id: number;
  readonly name: string;
  /** Default factory used when add receives no value. */
  readonly create: () => T;
  /** Data shape from @gdd/db; add validates it when validation is enabled. */
  readonly shape?: ShapeDef;
}

/**
 * Component type = a stable id and a default factory.
 * Components must be plain JSON-serializable data; do not store functions in them.
 */
export function defineComponent<T>(
  name: string,
  create: () => T = () => ({}) as T,
  shape?: ShapeDef,
): ComponentType<T> {
  const existing = byName.get(name);
  if (existing) {
    if (existing.create !== create || existing.shape !== shape) {
      throw new Error(`Component name already registered with a different definition: ${name}`);
    }
    return existing as ComponentType<T>;
  }
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
