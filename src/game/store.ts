export type GameMode = "menu" | "playing" | "paused";

export type HudState = {
  mode: GameMode;
  race: "human" | "undead";
  hp: number;
  maxHp: number;
  heat: number;
  souls: number;
  dashes: number;
  maxDashes: number;
  room: number;
  rooms: number;
  roomType: string;
  seed: number;
  kills: number;
  level: number;
  xp: number;
  xpNext: number;
  weapon1: string;
  affix1: string;
  weapon2: string;
  affix2: string;
  activeSlot: number;
  implants: string;
  shield: number;
  shieldMax: number;
  skillName: string;
  skillCd: number;
  skillCdMax: number;
  over: boolean;
  won: boolean;
  message: string;
};

let state: HudState = {
  mode: "menu",
  race: "human",
  hp: 100,
  maxHp: 100,
  heat: 0,
  souls: 0,
  dashes: 2,
  maxDashes: 2,
  room: 0,
  rooms: 4,
  roomType: "start",
  seed: 1,
  kills: 0,
  level: 1,
  xp: 0,
  xpNext: 20,
  weapon1: "",
  affix1: "",
  weapon2: "",
  affix2: "",
  activeSlot: 0,
  implants: "",
  shield: 0,
  shieldMax: 0,
  skillName: "",
  skillCd: 0,
  skillCdMax: 1,
  over: false,
  won: false,
  message: "",
};

const subs = new Set<() => void>();

export const hud = {
  get: () => state,
  subscribe: (fn: () => void) => {
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  },
  patch: (p: Partial<HudState>) => {
    let changed = false;
    for (const k of Object.keys(p) as (keyof HudState)[]) {
      if (state[k] !== p[k]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    state = { ...state, ...p };
    subs.forEach((f) => f());
  },
};