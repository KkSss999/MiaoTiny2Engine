import type { MachineDef } from "@core/fsm/index.ts";
import type { EnemyDef } from "../content.ts";
import type { Threat } from "./perception.ts";
import { burstRadial, contact, shootFan, shootStraight, summonAdds } from "./attacks.ts";
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

/** 站桩射击 */
const TURRET: MachineDef<EnemyCtx, string> = {
  id: "turret",
  initial: "aim",
  states: {
    aim: {
      update: (c) => {
        shootStraight(c);
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
        walk(c, seek(c.threat));
        contact(c, c.def.damage);
      },
      transitions: [{ when: (c) => c.cd <= 0 && c.def.chargeSpeed > 0, to: "charge" }],
    },
    charge: {
      minTime: 0.2,
      enter: (c) => c.setCd(c.def.chargeInterval),
      update: (c) => {
        c.charge(c.threat.ux, c.threat.uy);
        contact(c, c.def.chargeDamage);
      },
      transitions: [{ after: 0.4, to: "chase" }],
    },
  },
};

/** 保持距离 + 扇形射击：转向和攻击都直接复用原语 */
const KITER: MachineDef<EnemyCtx, string> = {
  id: "kiter",
  initial: "keep",
  states: {
    keep: {
      update: (c) => {
        walk(c, keepDistance(c.threat, c.def.keepDistance));
        if (!shootFan(c, c.def.fanCount, c.def.fanSpread)) {
          // 没开火时小幅游走，避免贴脸站桩
          if (c.threat.dist < c.def.keepDistance * 0.6) walk(c, flee(c.threat));
        }
        contact(c, c.def.damage);
      },
    },
  },
};

/** Boss：追 + 冲撞 + 召唤 + 环形弹幕 */
const BOSS: MachineDef<EnemyCtx, string> = {
  id: "boss",
  initial: "chase",
  states: {
    chase: {
      update: (c) => walk(c, seek(c.threat)),
      transitions: [{ when: (c) => c.cd <= 0, to: "charge" }],
    },
    charge: {
      minTime: 0.45,
      enter: (c) => {
        c.setCd(c.def.chargeInterval);
        summonAdds(c);
        burstRadial(c, c.def.radialCount, Math.random() * Math.PI);
        c.setCd(c.def.chargeInterval);
      },
      update: (c) => {
        c.charge(c.threat.ux, c.threat.uy);
        contact(c, c.def.chargeDamage);
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
  kiter: KITER,
  boss: BOSS,
};