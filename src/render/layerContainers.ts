import { Container } from "pixi.js";

export type LayerDefinition<K extends string = string> = { id: K; zIndex: number; sortableChildren?: boolean };
export type LayerMap<K extends string = string> = Map<K, Container>;

/** Caller supplies layer names and order; no game-specific global registry. */
export function createLayers<K extends string>(definitions: readonly LayerDefinition<K>[]): LayerMap<K> {
  const ids = new Set<K>();
  for (const def of definitions) {
    if (ids.has(def.id) || !Number.isFinite(def.zIndex)) throw new Error(`Invalid or duplicate layer: ${def.id}`);
    ids.add(def.id);
  }
  const layers: LayerMap<K> = new Map();
  for (const def of definitions) {
    const container = new Container();
    container.zIndex = def.zIndex;
    container.sortableChildren = def.sortableChildren ?? false;
    container.label = `layer:${def.id}`;
    layers.set(def.id, container);
  }
  return layers;
}

/** Root owns attached containers; destroy it with children:true during teardown. */
export function attachLayers(root: Container, layers: LayerMap): void {
  root.sortableChildren = true;
  for (const layer of layers.values()) root.addChild(layer);
}
