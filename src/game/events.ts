import { defineEvent } from "@core/ecs/index.ts";
import type { Entity } from "@core/ecs/index.ts";
import type { RoomType } from "./gen/floor.ts";

/** 延迟事件：房间清空（由编排层在帧末处理视觉表现） */
export const RoomCleared = defineEvent<{ roomId: string; type: RoomType }>("game:RoomCleared");
/** 同步事件：敌人被击杀（后续词条/刻印挂这里，比如“击杀召唤骷髅”） */
export const EntityKilled = defineEvent<{ entity: Entity; byPlayer: boolean }>("game:EntityKilled");
/** 同步事件：玩家受伤（护盾、吸血、受击特效都挂这里） */
export const PlayerDamaged = defineEvent<{ amount: number; hp: number }>("game:PlayerDamaged");
/** 换房完成：房间数据已就绪，表现层据此重绘场景 */
export const RoomEntered = defineEvent<{ roomId: string; type: RoomType; visited: number; total: number }>("game:RoomEntered");
/** 玩家开火：表现层用来播后坐/挥砍动画 */
export const WeaponFired = defineEvent<{
  player: number;
  weaponId: string;
  behavior: string;
  angle: number;
}>("game:WeaponFired");
