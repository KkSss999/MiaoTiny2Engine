import { s, ValidationError, keyFieldOf, type ObjectValue, type Shape } from "./schema.ts";

export type SchemaOptions = { version?: number };

/**
 * 具名 schema：数据形状的唯一定义处。
 * ECS 的组件、FSM 的状态数据、游戏的内容表，都从这里拿定义。
 */
export type SchemaDef<S extends Shape = Shape> = {
  readonly name: string;
  readonly shape: S;
  readonly key: string;
  readonly version: number;
  parse(value: unknown): ObjectValue<S>;
  create(input?: unknown): ObjectValue<S>;
};

/** 无主键的数据形状（组件、状态数据用它） */
export type ShapeDef<S extends Shape = Shape> = {
  readonly name: string;
  readonly shape: S;
  parse(value: unknown): ObjectValue<S>;
};

const shapeRegistry = new Map<string, ShapeDef<Shape>>();

export function defineShape<S extends Shape>(name: string, shape: S): ShapeDef<S> {
  const existing = shapeRegistry.get(name);
  if (existing) return existing as unknown as ShapeDef<S>;
  const validator = s.object(shape);
  const def: ShapeDef<S> = {
    name,
    shape,
    parse(value: unknown): ObjectValue<S> {
      const issues: { path: string; message: string }[] = [];
      const parsed = validator.run(value, "", issues);
      if (issues.length > 0) throw new ValidationError(name, issues);
      return parsed as ObjectValue<S>;
    },
  };
  shapeRegistry.set(name, def as unknown as ShapeDef<Shape>);
  return def;
}

export function getShape(name: string): ShapeDef<Shape> | undefined {
  return shapeRegistry.get(name);
}

const registry = new Map<string, SchemaDef<Shape>>();

export function defineSchema<S extends Shape>(
  name: string,
  shape: S,
  options: SchemaOptions = {},
): SchemaDef<S> {
  const existing = registry.get(name);
  if (existing) return existing as unknown as SchemaDef<S>;

  const key = keyFieldOf(shape);
  const validator = s.object(shape);

  const def: SchemaDef<S> = {
    name,
    shape,
    key,
    version: options.version ?? 1,
    parse(value: unknown): ObjectValue<S> {
      const issues: { path: string; message: string }[] = [];
      const parsed = validator.run(value, "", issues);
      if (issues.length > 0) throw new ValidationError(name, issues);
      return parsed as ObjectValue<S>;
    },
    create(input?: unknown): ObjectValue<S> {
      return def.parse(input ?? {});
    },
  };

  registry.set(name, def as unknown as SchemaDef<Shape>);
  return def;
}

export function getSchema(name: string): SchemaDef<Shape> | undefined {
  return registry.get(name);
}

export function schemaNames(): string[] {
  return [...registry.keys()];
}
