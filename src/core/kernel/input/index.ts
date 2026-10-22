/**
 * Input state tracks pressed controls without assigning gameplay meanings.
 *
 * No DOM dependency; consumers bind platform events,
 * so press/consume/reset logic can be tested without a browser.
 */
export class InputState {
  /** Currently held keys (KeyboardEvent.code). */
  readonly keys = new Set<string>();
  /** Keys newly pressed this frame; each can be consumed once. */
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

  /** Consume a press and return whether it was available, for one-shot actions. */
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

  /** Clear new presses at frame end, retaining held state. */
  clearFrame(): void {
    this.pressed.clear();
  }

  /** Release everything on focus loss/background/context menu to avoid stuck input. */
  reset(): void {
    this.keys.clear();
    this.pressed.clear();
    this.down = false;
  }
}
