import { Container } from "pixi.js";
import { LAYER_Z, LAYERS, SORTED_LAYERS, type Layer } from "../game/layers.ts";

export type LayerMap = Record<Layer, Container>;

export function createLayers(): LayerMap {
  const map = {} as LayerMap;
  for (const layer of LAYERS) {
    const container = new Container();
    container.zIndex = LAYER_Z[layer];
    container.sortableChildren = SORTED_LAYERS.includes(layer);
    container.label = `layer:${layer}`;
    map[layer] = container;
  }
  return map;
}

export function attachLayers(root: Container, layers: LayerMap): void {
  for (const layer of LAYERS) root.addChild(layers[layer]);
}
