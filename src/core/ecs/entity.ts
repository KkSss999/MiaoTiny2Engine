/** 实体句柄：低 20 位是索引，高 12 位是代数（防止悬空句柄复活） */
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
    this.gens.push(0);
    this.alive.push(true);
    this.count++;
    return makeEntity(fresh, 0);
  }

  destroy(e: Entity): boolean {
    const index = entityIndex(e);
    if (!this.isAlive(e)) return false;
    this.alive[index] = false;
    this.gens[index] = ((this.gens[index] ?? 0) + 1) & GEN_MASK;
    this.free.push(index);
    this.count--;
    return true;
  }

  isAlive(e: Entity): boolean {
    const index = entityIndex(e);
    return this.alive[index] === true && this.gens[index] === entityGen(e);
  }

  clear(): void {
    this.gens = [];
    this.alive = [];
    this.free = [];
    this.count = 0;
  }

  /** 从 0 开始遍历仍然存活的实体（调试/序列化用，正常逻辑走 query） */
  *aliveEntities(): IterableIterator<Entity> {
    for (let i = 0; i < this.gens.length; i++) {
      if (this.alive[i]) yield makeEntity(i, this.gens[i] ?? 0);
    }
  }
}
