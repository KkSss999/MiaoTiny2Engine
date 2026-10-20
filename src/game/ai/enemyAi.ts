import type { MachineDef } from "@core/fsm/index.ts";

export type EnemyCtx = {
  dt: number;
  dx: number;
  dy: number;
  dist: number;
  radius: number;
  playerRadius: number;
  speed: number;
  cd: number;
  /** 沿单位方向按自身速度移动 */
  move: (ux: number, uy: number) => void;
  /** 沿单位方向高速冲刺 */
  charge: (ux: number, uy: number) => void;
  shoot: (angle: number, speed: number, dmg: number) => void;
  hitPlayer: (dmg: number) => void;
  spawnAdd: () => void;
  setCd: (seconds: number) => void;
};

const towardX = (c: EnemyCtx) => c.dx / c.dist;
const towardY = (c: EnemyCtx) => c.dy / c.dist;

const TURRET: MachineDef<EnemyCtx, string> = {
  id: "turret",
  initial: "aim",
  states: {
    aim: {
      update: (c) => {
        if (c.cd <= 0 && c.dist < 900) {
          c.setCd(1.7);
          c.shoot(Math.atan2(c.dy, c.dx), 380, 8);
        }
      },
    },
  },
};

const MELEE: MachineDef<EnemyCtx, string> = {
  id: "melee",
  initial: "chase",
  states: {
    chase: {
      update: (c) => {
        c.move(towardX(c), towardY(c));
        if (c.dist < c.radius + c.playerRadius + 2) c.hitPlayer(9);
      },
    },
  },
};

const BOSS: MachineDef<EnemyCtx, string> = {
  id: "boss",
  initial: "chase",
  states: {
    chase: {
      update: (c) => c.move(towardX(c), towardY(c)),
      transitions: [{ when: (c) => c.cd <= 0, to: "charge" }],
    },
    charge: {
      minTime: 0.45,
      enter: (c) => {
        c.setCd(3.2);
        c.spawnAdd();
        c.spawnAdd();
      },
      update: (c) => {
        c.charge(towardX(c), towardY(c));
        if (c.dist < c.radius + c.playerRadius) c.hitPlayer(16);
      },
      transitions: [{ after: 0.45, to: "chase" }],
    },
  },
};

export const ENEMY_AI: Record<string, MachineDef<EnemyCtx, string>> = {
  melee: MELEE,
  turret: TURRET,
  boss: BOSS,
};
