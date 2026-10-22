export type Issue = { path: string; message: string };

export class ValidationError extends Error {
  readonly issues: Issue[];
  constructor(scope: string, issues: Issue[]) {
    super(`${scope} validation failed: \n` + issues.map((i) => `  - ${i.path}: ${i.message}`).join("\n"));
    this.name = "ValidationError";
    this.issues = issues;
  }
}

export type Check<T> = (value: unknown, path: string, issues: Issue[]) => T | undefined;

export interface Validator<T> {
  readonly type: string;
  readonly optionalFlag: boolean;
  readonly keyFlag: boolean;
  run(value: unknown, path: string, issues: Issue[]): T | undefined;
  optional(): Validator<T | undefined>;
  default(value: T | (() => T)): this;
  refine(predicate: (value: T) => boolean, message: string): this;
  key(): this;
}

export type Infer<V> = V extends Validator<infer T> ? T : never;

export type Shape = Record<string, Validator<any>>;
export type AnyShape = Shape;
export type ObjectValue<S> = { [K in keyof S]: Infer<S[K]> };

export class SchemaError extends Error {
  readonly issues: Issue[];
  constructor(issues: Issue[]) {
    super("Invalid schema definition: \n" + issues.map((i) => `  - ${i.path}: ${i.message}`).join("\n"));
    this.name = "SchemaError";
    this.issues = issues;
  }
}

class Builder<T> implements Validator<T> {
  readonly type: string;
  optionalFlag = false;
  keyFlag = false;

  protected check: Check<T>;
  protected defFactory?: () => T;

  constructor(type: string, check: Check<T>) {
    this.type = type;
    this.check = check;
  }

  protected clone(): this {
    const Ctor = this.constructor as unknown as new (type: string, check: Check<T>) => this;
    const next = new Ctor(this.type, this.check);
    next.optionalFlag = this.optionalFlag;
    next.keyFlag = this.keyFlag;
    next.defFactory = this.defFactory;
    return next;
  }

  run(value: unknown, path: string, issues: Issue[]): T | undefined {
    if (value === undefined) {
      if (this.defFactory) return this.defFactory();
      if (this.optionalFlag) return undefined;
      issues.push({ path, message: "Required field missing" });
      return undefined;
    }
    return this.check(value, path, issues);
  }

  optional(): Validator<T | undefined> {
    const next = this.clone();
    next.optionalFlag = true;
    return next as unknown as Validator<T | undefined>;
  }

  default(value: T | (() => T)): this {
    const next = this.clone();
    next.defFactory = typeof value === "function" ? (value as () => T) : () => value;
    return next;
  }

  refine(predicate: (value: T) => boolean, message: string): this {
    const next = this.clone();
    const base = next.check;
    next.check = (value, path, issues) => {
      const parsed = base(value, path, issues);
      if (parsed === undefined) return undefined;
      if (!predicate(parsed)) {
        issues.push({ path, message });
        return undefined;
      }
      return parsed;
    };
    return next;
  }

  key(): this {
    const next = this.clone();
    next.keyFlag = true;
    return next;
  }

  /** Append a constraint; return this so chained calls retain methods. */
  wrap(describe: (parsed: T) => boolean, message: string): this {
    const next = this.clone();
    const base = next.check;
    next.check = (value, path, issues) => {
      const parsed = base(value, path, issues);
      if (parsed === undefined) return undefined;
      if (!describe(parsed)) {
        issues.push({ path, message });
        return undefined;
      }
      return parsed;
    };
    return next;
  }
}

class NumBuilder extends Builder<number> {
  min(n: number): this {
    return this.wrap((v) => v >= n, `Must be at least ${n}`);
  }
  max(n: number): this {
    return this.wrap((v) => v <= n, `Must be at most ${n}`);
  }
  int(): this {
    return this.wrap((v) => Number.isInteger(v), "Must be an integer");
  }
  positive(): this {
    return this.wrap((v) => v > 0, "Must be greater than 0");
  }
}

