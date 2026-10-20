import { InputState } from "#core/input/index.ts";

/**
 * 全局输入状态。键位含义由各系统自己解释（移动、开火、技能……），
 * 这里只负责把浏览器事件翻译成状态。
 */
export const input = new InputState();

export function attachInput(canvas: HTMLCanvasElement): () => void {
  const kd = (e: KeyboardEvent) => {
    input.press(e.code, e.repeat);
    if (["Space", "KeyE", "KeyR"].includes(e.code)) e.preventDefault();
  };

  const ku = (e: KeyboardEvent) => input.release(e.code);

  const pm = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    input.move(e.clientX - rect.left, e.clientY - rect.top);
  };

  const pd = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    input.pointerDown(e.clientX - rect.left, e.clientY - rect.top);
  };

  const pu = (e: PointerEvent) => {
    if (e.button === 0) input.pointerUp();
  };

  // 失焦 / 切后台 / 手势取消：全部松开，否则会卡键
  const blur = () => input.reset();
  const visibility = () => {
    if (document.hidden) input.reset();
  };

  // 右键会弹出浏览器菜单，期间的 pointerup / keyup 全部丢失，
  // 结果就是"一直开火"或"一直往前走"。直接把菜单禁掉。
  const contextMenu = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    e.preventDefault();
    input.pointerUp();
  };

  const pointerCancel = () => input.pointerUp();

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
