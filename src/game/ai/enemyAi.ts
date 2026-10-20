import type { MachineDef } from "#core/agent/index.ts";
import type { EnemyDef } from "#content/index.ts";
import type { Threat } from "./perception.ts";
import { contact, firePattern, summonAdds } from "./attacks.ts";
import { approachAtAngle, flee, keepDistance, seek } from "./steering.ts";

/**
 * 敌人行为上下文。
 * 决策（状态机）+ 感知（threat）+ 转向（steering）+ 攻击（attacks）四个层面分开：
 * 行为只做"什么时候调用哪个原语"。
 */
export type EnemyCtx = {
  dt: number;
  def: EnemyDef;
  radius: number;
  playerRadius: number;
  cd: number;
  threat: Threat;
  /** 按 def.speed 位移 */
  move: (ux: number, uy: number) => void;
  /** 按 def.chargeSpeed 位移 */
  charge: (ux: number, uy: number) => void;
  shoot: (angle: number, speed: number, dmg: number) => void;
  hitPlayer: (dmg: number) => void;
  spawnAdd: () => void;
  setCd: (seconds: number) => void;
};

const walk = (c: EnemyCtx, v: { x: number; y: number }) => c.move(v.x, v.y);

/** 只会追着你打 */
const CHASER: MachineDef<EnemyCtx, string> = {
  id: "chaser",
  initial: "chase",
  states: {
    chase: {
      update: (c) => {
        walk(c, approachAtAngle(c.threat, 0.2));
        contact(c, c.def.damage);
      },
    },
  },
};

/**
 * 站桩射击：瞄准 → 前摇 → 开火 → 破绽。
 * 前摇期间不动，给玩家反应时间；破绽期间可被打断（伤害加成由伤害管线处理）。
 */
const TURRET: MachineDef<EnemyCtx, string> = {
  id: "turret",
  initial: "aim",
  states: {
    aim: {
      transitions: [
        {
          when: (c) => c.cd <= 0 && c.threat.los && c.threat.dist <= c.def.projectileRange,
          to: "windup",
        },
      ],
    },
    windup: {
      enter: (c) => c.setCd(c.def.projectileInterval),
      minTime: (c) => c.def.telegraph,
      transitions: [{ after: (c) => c.def.telegraph, to: "fire" }],
    },
    fire: {
      enter: (c) => firePattern(c),
      transitions: [{ after: 0.05, to: "recover" }],
    },
    recover: {
      minTime: (c) => c.def.recover,
      transitions: [{ after: (c) => c.def.recover, to: "aim" }],
    },
  },
};

/** 追 → 蓄力 → 冲锋 → 破绽 */
const CHARGER: MachineDef<EnemyCtx, string> = {
  id: "charger",
  initial: "chase",
  states: {
    chase: {
      update: (c) => {
        walk(c, seek(c.threat));
        contact(c, c.def.damage);
      },
      transitions: [{ when: (c) => c.cd <= 0 && c.def.chargeSpeed > 0, to: "windup" }],
    },
    windup: {
      minTime: (c) => c.def.telegraph,
      transitions: [{ after: (c) => c.def.telegraph, to: "dash" }],
    },
    dash: {
      enter: (c) => c.setCd(c.def.chargeInterval),
      minTime: 0.1,
      update: (c) => {
        c.charge(c.threat.ux, c.threat.uy);
        contact(c, c.def.chargeDamage);
      },
      transitions: [{ after: (c) => c.def.chargeDuration, to: "recover" }],
    },
    recover: {
      minTime: (c) => c.def.recover,
      transitions: [{ after: (c) => c.def.recover, to: "chase" }],
    },
  },
};

/** 保持距离 + 扇形射击：边跑位边架枪 */
const KITER: MachineDef<EnemyCtx, string> = {
  id: "kiter",
  initial: "keep",
  states: {
    keep: {
      update: (c) => walk(c, keepDistance(c.threat, c.def.keepDistance)),
      transitions: [
        {
          when: (c) => c.cd <= 0 && c.threat.los && c.threat.dist <= c.def.projectileRange,
          to: "windup",
        },
      ],
    },
    windup: {
      enter: (c) => c.setCd(c.def.projectileInterval),
      minTime: (c) => c.def.telegraph,
      update: (c) => walk(c, keepDistance(c.threat, c.def.keepDistance)),
      transitions: [{ after: (c) => c.def.telegraph, to: "fire" }],
    },
    fire: {
      enter: (c) => firePattern(c),
      transitions: [{ after: 0.05, to: "recover" }],
    },
    recover: {
      minTime: (c) => c.def.recover,
      update: (c) => walk(c, flee(c.threat)),
      transitions: [{ after: (c) => c.def.recover, to: "keep" }],
    },
  },
};

/** Boss：追 → 蓄力（召唤）→ 冲撞 + 环形弹幕 → 破绽 */
const BOSS: MachineDef<EnemyCtx, string> = {
  id: "boss",
  initial: "chase",
  states: {
    chase: {
      update: (c) => walk(c, seek(c.threat)),
      transitions: [{ when: (c) => c.cd <= 0, to: "windup" }],
    },
    windup: {
      enter: (c) => {
        c.setCd(c.def.chargeInterval);
        summonAdds(c);
      },
      minTime: (c) => c.def.telegraph,
      transitions: [{ after: (c) => c.def.telegraph, to: "dash" }],
    },
    dash: {
      enter: (c) => firePattern(c),
      minTime: 0.1,
      update: (c) => {
        c.charge(c.threat.ux, c.threat.uy);
        contact(c, c.def.chargeDamage);
      },
      transitions: [{ after: (c) => c.def.chargeDuration, to: "recover" }],
    },
    recover: {
      minTime: (c) => c.def.recover,
      transitions: [{ after: (c) => c.def.recover, to: "chase" }],
    },
  },
};

/** 行为注册表：加一种行为 = 加一个状态机；加一个怪 = 在表里写一行 */
export const ENEMY_BEHAVIORS: Record<string, MachineDef<EnemyCtx, string>> = {
  chaser: CHASER,
  turret: TURRET,
  charger: CHARGER,
  kiter: KITER,
  boss: BOSS,
};