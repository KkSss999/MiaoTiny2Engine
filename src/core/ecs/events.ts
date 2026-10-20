/** 类型化事件通道：push 进队，read/drain 消费 */
export class EventChannel<T> {
  private queue: T[] = [];

  get size(): number {
    return this.queue.length;
  }

  push(event: T): void {
    this.queue.push(event);
  }

  *read(): IterableIterator<T> {
    for (let i = 0; i < this.queue.length; i++) yield this.queue[i];
  }

  drain(): T[] {
    const out = this.queue;
    this.queue = [];
    return out;
  }

  clear(): void {
    this.queue = [];
  }
}

export function createEventChannel<T>(): EventChannel<T> {
  return new EventChannel<T>();
}
