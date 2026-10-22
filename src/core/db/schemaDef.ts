import { s, ValidationError, keyFieldOf, type ObjectValue, type Shape } from "./schema.ts";

export type SchemaOptions = { version?: number };

/**
 * Named schema: a single definition of a data shape.
 * ECS components, FSM state data and game content tables use these definitions.
 */
export type SchemaDef<S extends Shape = Shape> = {
  readonly name: string;
  readonly shape: S;
  readonly key: string;
  readonly version: number;
  parse(value: unknown): ObjectValue<S>;
  create(input?: unknown): ObjectValue<S>;
};

/** Data shape without a primary key, for components and state data. */
export type ShapeDef<S extends Shape = Shape> = {
  readonly name: string;
  readonly shape: S;
  parse(value: unknown): ObjectValue<S>;
};

const shapeRegistry = new Map<string, ShapeDef<Shape>>();

export function defineShape<S extends Shape>(name: string, shape: S): ShapeDef<S> {
  const existing = shapeRegistry.get(name);
  if (existing) {
    assertSameShape(name, existing.shape, shape);
    return existing as unknown as ShapeDef<S>;
  }
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
  if (existing) {
    assertSameShape(name, existing.shape, shape);
    if (existing.version !== (options.version ?? 1)) throw new Error(`Conflicting schema version: ${name}`);
    return existing as unknown as SchemaDef<S>;
  }

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

// Validators may contain arbitrary predicates/default factories, so semantic equality
// cannot be inferred safely. Reuse the original validators for idempotent registration.
function assertSameShape(name: string, existing: Shape, next: Shape): void {
  const keys = Object.keys(existing);
  if (keys.length !== Object.keys(next).length || keys.some((key) => existing[key] !== next[key])) {
    throw new Error(`Conflicting schema definition: ${name}; reuse the original shape or choose a distinct name`);
  }
}
