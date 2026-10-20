import type { MachineDef } from "@core/fsm/index.ts";
import type { EnemyDef } from "../content.ts";

/**
 * 敌人行为上下文：所有数值都来自原型表，
 * 行为本身只描述"什么时候做什么"，不含魔数。
 */
export type EnemyCtx = {
  dt: number;
  dx: number;
  dy: number;
  dist: number;
  radius: number;
  playerRadius: number;
  speed: number;
  cd: number;
  def: EnemyDef;
  move: (ux: number, uy: number) => void;
  charge: (ux: number, uy: number) => void;
  shoot: (angle: number, speed: number, dmg: number) => void;
  hitPlayer: (dmg: number) => void;
  spawnAdd: () => void;
  setCd: (seconds: number) => void;
};

const ux = (c: EnemyCtx) => c.dx / c.dist;
const uy = (c: EnemyCtx) => c.dy / c.dist;
const touching = (c: EnemyCtx) => c.dist < c.radius + c.playerRadius + 2;

/** 只会追着你打 */
const CHASER: MachineDef<EnemyCtx, string> = {
  id: "chaser",
  initial: "chase",
  states: {
    chase: {
      update: (c) => {
        c.move(ux(c), uy(c));
        if (touching(c)) c.hitPlayer(c.def.damage);
      },
    },
  },
};

/** 站桩射击 */
const TURRET: MachineDef<EnemyCtx, string> = {
  id: "turret",
  initial: "aim",
  states: {
    aim: {
      update: (c) => {
        if (c.cd > 0 || c.dist > c.def.projectileRange) return;
        c.setCd(c.def.projectileInterval);
        c.shoot(Math.atan2(c.dy, c.dx), c.def.projectileSpeed, c.def.projectileDamage);
      },
    },
  },
};

/** 追一段，冲一下 */
const CHARGER: MachineDef<EnemyCtx, string> = {
  id: "charger",
  initial: "chase",
  states: {
    chase: {
      update: (c) => {
        c.move(ux(c), uy(c));
        if (touching(c)) c.hitPlayer(c.def.damage);
      },
      transitions: [{ when: (c) => c.cd <= 0 && c.def.chargeSpeed > 0, to: "charge" }],
    },
    charge: {
      minTime: 0.2,
      enter: (c) => c.setCd(c.def.chargeInterval),
      update: (c) => {
        c.charge(ux(c), uy(c));
        if (touching(c)) c.hitPlayer(c.def.chargeDamage);
      },
      transitions: [{ after: 0.4, to: "chase" }],
    },
  },
};

/** Boss：追 + 冲撞 + 召唤 */
const BOSS: MachineDef<EnemyCtx, string> = {
  id: "boss",
  initial: "chase",
  states: {
    chase: {
      update: (c) => c.move(ux(c), uy(c)),
      transitions: [{ when: (c) => c.cd <= 0, to: "charge" }],
    },
    charge: {
      minTime: 0.45,
      enter: (c) => {
        c.setCd(c.def.chargeInterval);
        for (let i = 0; i < c.def.summonCount; i++) c.spawnAdd();
      },
      update: (c) => {
        c.charge(ux(c), uy(c));
        if (touching(c)) c.hitPlayer(c.def.chargeDamage);
      },
      transitions: [{ after: 0.45, to: "chase" }],
    },
  },
};

/** 行为注册表：加一种行为 = 加一个状态机；加一个怪 = 在表里写一行 */
export const ENEMY_BEHAVIORS: Record<string, MachineDef<EnemyCtx, string>> = {
  chaser: CHASER,
  turret: TURRET,
  charger: CHARGER,
  boss: BOSS,
};