class StrBuilder extends Builder<string> {
  min(n: number): this {
    return this.wrap((v) => v.length >= n, `Minimum length ${n}`);
  }
  max(n: number): this {
    return this.wrap((v) => v.length <= n, `Maximum length ${n}`);
  }
  pattern(re: RegExp, message?: string): this {
    return this.wrap((v) => re.test(v), message ?? `Does not match ${re}`);
  }
  nonEmpty(): this {
    return this.wrap((v) => v.length > 0, "Must not be empty");
  }
}

class ArrBuilder<T> extends Builder<T[]> {
  min(n: number): this {
    return this.wrap((v) => v.length >= n, `At least ${n} items`);
  }
  max(n: number): this {
    return this.wrap((v) => v.length <= n, `At most ${n} items`);
  }
}

export const s = {
  string(): StrBuilder {
    return new StrBuilder("string", (value, path, issues) => {
      if (typeof value !== "string") {
        issues.push({ path, message: `Expected string, received ${describeType(value)}` });
        return undefined;
      }
      return value;
    });
  },

  number(): NumBuilder {
    return new NumBuilder("number", (value, path, issues) => {
      if (typeof value !== "number" || Number.isNaN(value)) {
        issues.push({ path, message: `Expected number, received ${describeType(value)}` });
        return undefined;
      }
      return value;
    });
  },

  boolean(): Builder<boolean> {
    return new Builder<boolean>("boolean", (value, path, issues) => {
      if (typeof value !== "boolean") {
        issues.push({ path, message: `Expected boolean, received ${describeType(value)}` });
        return undefined;
      }
      return value;
    });
  },

  enumOf<const V extends readonly string[]>(values: V): Builder<V[number]> {
    const allowed = new Set<string>(values as readonly string[]);
    return new Builder<V[number]>("enum", (value, path, issues) => {
      if (typeof value !== "string" || !allowed.has(value)) {
        issues.push({ path, message: `Expected ${values.join(" | ")}, received ${JSON.stringify(value)}` });
        return undefined;
      }
      return value as V[number];
    });
  },

  literal<const V extends string | number | boolean>(value: V): Builder<V> {
    return new Builder<V>("literal", (input, path, issues) => {
      if (input !== value) {
        issues.push({ path, message: `Expected ${JSON.stringify(value)}` });
        return undefined;
      }
      return value;
    });
  },

  array<T>(item: Validator<T>): ArrBuilder<T> {
    return new ArrBuilder<T>("array", (value, path, issues) => {
      if (!Array.isArray(value)) {
        issues.push({ path, message: `Expected array, received ${describeType(value)}` });
        return undefined;
      }
      const out: T[] = [];
      for (let i = 0; i < value.length; i++) {
        const parsed = item.run(value[i], `${path}[${i}]`, issues);
        if (parsed !== undefined) out.push(parsed);
      }
      return out;
    });
  },

  object<S extends AnyShape>(shape: S): Builder<ObjectValue<S>> {
    return new Builder<ObjectValue<S>>("object", (value, path, issues) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        issues.push({ path, message: `Expected object, received ${describeType(value)}` });
        return undefined;
      }
      const input = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(shape)) {
        const parsed = shape[key].run(input[key], path ? `${path}.${key}` : key, issues);
        if (parsed !== undefined) out[key] = parsed;
      }
      for (const key of Object.keys(input)) {
        if (!(key in shape)) issues.push({ path: path ? `${path}.${key}` : key, message: "Unknown field (not declared in schema)" });
      }
      return out as ObjectValue<S>;
    });
  },

  any<T = unknown>(): Builder<T> {
    return new Builder<T>("any", (value) => value as T);
  },
};

export function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function keyFieldOf(shape: AnyShape): string {
  const keys = Object.keys(shape).filter((k) => shape[k].keyFlag);
  if (keys.length === 0) throw new SchemaError([{ path: "schema", message: "No primary key declared (use .key())" }]);
  if (keys.length > 1) throw new SchemaError(keys.slice(1).map((k) => ({ path: k, message: "Only one primary key is allowed" })));
  return keys[0];
}
