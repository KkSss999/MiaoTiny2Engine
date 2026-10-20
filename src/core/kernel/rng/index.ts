/**
 * 种子化随机（mulberry32）。
 * 纯算法，不含任何游戏语义：地图生成、粒子、镜头抖动共用。
 */
export type Rng = {
  next: () => number;
  int: (min: number, max: number) => number;
  pick: <T>(arr: readonly T[]) => T;
  chance: (p: number) => boolean;
  shuffle: <T>(arr: T[]) => T[];
};

export function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)];
  const chance = (p: number) => next() < p;
  const shuffle = <T,>(arr: T[]): T[] => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  return { next, int, pick, chance, shuffle };
}