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
  const blur = () => {
    input.keys.clear();
    input.down = false;
  };

  window.addEventListener("keydown", kd);
  window.addEventListener("keyup", ku);
  window.addEventListener("blur", blur);
  canvas.addEventListener("pointermove", pm);
  canvas.addEventListener("pointerdown", pd);
  window.addEventListener("pointerup", pu);

  return () => {
    window.removeEventListener("keydown", kd);
    window.removeEventListener("keyup", ku);
    window.removeEventListener("blur", blur);
    canvas.removeEventListener("pointermove", pm);
    canvas.removeEventListener("pointerdown", pd);
    window.removeEventListener("pointerup", pu);
  };
}
