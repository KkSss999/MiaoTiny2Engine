export type Race = "human" | "undead";

export type Driver = {
  start: (race: Race, seed?: number) => void;
  restart: () => void;
  pause: () => void;
  resume: () => void;
  toMenu: () => void;
  pickReward: (index: number) => void;
};

let current: Driver | null = null;

/** UI → 游戏 的单向命令通道；只认最后一个"活着的"实例 */
export const api = {
  start: (race: Race, seed?: number) => current?.start(race, seed),
  restart: () => current?.restart(),
  pause: () => current?.pause(),
  resume: () => current?.resume(),
  toMenu: () => current?.toMenu(),
  pickReward: (index: number) => current?.pickReward(index),
  bind: (d: Driver) => {
    current = d;
  },
  unbind: (d: Driver) => {
    if (current === d) current = null;
  },
};