/** 矩形（墙、门、掩体都用它） */
export type Rect = { x: number; y: number; w: number; h: number };

export type Slot = { x: number; y: number; kind: "enemy" | "barrel" | "crystal" };

export type RoomTemplate = {
  id: string;
  walls: Rect[];
  slots: Slot[];
  /** 每个掩体独立被丢弃的概率，用来制造同模板的不同变体 */
  dropChance?: number;
};

const P = (x: number, y: number, w = 80, h = 80): Rect => ({ x, y, w, h });

export const TEMPLATES: Record<string, RoomTemplate> = {
  open: {
    id: "open",
    dropChance: 0.15,
    walls: [P(360, 240), P(1360, 240), P(360, 780), P(1360, 780)],
    slots: [
      { x: 900, y: 300, kind: "enemy" }, { x: 900, y: 800, kind: "enemy" },
      { x: 1400, y: 550, kind: "enemy" }, { x: 500, y: 550, kind: "barrel" },
    ],
  },
  pillars: {
    id: "pillars",
    dropChance: 0.1,
    walls: [P(600, 260), P(600, 760), P(1140, 260), P(1140, 760), P(870, 510, 60, 80)],
    slots: [
      { x: 900, y: 250, kind: "enemy" }, { x: 900, y: 850, kind: "enemy" },
      { x: 1350, y: 550, kind: "enemy" }, { x: 1450, y: 900, kind: "crystal" },
    ],
  },
  cross: {
    id: "cross",
    dropChance: 0.1,
    walls: [P(870, 120, 60, 300), P(870, 680, 60, 300), P(300, 520, 380, 60), P(1120, 520, 380, 60)],
    slots: [
      { x: 600, y: 250, kind: "enemy" }, { x: 1200, y: 250, kind: "enemy" },
      { x: 600, y: 850, kind: "enemy" }, { x: 1200, y: 850, kind: "enemy" },
      { x: 900, y: 550, kind: "barrel" },
    ],
  },
  lane: {
    id: "lane",
    dropChance: 0.2,
    walls: [P(420, 180, 60, 740), P(1320, 180, 60, 740)],
    slots: [
      { x: 800, y: 300, kind: "enemy" }, { x: 1000, y: 800, kind: "enemy" },
      { x: 620, y: 550, kind: "barrel" }, { x: 1180, y: 550, kind: "crystal" },
    ],
  },
  crates: {
    id: "crates",
    dropChance: 0.3,
    walls: [P(300, 200, 120, 120), P(1380, 200, 120, 120), P(300, 780, 120, 120), P(1380, 780, 120, 120)],
    slots: [
      { x: 900, y: 350, kind: "enemy" }, { x: 900, y: 750, kind: "enemy" },
      { x: 700, y: 550, kind: "barrel" }, { x: 1100, y: 550, kind: "barrel" },
    ],
  },
  room: {
    id: "room",
    dropChance: 0.15,
    walls: [P(700, 380, 400, 60), P(700, 660, 400, 60)],
    slots: [
      { x: 900, y: 220, kind: "enemy" }, { x: 900, y: 880, kind: "enemy" },
      { x: 1450, y: 550, kind: "enemy" }, { x: 350, y: 550, kind: "crystal" },
    ],
  },
};
