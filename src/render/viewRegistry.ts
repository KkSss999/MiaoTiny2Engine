import type { Container } from "pixi.js";
import type { Entity, World } from "#core/ecs/index.ts";
import { Position, SpriteRef } from "../game/components.ts";
import type { Layer } from "../game/layers.ts";
import { createSpriteView } from "./assets.ts";
import type { LayerMap } from "./layerContainers.ts";

type SpriteRefValue = { spriteId: string; layer: Layer; rotation: string; scale: number; popIn: boolean };

/**
 * 实体 ↔ 显示对象 的绑定表。
 * 逻辑层只写 SpriteRef 组件；这里负责创建/销毁 / 挂到对应图层。
 */
export class ViewRegistry {
  private world: World;
  private layers: LayerMap;
  private views = new Map<Entity, Container>();

  constructor(world: World, layers: LayerMap) {
    this.world = world;
    this.layers = layers;
  }

  /**
   * 只订阅「组件出现」；删除不订阅。
   * 视图挂在组件作用域上，组件被移除或实体销毁时由 Lifetime 级联销毁。
   */
  bind(): void {
    this.world.onAdd(SpriteRef, (e, ref) => {
      this.attach(e, ref as SpriteRefValue);
    });
  }

  get(e: Entity): Container | undefined {
    return this.views.get(e);
  }

  get size(): number {
    return this.views.size;
  }

  private attach(e: Entity, ref: SpriteRefValue): void {
    const view = createSpriteView(ref.spriteId);
    const pos = this.world.get(e, Position);
    if (pos) view.position.set(pos.x, pos.y);
    view.scale.set(ref.scale);
    this.layers[ref.layer]?.addChild(view);
    this.views.set(e, view);

    this.world.componentLifetime(e, SpriteRef).onDispose(() => this.detach(e, view));
  }

  private detach(e: Entity, view: Container): void {
    view.parent?.removeChild(view);
    view.destroy();
    if (this.views.get(e) === view) this.views.delete(e);
  }

  destroyAll(): void {
    for (const view of this.views.values()) {
      view.parent?.removeChild(view);
      view.destroy();
    }
    this.views.clear();
  }
}
