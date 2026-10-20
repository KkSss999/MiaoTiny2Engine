import { World, type EntityScope } from "#core/ecs/index.ts";
import { loadContent } from "#content/index.ts";
import { installDamageRules } from "../damage.ts";
import { makeRoomCtx, makeRunCtx, ROOM, RUN } from "../resources.ts";

export type TestWorld = { world: World; scope: EntityScope };

/**
 * 测试用世界：内容表 + 资源 + 伤害规则，和真实开局一致，
 * 只是不挂渲染和输入。
 */
export function makeWorld(): TestWorld {
  loadContent();
  const world = new World();
  world.setResource(RUN, makeRunCtx());
  world.setResource(ROOM, makeRoomCtx());
  installDamageRules(world);
  const scope = world.createScope();
  return { world, scope };
}
