import type { ComponentType, ValueOf } from "./component.ts";
import type { Archetype } from "./archetype.ts";
import type { Entity } from "./entity.ts";
import type { World } from "./world.ts";

export type Vals<T extends ComponentType<unknown>[]> = { [I in keyof T]: ValueOf<T[I]> };

export interface QueryChunk {
  entities: Entity[];
  columns: unknown[][];
}

/**
 * Match archetypes by component signature and cache matches.
 * Rebuild only when new archetypes appear, using a version check.
 */
export class Query<T extends ComponentType<unknown>[]> {
  private world: World;
  private required: T;
  private excluded: ComponentType<unknown>[];
  private cache: Archetype[] = [];
  private cachedVersion = -1;

  constructor(world: World, required: T, excluded: ComponentType<unknown>[] = []) {
    this.world = world;
    this.required = [...required] as T;
    this.excluded = [...excluded];
  }

  get archetypes(): readonly Archetype[] {
    if (this.cachedVersion !== this.world.archetypeVersion) {
      const ids = this.required.map((t) => t.id);
      const ex = this.excluded.map((t) => t.id);
      this.cache = this.world.allArchetypes.filter((a) => {
        for (const id of ids) if (!a.has(id)) return false;
        for (const id of ex) if (a.has(id)) return false;
        return true;
      });
      this.cachedVersion = this.world.archetypeVersion;
    }
    return this.cache;
  }

  get count(): number {
    let n = 0;
    for (const a of this.archetypes) n += a.size;
    return n;
  }

  /** Snapshot matching entities; allocates an array, so use forEach/chunks in hot paths. */
  collect(): Entity[] {
    const out: Entity[] = [];
    for (const a of this.archetypes) out.push(...a.entities);
    return out;
  }

  forEach(fn: (e: Entity, ...vals: Vals<T>) => void): void {
    const n = this.required.length;
    for (const arch of this.archetypes) {
      const ents = arch.entities;
      const len = ents.length;
      const cols = new Array<unknown[]>(n);
      for (let i = 0; i < n; i++) cols[i] = arch.columns[arch.indexOf(this.required[i].id)];
      for (let row = 0; row < len; row++) {
        const args = new Array<unknown>(n + 1);
        args[0] = ents[row];
        for (let i = 0; i < n; i++) args[i + 1] = cols[i][row];
        (fn as unknown as (...v: unknown[]) => void).apply(undefined, args);
      }
    }
  }

  /** Allocation-free iteration: index columns directly for per-frame movement/collision systems. */
  *chunks(): IterableIterator<QueryChunk> {
    for (const arch of this.archetypes) {
      const cols = this.required.map((t) => arch.columns[arch.indexOf(t.id)]);
      yield { entities: arch.entities, columns: cols };
    }
  }
}
