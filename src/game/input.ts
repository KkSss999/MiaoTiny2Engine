export const input = {
  keys: new Set<string>(),
  mouseX: 0,
  mouseY: 0,
  down: false,
  pressed: new Set<string>(),

  isDown(code: string) {
    return this.keys.has(code);
  },
  consume(code: string) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  },
  clearFrame() {
    this.pressed.clear();
  },
};

export function attachInput(canvas: HTMLCanvasElement) {
  const kd = (e: KeyboardEvent) => {
    if (!e.repeat) input.pressed.add(e.code);
    input.keys.add(e.code);
    if (["Space", "KeyE", "KeyR"].includes(e.code)) e.preventDefault();
  };
  const ku = (e: KeyboardEvent) => input.keys.delete(e.code);
  const pm = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    input.mouseX = e.clientX - r.left;
    input.mouseY = e.clientY - r.top;
  };
  const pd = (e: PointerEvent) => {
    if (e.button === 0) input.down = true;
    pm(e);
  };
  const pu = (e: PointerEvent) => {
    if (e.button === 0) input.down = false;
  };
  const reset = () => {
    input.keys.clear();
    input.pressed.clear();
    input.down = false;
  };

  // 失焦 / 切走 / 手势取消：全部松开，否则会卡键
  const blur = () => reset();
  const visibility = () => {
    if (document.hidden) reset();
  };

  // 右键会弹出浏览器菜单，期间的 pointerup / keyup 全部丢失，
  // 结果就是"一直开火"或"一直往前走"。直接把菜单禁掉。
  const contextMenu = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    e.preventDefault();
    input.down = false;
  };

  const pointerCancel = () => {
    input.down = false;
  };

  window.addEventListener("keydown", kd);
  window.addEventListener("keyup", ku);
  window.addEventListener("blur", blur);
  window.addEventListener("contextmenu", contextMenu);
  window.addEventListener("pointercancel", pointerCancel);
  document.addEventListener("visibilitychange", visibility);
  canvas.addEventListener("pointermove", pm);
  canvas.addEventListener("pointerdown", pd);
  window.addEventListener("pointerup", pu);

  return () => {
    window.removeEventListener("keydown", kd);
    window.removeEventListener("keyup", ku);
    window.removeEventListener("blur", blur);
    window.removeEventListener("contextmenu", contextMenu);
    window.removeEventListener("pointercancel", pointerCancel);
    document.removeEventListener("visibilitychange", visibility);
    canvas.removeEventListener("pointermove", pm);
    canvas.removeEventListener("pointerdown", pd);
    window.removeEventListener("pointerup", pu);
  };
}