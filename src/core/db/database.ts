import type { StorageAdapter } from "./adapters.ts";
import type { Shape } from "./schema.ts";
import type { Table } from "./table.ts";

export type Snapshot = {
  version: number;
  tables: Record<string, unknown[]>;
};

export type Migration = {
  from: number;
  migrate: (snapshot: Snapshot) => Snapshot;
};

export type LoadResult =
  | { ok: true; version: number; migrated: number }
  | { ok: false; error: string; committed?: boolean };

export type ImportOptions = { allowUnknownTables?: boolean };

/**
 * Database: table registry and versioned snapshots.
 *
 * - Seed content tables (weapons/modifiers/room templates) with schema validation; invalid data throws.
 * - Persistent tables use save/load with version migrations.
 */
export class Database {
  version = 1;

  private tables = new Map<string, Table<Shape>>();
  private migrations: Migration[] = [];

  register<S extends Shape>(table: Table<S>): Table<S> {
    if (this.tables.has(table.name)) throw new Error(`Table already registered: ${table.name}`);
    this.tables.set(table.name, table as unknown as Table<Shape>);
    return table;
  }

  table<T>(name: string): Table<T & Shape> {
    const table = this.tables.get(name);
    if (!table) throw new Error(`Table not registered: ${name}`);
    return table as unknown as Table<T & Shape>;
  }

  get tableNames(): string[] {
    return [...this.tables.keys()];
  }

  addMigration(migration: Migration): this {
    this.migrations.push(migration);
    return this;
  }

  export(): Snapshot {
    const tables: Record<string, unknown[]> = {};
    for (const [name, table] of this.tables) tables[name] = table.all();
    return { version: this.version, tables };
  }

  /** Seed content tables; validate each row against its schema and throw ValidationError on failure. */
  seed(name: string, rows: unknown[]): number {
    const table = this.tables.get(name);
    if (!table) throw new Error(`Table not registered: ${name}`);
    let n = 0;
    for (const row of rows) {
      table.insert(row as never);
      n++;
    }
    return n;
  }

  import(snapshot: unknown, options: ImportOptions = {}): number {
    const snap = validateSnapshot(snapshot, this.version);

    let current = snap;
    let migrated = 0;
    while (current.version < this.version) {
      const migration = this.migrations.find((m) => m.from === current.version);
      if (!migration) throw new Error(`Missing migration from v${current.version}`);
      current = validateSnapshot(migration.migrate(structuredClone(current)), this.version);
      migrated++;
      if (current.version <= migration.from) throw new Error(`Migration from v${migration.from} did not advance the version`);
    }

    for (const name of Object.keys(current.tables)) {
      if (!this.tables.has(name)) {
        if (options.allowUnknownTables) continue;
        throw new Error(`Snapshot contains unregistered table: ${name}`);
      }
    }

    // Validate every row and primary-key set before committing any table.
    const stages = [];
    for (const [name, rows] of Object.entries(current.tables)) {
      const table = this.tables.get(name);
      if (table) stages.push(table.prepareReplacement(rows));
    }
    // No user observers run until every table and index has been replaced.
    for (const stage of stages) stage.commit();
    const errors: unknown[] = [];
    for (const stage of stages) {
      try { stage.publish(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new ImportNotificationError(errors);
    return migrated;
  }

  async save(adapter: StorageAdapter, key = "save"): Promise<void> {
    await adapter.write(key, JSON.stringify(this.export()));
  }

  async load(adapter: StorageAdapter, key = "save"): Promise<LoadResult> {
    let raw: string | null;
    try {
      raw = await adapter.read(key);
    } catch (error) {
      return { ok: false, error: `Read failed: ${(error as Error).message}` };
    }
    if (raw === null) return { ok: false, error: "No save found" };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return { ok: false, error: `Save is not valid JSON: ${(error as Error).message}` };
    }
    try {
      const migrated = this.import(parsed);
      return { ok: true, version: this.version, migrated };
    } catch (error) {
      return { ok: false, error: (error as Error).message, committed: error instanceof ImportNotificationError };
    }
  }
}

/** Import succeeded; observers failed after commit. Do not retry the import blindly. */
export class ImportNotificationError extends AggregateError {
  readonly committed = true;
  constructor(errors: unknown[]) {
    super(errors, "Import committed; change listeners failed");
    this.name = "ImportNotificationError";
  }
}

function validateSnapshot(value: unknown, version: number): Snapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Snapshot is not an object");
  const snap = value as Snapshot;
  if (!Number.isSafeInteger(snap.version) || snap.version < 1) throw new Error("Snapshot lacks a valid version");
  if (snap.version > version) throw new Error(`Save version ${snap.version} exceeds current version ${version}; refusing to load`);
  if (typeof snap.tables !== "object" || snap.tables === null || Array.isArray(snap.tables)) throw new Error("Snapshot lacks tables");
  for (const [name, rows] of Object.entries(snap.tables)) {
    if (!Array.isArray(rows)) throw new Error(`Snapshot table ${name} must be an array`);
  }
  return snap;
}
