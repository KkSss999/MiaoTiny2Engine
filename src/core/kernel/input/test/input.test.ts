import test from "node:test";
import assert from "node:assert/strict";
import { InputState } from "../index.ts";

test("按下会记录按住与单次触发", () => {
  const input = new InputState();
  input.press("KeyE");

  assert.equal(input.isDown("KeyE"), true);
  assert.equal(input.consume("KeyE"), true);
  assert.equal(input.consume("KeyE"), false, "同一次按下只能消费一次");
  assert.equal(input.isDown("KeyE"), true, "消费不影响按住状态");
});

test("键盘重复不会重复触发单次动作", () => {
  const input = new InputState();
  input.press("Space");
  input.consume("Space");
  input.press("Space", true); // 系统重复
  assert.equal(input.consume("Space"), false);
});

test("松开后不再算按住", () => {
  const input = new InputState();
  input.press("KeyW");
  input.release("KeyW");
  assert.equal(input.isDown("KeyW"), false);
});

test("clearFrame 只清单次触发，保留按住", () => {
  const input = new InputState();
  input.press("KeyW");
  input.press("KeyE");
  input.clearFrame();

  assert.equal(input.isDown("KeyW"), true);
  assert.equal(input.consume("KeyE"), false);
});

test("reset 清空一切（失焦场景）", () => {
  const input = new InputState();
  input.press("KeyW");
  input.pointerDown(10, 20);
  input.reset();

  assert.equal(input.isDown("KeyW"), false);
  assert.equal(input.down, false);
  assert.equal(input.consume("KeyW"), false);
});

test("鼠标位置与开火状态", () => {
  const input = new InputState();
  input.pointerDown(120, 240);
  assert.equal(input.down, true);
  assert.equal(input.mouseX, 120);
  assert.equal(input.mouseY, 240);

  input.pointerUp();
  assert.equal(input.down, false);
});
