import test from "node:test";
import assert from "node:assert/strict";
import { Health, Level, PlayerTag, Statuses } from "../components.ts";
import { EntityKilled } from "../events.ts";
import { dealDamage } from "../damage.ts";
import { spawnEnemy, spawnPlayer } from "../entities/factory.ts";
import { runCtx } from "../query.ts";
import { applyStatus } from "../status.ts";
import { statusSystem } from "../systems/status.ts";
import { makeWorld } from "./harness.ts";

test("普通伤害扣血", () => {
  const { world, scope } = makeWorld();
  const enemy = spawnEnemy(world, scope, "melee", 0, 0);
  dealDamage(world, { source: null, target: enemy, amount: 10, kind: "bullet", tags: [] });
  assert.equal(world.get(enemy, Health)!.hp, 35);
});

test("等级加成：2 级 +6%", () => {
  const { world, scope } = makeWorld();
  const player = spawnPlayer(world, "human");
  world.get(player, Level)!.level = 2;
  const enemy = spawnEnemy(world, scope, "melee", 0, 0);

  dealDamage(world, { source: player, target: enemy, amount: 10, kind: "bullet", tags: [] });
  // 10 × 1.06 = 10.6 → 四舍五入 11
  assert.equal(world.get(enemy, Health)!.hp, 34);
});

test("诅咒让目标多受 30% 伤害", () => {
  const { world, scope } = makeWorld();
  const enemy = spawnEnemy(world, scope, "melee", 0, 0);
  applyStatus(world, enemy, "curse");

  dealDamage(world, { source: null, target: enemy, amount: 10, kind: "bullet", tags: [] });
  // 10 × 1.3 = 13
  assert.equal(world.get(enemy, Health)!.hp, 32);
});

test("击杀：计数、经验、排队销毁", () => {
  const { world, scope } = makeWorld();
  const player = spawnPlayer(world, "human");
  const enemy = spawnEnemy(world, scope, "melee", 0, 0);

  let killed = 0;
  world.bus.on(EntityKilled, () => {
    killed++;
  });

  dealDamage(world, { source: player, target: enemy, amount: 999, kind: "bullet", tags: [] });

  assert.equal(runCtx(world).kills, 1);
  assert.equal(killed, 1);
  assert.equal(world.get(player, Level)!.xp, 6, "锈蚀者给 6 点经验");
  assert.equal(world.isAlive(enemy), true, "销毁是延迟的");

  world.commands.flush();
  assert.equal(world.isAlive(enemy), false);
});

test("击杀经验按原型表给，而不是写死", () => {
  const { world, scope } = makeWorld();
  const player = spawnPlayer(world, "human");
  const boss = spawnEnemy(world, scope, "boss", 0, 0);

  dealDamage(world, { source: player, target: boss, amount: 9999, kind: "bullet", tags: [] });
  // 60 点经验：升到 2 级（-20）、再升到 3 级（-27），余 13
  const lv = world.get(player, Level)!;
  assert.equal(lv.level, 3);
  assert.equal(lv.xp, 13);
});

test("不死者复活刻印：每局一次", () => {
  const { world } = makeWorld();
  const player = spawnPlayer(world, "undead");
  const hp = world.get(player, Health)!;

  dealDamage(world, { source: null, target: player, amount: 999, kind: "contact", tags: [] });

  const pt = world.get(player, PlayerTag)!;
  assert.equal(pt.revived, true);
  assert.equal(hp.hp, hp.max * 0.5, "复活后回到一半血");
  assert.equal(runCtx(world).over, false);

  dealDamage(world, { source: null, target: player, amount: 999, kind: "contact", tags: [] });
  assert.equal(runCtx(world).over, true, "第二次致命伤结束本局");
});

test("燃烧持续掉血并在到期后清除", () => {
  const { world, scope } = makeWorld();
  const enemy = spawnEnemy(world, scope, "melee", 0, 0);
  applyStatus(world, enemy, "burn");

  for (let i = 0; i < 12; i++) statusSystem(world, 0.1); // 1.2 秒

  const hp = world.get(enemy, Health)!.hp;
  assert.ok(hp < 45, "应该掉了血");
  assert.ok(hp >= 45 - 8, "但不会一次掉太多");

  for (let i = 0; i < 40; i++) statusSystem(world, 0.1); // 再过 4 秒
  assert.equal(world.get(enemy, Statuses)!.list.length, 0, "状态到期后应被移除");
});