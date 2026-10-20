/** 渲染层级：纯数据，不含 pixi，逻辑层可以安全引用 */
export const LAYERS = ["floor", "shadow", "prop", "actor", "fx", "overlay"] as const;
export type Layer = (typeof LAYERS)[number];

export const LAYER_Z: Record<Layer, number> = {
  floor: 0,
  shadow: 10,
  prop: 20,
  actor: 30,
  fx: 40,
  overlay: 50,
};

/** 这些层内部按 y 排序（俯视 2D 的遮挡关系） */
export const SORTED_LAYERS: Layer[] = ["prop", "actor"];
