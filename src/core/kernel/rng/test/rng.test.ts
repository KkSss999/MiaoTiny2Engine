import test from "node:test";
import assert from "node:assert/strict";
import { makeRng } from "../index.ts";

test("same seeds produce matching results, a prerequisite for reproducible maps", () => {
  const a = makeRng(42);
  const b = makeRng(42);
  const seqA = Array.from({ length: 8 }, () => a.next());
  const seqB = Array.from({ length: 8 }, () => b.next());
  assert.deepEqual(seqA, seqB);
});

test("different seeds produce different results", () => {
  const a = Array.from({ length: 8 }, () => makeRng(1).next());
  const b = Array.from({ length: 8 }, () => makeRng(2).next());
  assert.notDeepEqual(a, b);
});

test("next stays in [0, 1)", () => {
  const rng = makeRng(7);
  for (let i = 0; i < 1000; i++) {
    const v = rng.next();
    assert.ok(v >= 0 && v < 1, `Out of range: ${v}`);
  }
});

test("int uses an inclusive range and reaches both endpoints", () => {
  const rng = makeRng(9);
  const seen = new Set<number>();
  for (let i = 0; i < 500; i++) {
    const v = rng.int(2, 5);
    assert.ok(v >= 2 && v <= 5, `Out of range: ${v}`);
    assert.equal(Number.isInteger(v), true);
    seen.add(v);
  }
  assert.deepEqual([...seen].sort(), [2, 3, 4, 5]);
});

test("pick only returns array elements", () => {
  const rng = makeRng(11);
  const items = ["a", "b", "c"];
  for (let i = 0; i < 100; i++) assert.ok(items.includes(rng.pick(items)));
});

test("shuffle is a permutation with no loss or duplication", () => {
  const rng = makeRng(13);
  const source = Array.from({ length: 20 }, (_, i) => i);
  const shuffled = rng.shuffle([...source]);
  assert.equal(shuffled.length, source.length);
  assert.deepEqual([...shuffled].sort((x, y) => x - y), source);
});

test("chance approximately matches its probability", () => {
  const rng = makeRng(17);
  let hits = 0;
  for (let i = 0; i < 5000; i++) if (rng.chance(0.25)) hits++;
  assert.ok(Math.abs(hits / 5000 - 0.25) < 0.03, `Actual ${(hits / 5000).toFixed(3)}`);
});
