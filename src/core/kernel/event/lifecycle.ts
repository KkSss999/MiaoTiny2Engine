export type DisposeFn = () => void;

/**
 * Lifetime primitives: ownership, disposal timing and cascading cleanup.
 *
 * The ownership tree at the base of the stack:
 * - World owns a Lifetime with entities, systems and subscriptions beneath it.
 * - Parent disposal cascades to all children.
 * - Register dependent event/render/DOM/timer cleanup through onDispose.
 */
export class Lifetime {
  private state: "created" | "active" | "disposed" = "created";
  private children = new Set<Lifetime>();
  private hooks: DisposeFn[] = [];
  private owner: Lifetime | null;

  constructor(owner: Lifetime | null = null) {
    this.owner = owner;
    if (owner) owner.adopt(this);
  }

  get disposed(): boolean {
    return this.state === "disposed";
  }

  get active(): boolean {
    return this.state === "active";
  }

  activate(): this {
    if (this.state === "created") this.state = "active";
    return this;
  }

  /** Register cleanup; run immediately if already disposed to avoid late-registration leaks. */
  onDispose(fn: DisposeFn): DisposeFn {
    if (this.state === "disposed") {
      fn();
      return () => {};
    }
    this.hooks.push(fn);
    return () => {
      const i = this.hooks.indexOf(fn);
      if (i >= 0) this.hooks.splice(i, 1);
    };
  }

  /** Create a child lifetime attached to this node. */
  fork(): Lifetime {
    return new Lifetime(this);
  }

  adopt(child: Lifetime): void {
    if (child === this) throw new Error("Lifetime cannot adopt itself");
    if (this.disposed) {
      child.dispose();
      return;
    }
    for (let owner: Lifetime | null = this; owner; owner = owner.owner) {
      if (owner === child) throw new Error("Lifetime ownership cycle");
    }
    if (child.disposed) return;
    child.owner?.children.delete(child);
    child.owner = this;
    this.children.add(child);
  }

  /** Dispose children before self; run callbacks in reverse registration order. */
  dispose(): void {
    if (this.state === "disposed") return;
    this.state = "disposed";
    for (const child of [...this.children]) child.dispose();
    this.children.clear();
    const hooks = this.hooks;
    this.hooks = [];
    for (let i = hooks.length - 1; i >= 0; i--) {
      try {
        hooks[i]();
      } catch (error) {
        console.error("[lifetime] dispose callback threw", error);
      }
    }
    if (this.owner) {
      this.owner.children.delete(this);
      this.owner = null;
    }
  }
}
