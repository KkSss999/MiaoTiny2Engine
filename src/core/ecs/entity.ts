/** Entity handle: low 20 bits index, high 12 bits generation, preventing stale-handle revival. */
export type Entity = number;

const INDEX_BITS = 20;
const INDEX_MASK = (1 << INDEX_BITS) - 1;
const GEN_MASK = 0xfff;

export const entityIndex = (e: Entity): number => e & INDEX_MASK;
export const entityGen = (e: Entity): number => (e >>> INDEX_BITS) & GEN_MASK;
export const makeEntity = (index: number, gen: number): Entity => ((gen & GEN_MASK) << INDEX_BITS) | index;

export class EntityAllocator {
  private gens: number[] = [];
  private alive: boolean[] = [];
  private free: number[] = [];
  private count = 0;

  get size(): number {
    return this.count;
  }

  create(): Entity {
    const index = this.free.pop();
    if (index !== undefined) {
      const gen = this.gens[index] ?? 0;
      this.alive[index] = true;
      this.count++;
      return makeEntity(index, gen);
    }
    const fresh = this.gens.length;
    if (fresh > INDEX_MASK) throw new Error("Entity capacity exhausted");
    this.gens.push(0);
    this.alive.push(true);
    this.count++;
    return makeEntity(fresh, 0);
  }

  destroy(e: Entity): boolean {
    const index = entityIndex(e);
    if (!this.isAlive(e)) return false;
    this.alive[index] = false;
    // Never wrap a generation: retire exhausted slots rather than revive stale handles.
    if (this.gens[index] < GEN_MASK) {
      this.gens[index]++;
      this.free.push(index);
    }
    this.count--;
    return true;
  }

  isAlive(e: Entity): boolean {
    if (!Number.isInteger(e) || e !== (e | 0)) return false;
    const index = entityIndex(e);
    return this.alive[index] === true && this.gens[index] === entityGen(e);
  }

  clear(): void {
    for (const e of this.aliveEntities()) this.destroy(e);
  }

  /** Iterate live entities from index 0 for debugging/serialization; use queries for normal logic. */
  *aliveEntities(): IterableIterator<Entity> {
    for (let i = 0; i < this.gens.length; i++) {
      if (this.alive[i]) yield makeEntity(i, this.gens[i] ?? 0);
    }
  }
}
