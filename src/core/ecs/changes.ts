import type { Change } from "../db/index.ts";
import type { ComponentType } from "./component.ts";
import type { Entity } from "./entity.ts";

export const ENTITY_SCHEMA = "ecs/entity";

export function componentSchema(type: ComponentType<unknown>): string {
  return `component/${type.name}`;
}

export function entityCreated(e: Entity): Change {
  return { schema: ENTITY_SCHEMA, type: "create", key: e, after: { entity: e } };
}

export function entityDestroyed(e: Entity): Change {
  return { schema: ENTITY_SCHEMA, type: "delete", key: e, before: { entity: e } };
}

export function componentChange(
  type: ComponentType<unknown>,
  kind: "create" | "update" | "delete",
  e: Entity,
  value: unknown,
): Change {
  const change: Change = { schema: componentSchema(type), type: kind, key: e };
  if (kind === "delete") change.before = value;
  else change.after = value;
  return change;
}
