import test from "node:test";
import assert from "node:assert/strict";
import { buildNav, computeFlow, flowDir, cellIndexOf } from "../index.ts";
import type { NavRect } from "../index.ts";

const W = 1800;
const H = 1100;

const BORDER: NavRect[] = [
  { x: 0, y: 0, w: W, h: 44 },
  { x: 0, y: H - 44, w: W, h: 44 },
  { x: 0, y: 0, w: 44, h: H },
  { x: W - 44, y: 0, w: 44, h: H },
];

function reachableRatio(nav: ReturnType<typeof buildNav>): number {
  let free = 0;
  let reached = 0;
  for (let i = 0; i < nav.blocked.length; i++) {
    if (nav.blocked[i]) continue;
    free++;
    if (nav.dist[i] >= 0) reached++;
  }
  return free === 0 ? 1 : reached / free;
}

test("empty room: most walkable cells can reach the player", () => {
  const nav = buildNav(BORDER, W, H);
  computeFlow(nav, 900, 550);
  assert.ok(reachableRatio(nav) > 0.9, "empty-room connectivity should approach 100%");
});

test("flow field navigates around a vertical wall", () => {
  const walls = [...BORDER, { x: 860, y: 180, w: 60, h: 740 }];
  const nav = buildNav(walls, W, H);
  computeFlow(nav, 1200, 550);

  const dir = flowDir(nav, 700, 550);
  assert.ok(dir, "a direction should exist left of the wall");
  assert.ok(Math.abs(dir!.x) + Math.abs(dir!.y) > 0.9, "direction should be a unit vector");

  let x = 700;
  let y = 550;
  for (let i = 0; i < 6; i++) {
    const d = flowDir(nav, x, y);
    if (!d) break;
    x += d.x * nav.cell;
    y += d.y * nav.cell;
  }
  assert.ok(Math.hypot(x - 700, y - 550) > nav.cell, "should have actually moved");
});

test("player cell has distance 0 and neighboring distances increase", () => {
  const nav = buildNav(BORDER, W, H);
  computeFlow(nav, 900, 550);
  const center = cellIndexOf(nav, 900, 550);
  assert.equal(nav.dist[center], 0);
  assert.ok(nav.dist[center + 1] >= 1);
  assert.ok(nav.dist[center + nav.cols] >= 1);
});

test("regression: random wall layouts terminate without NaN", () => {
  // The old weighted BFS allowed requeueing; queue overflow produced NaN distances.
  // NaN comparisons then failed, repeatedly requeueing cells and freezing the page.
  const started = performance.now();

  for (let trial = 0; trial < 200; trial++) {
    const walls = [...BORDER];
    const count = 2 + Math.floor(Math.random() * 8);
    for (let i = 0; i < count; i++) {
      walls.push({
        x: 100 + Math.random() * 1500,
        y: 100 + Math.random() * 800,
        w: 60 + Math.random() * 400,
        h: 60 + Math.random() * 400,
      });
    }

    const nav = buildNav(walls, W, H);
    computeFlow(nav, 100 + Math.random() * 1600, 100 + Math.random() * 900);

    for (let i = 0; i < nav.dist.length; i++) {
      assert.ok(!Number.isNaN(nav.dist[i]), "dist must not contain NaN");
    }

    const dir = flowDir(nav, 900, 550);
    assert.ok(dir === null || Number.isFinite(dir.x), "direction must be finite");
  }

  const elapsed = performance.now() - started;
  assert.ok(elapsed < 3000, `200 rooms should finish within 3 seconds; actual ${elapsed.toFixed(0)}ms`);
});

test("return null when trapped instead of an arbitrary direction", () => {
  const cage: NavRect[] = [
    ...BORDER,
    { x: 600, y: 200, w: 600, h: 40 },
    { x: 600, y: 800, w: 600, h: 40 },
    { x: 600, y: 200, w: 40, h: 640 },
    { x: 1160, y: 200, w: 40, h: 640 },
  ];
  const nav = buildNav(cage, W, H);
  computeFlow(nav, 900, 500);
  assert.equal(flowDir(nav, 200, 200), null);
});
