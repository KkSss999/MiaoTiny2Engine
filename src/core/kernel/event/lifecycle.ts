export type DisposeFn = () => void;

/**
 * 生命周期原语：谁拥有谁、什么时候销毁、销毁时连带什么。
 *
 * 这是整个栈最底层的"所有权树"：
 * - World 持有 Lifetime，实体/系统/订阅都挂在它下面
 * - 父节点 dispose 会级联销毁全部子节点
 * - 所有需要"跟着一起死"的东西（事件订阅、渲染对象、DOM 监听、定时器）都注册 onDispose
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

  /** 注册销毁回调；如果已经销毁，立即执行（避免"注册在销毁之后"的泄漏） */
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

  /** 创建子生命周期，自动挂在当前节点下 */
  fork(): Lifetime {
    return new Lifetime(this);
  }

  adopt(child: Lifetime): void {
    if (child === this) throw new Error("Lifetime 不能收养自己");
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

  /** 级联销毁：先子后己，回调按注册的逆序执行 */
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
        console.error("[lifetime] dispose 回调抛错", error);
      }
    }
    if (this.owner) {
      this.owner.children.delete(this);
      this.owner = null;
    }
  }
}
