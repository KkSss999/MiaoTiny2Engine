import type { EventToken } from "./token.ts";

export type Listener<T> = (payload: T) => void;
export type Unsubscribe = () => void;

export type OnOptions = {
  /** Higher priorities run first; ties follow subscription order. */
  priority?: number;
  once?: boolean;
};

type Entry = {
  fn: (payload: unknown) => void;
  priority: number;
  once: boolean;
  active: boolean;
};

const EMPTY: readonly Entry[] = [];

/**
 * Event bus.
 *
 * - **emit**: synchronous dispatch to current listeners using the subscription snapshot.
 * - **post**: queue for FIFO dispatch in drain(), for events produced in systems and handled at frame end.
 * - Copy-on-write listeners allow subscription changes during dispatch without invalidating iteration.
 */
export class EventBus {
  private listeners = new Map<number, readonly Entry[]>();
  private anyListeners: readonly ((token: EventToken<unknown>, payload: unknown) => void)[] = [];
  private queue: { token: EventToken<unknown>; payload: unknown }[] = [];

  private queueEpoch = 0;
  private draining = false;
  private listenerEpoch = 0;

  get pending(): number {
    return this.queue.length;
  }

  /** Create a lifetime-bound subscription group; disposal unsubscribes all listeners. */
  scoped(lifetime?: { onDispose: (fn: () => void) => unknown }): EventScope {
    return new EventScope(this, lifetime);
  }

  on<T>(token: EventToken<T>, fn: Listener<T>, options: OnOptions = {}): Unsubscribe {
    const entry: Entry = {
      fn: fn as (payload: unknown) => void,
      priority: options.priority ?? 0,
      once: options.once ?? false,
      active: true,
    };
    const current = this.listeners.get(token.id) ?? EMPTY;
    const next = current.slice();
    let at = next.length;
    for (let i = 0; i < next.length; i++) {
      if (next[i].priority < entry.priority) {
        at = i;
        break;
      }
    }
    next.splice(at, 0, entry);
    this.listeners.set(token.id, next);
    return () => {
      this.deactivate(token.id, entry);
    };
  }

  once<T>(token: EventToken<T>, fn: Listener<T>, options: OnOptions = {}): Unsubscribe {
    return this.on(token, fn, { ...options, once: true });
  }

  off<T>(token: EventToken<T>, fn: Listener<T>): boolean {
    const current = this.listeners.get(token.id);
    if (!current) return false;
    let removed = false;
    const next = current.filter((e) => {
      if (removed || e.fn !== (fn as (payload: unknown) => void)) return true;
      e.active = false;
      removed = true;
      return false;
    });
    if (!removed) return false;
    if (next.length) this.listeners.set(token.id, next);
    else this.listeners.delete(token.id);
    return true;
  }

  hasListeners(token: EventToken<unknown>): boolean {
    const list = this.listeners.get(token.id);
    return (list !== undefined && list.length > 0) || this.anyListeners.length > 0;
  }

  /** Dispatch synchronously; return whether any listener received the event. */
  emit<T>(token: EventToken<T>, payload: T): boolean {
    const list = this.listeners.get(token.id);
    const any = this.anyListeners;
    const epoch = this.listenerEpoch;
    if ((list === undefined || list.length === 0) && any.length === 0) return false;

    if (list !== undefined) {
      for (const entry of list) {
        if (!entry.active) continue;
        if (entry.once) this.deactivate(token.id, entry);
        entry.fn(payload);
      }
    }
    for (const fn of any) {
      if (epoch !== this.listenerEpoch) break;
      fn(token as EventToken<unknown>, payload as unknown);
    }
    return true;
  }

  /** Queue for deferred dispatch in drain(). */
  post<T>(token: EventToken<T>, payload: T): void {
    this.queue.push({ token: token as EventToken<unknown>, payload });
  }

  /**
   * Drain the queue in passes; events posted during dispatch enter the next pass.
   * Return the total processed count. maxPasses prevents infinite event chains.
   */
  drain(maxPasses = 32): number {
    if (this.draining) throw new Error("EventBus.drain is not reentrant");
    if (!Number.isInteger(maxPasses) || maxPasses < 0) throw new RangeError("Invalid drain pass limit");
    this.draining = true;
    try {
    let total = 0;
    for (let pass = 0; pass < maxPasses && this.queue.length > 0; pass++) {
      const epoch = this.queueEpoch;
      const batch = this.queue;
      this.queue = [];
      for (let i = 0; i < batch.length; i++) {
        if (epoch !== this.queueEpoch) return total;
        const item = batch[i];
        try {
          this.emit(item.token, item.payload);
          total++;
        } catch (error) {
          // The attempted event is consumed: replay could duplicate listener effects.
          if (epoch === this.queueEpoch) this.queue = [...batch.slice(i + 1), ...this.queue];
          throw error;
        }
      }
    }
    return total;
    } finally { this.draining = false; }
  }

  /** Observe all events for debugging, logging and instrumentation. */
  onAny(fn: (token: EventToken<unknown>, payload: unknown) => void): Unsubscribe {
    const next = [...this.anyListeners, fn];
    this.anyListeners = next;
    return () => {
      this.anyListeners = this.anyListeners.filter((f) => f !== fn);
    };
  }

  /** Discard pending events without removing subscriptions. */
  clearPending(): void {
    this.queueEpoch++;
    this.queue = [];
  }

  clear(): void {
    this.listenerEpoch++;
    for (const list of this.listeners.values()) for (const e of list) e.active = false;
    this.listeners.clear();
    this.anyListeners = [];
    this.clearPending();
  }

  private deactivate(id: number, entry: Entry): void {
    if (!entry.active) return;
    entry.active = false;
    const current = this.listeners.get(id);
    if (!current) return;
    const next = current.filter((e) => e.active);
    if (next.length) this.listeners.set(id, next);
    else this.listeners.delete(id);
  }
}

/** Subscription group for bulk unsubscription across system/UI lifetimes. */
export class EventScope {
  private bus: EventBus;
  private subs: Unsubscribe[] = [];
  private disposed = false;

  /** When a lifetime is supplied, its disposal unsubscribes all listeners. */
  constructor(bus: EventBus, lifetime?: { onDispose: (fn: () => void) => unknown }) {
    this.bus = bus;
    lifetime?.onDispose(() => this.dispose());
  }

  on<T>(token: EventToken<T>, fn: Listener<T>, options: OnOptions = {}): Unsubscribe {
    if (this.disposed) throw new Error("EventScope is disposed");
    const off = this.bus.on(token, fn, options);
    this.subs.push(off);
    return off;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.subs) off();
    this.subs = [];
  }
}
