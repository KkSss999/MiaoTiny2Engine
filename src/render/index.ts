/** Optional Pixi presentation adapters. Do not import this entrypoint in headless simulation. */
export { followCamera, shakeOffset, type CameraState, type CameraBounds } from "./camera.ts";
export { createLayers, attachLayers, type LayerDefinition, type LayerMap } from "./layerContainers.ts";
export { Particles, type EmitOptions } from "./particles.ts";
export { Tweens } from "./tweens.ts";
export { loadImageTexture } from "./assets.ts";
export { sliceAtlas, type SheetGrid } from "./sheets.ts";
export { DamageNumbers } from "./damageNumbers.ts";
