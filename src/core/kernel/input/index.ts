/**
 * 输入状态机：只管"按下了什么"，不知道任何键位含义。
 *
 * 不含 DOM —— 事件绑定留在平台层（src/game/input.ts），
 * 这样"按下—消费—复位"这套逻辑可以脱离浏览器测试。
 */
export class InputState {
  /** 当前按住的键（KeyboardEvent.code） */
  readonly keys = new Set<string>();
  /** 本帧刚按下的键，consume 一次后失效 */
  readonly pressed = new Set<string>();

  mouseX = 0;
  mouseY = 0;
  down = false;

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  press(code: string, repeat = false): void {
    this.keys.add(code);
    if (!repeat) this.pressed.add(code);
  }

  release(code: string): void {
    this.keys.delete(code);
  }

  /** 按下并返回是否消费到（单次触发用） */
  consume(code: string): boolean {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }

  move(x: number, y: number): void {
    this.mouseX = x;
    this.mouseY = y;
  }

  pointerDown(x: number, y: number): void {
    this.down = true;
    this.move(x, y);
  }

  pointerUp(): void {
    this.down = false;
  }

  /** 每帧末清掉"刚按下"，按住状态保留 */
  clearFrame(): void {
    this.pressed.clear();
  }

  /** 失焦/切后台/右键菜单：全部松开，避免卡键 */
  reset(): void {
    this.keys.clear();
    this.pressed.clear();
    this.down = false;
  }
}
