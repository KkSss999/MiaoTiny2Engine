import type { MachineDef } from "#core/fsm/index.ts";

export type PlayerCtx = {
  dt: number;
  /** 本帧输入方向（已归一化；无输入为 0,0） */
  mx: number;
  my: number;
  /** 冲刺方向（起跳时锁定） */
  dashX: number;
  dashY: number;
  move: (ux: number, uy: number, speed: number) => void;
};

export const PLAYER_FSM: MachineDef<PlayerCtx, string> = {
  id: "player",
  initial: "normal",
  states: {
    normal: {
      update: (c) => {
        if (c.mx !== 0 || c.my !== 0) c.move(c.mx, c.my, 240);
      },
      transitions: [{ on: "dash", to: "dash" }],
    },
    dash: {
      minTime: 0.13,
      update: (c) => c.move(c.dashX, c.dashY, 720),
      transitions: [{ after: 0.13, to: "normal" }],
    },
  },
};
