import test from "node:test";
import assert from "node:assert/strict";
import { InputState } from "../index.ts";

test("press records held state and a one-shot action", () => {
  const input = new InputState();
  input.press("KeyE");

  assert.equal(input.isDown("KeyE"), true);
  assert.equal(input.consume("KeyE"), true);
  assert.equal(input.consume("KeyE"), false, "each press can be consumed once");
  assert.equal(input.isDown("KeyE"), true, "consumption does not affect held state");
});

test("key repeat does not retrigger one-shot actions", () => {
  const input = new InputState();
  input.press("Space");
  input.consume("Space");
  input.press("Space", true); // OS key repeat
  assert.equal(input.consume("Space"), false);
});

test("release clears held state", () => {
  const input = new InputState();
  input.press("KeyW");
  input.release("KeyW");
  assert.equal(input.isDown("KeyW"), false);
});

test("clearFrame clears one-shot presses but retains held state", () => {
  const input = new InputState();
  input.press("KeyW");
  input.press("KeyE");
  input.clearFrame();

  assert.equal(input.isDown("KeyW"), true);
  assert.equal(input.consume("KeyE"), false);
});

test("reset clears all state for focus loss", () => {
  const input = new InputState();
  input.press("KeyW");
  input.pointerDown(10, 20);
  input.reset();

  assert.equal(input.isDown("KeyW"), false);
  assert.equal(input.down, false);
  assert.equal(input.consume("KeyW"), false);
});

test("mouse position and firing state", () => {
  const input = new InputState();
  input.pointerDown(120, 240);
  assert.equal(input.down, true);
  assert.equal(input.mouseX, 120);
  assert.equal(input.mouseY, 240);

  input.pointerUp();
  assert.equal(input.down, false);
});
