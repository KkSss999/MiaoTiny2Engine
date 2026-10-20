import test from "node:test";
import assert from "node:assert/strict";
import { Health, Implants, Loadout } from "../components.ts";
import { spawnPlayer } from "../entities/factory.ts";
import { applyReward, buildRewards } from "../rewards.ts";
import { makeWorld } from "./harness.ts";

test("三选一：三个选项，不会重复给已有植入体", () => {
  const { world } = makeWorld();
  const player = spawnPlayer(world, "human");
  const owned = world.get(player, Implants)!.ids;

  for (let i = 0; i < 30; i++) {
    const options = buildRewards(world, "human");
    assert.equal(options.length, 3);

    for (const option of options) {
      if (option.kind !== "implant") continue;
      assert.ok(!owned.includes(option.implantId), "不能给已经装着的植入体");
    }
  }
});

test("拿到植入体奖励后进入槽位", () => {
  const { world } = makeWorld();
  const player = spawnPlayer(world, "human");
  const before = world.get(player, Implants)!.ids.length;

  const option = buildRewards(world, "human").find((o) => o.kind === "implant");
  assert.ok(option, "至少应有一个植入体选项");

  applyReward(world, player, option!);
  const after = world.get(player, Implants)!;
  assert.equal(after.ids.length, before + 1);
  assert.ok(after.cds.some((c) => c.id === (option as { implantId: string }).implantId));
});

test("武器奖励会进当前槽位", () => {
  const { world } = makeWorld();
  const player = spawnPlayer(world, "human");
  const option = buildRewards(world, "human").find((o) => o.kind === "weapon");
  assert.ok(option);

  applyReward(world, player, option!);
  const loadout = world.get(player, Loadout)!;
  const slot = loadout.slots[loadout.active];
  assert.equal(slot.weaponId, (option as { weaponId: string }).weaponId);
  assert.equal(slot.affixId, (option as { affixId: string }).affixId);
});

test("回血奖励不会超过上限", () => {
  const { world } = makeWorld();
  const player = spawnPlayer(world, "human");
  const hp = world.get(player, Health)!;
  hp.hp = hp.max - 10;

  applyReward(world, player, { kind: "heal", name: "应急修复", desc: "" });
  assert.equal(hp.hp, hp.max);
});
