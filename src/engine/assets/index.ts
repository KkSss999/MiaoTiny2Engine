/**
 * Asset layer: manifest → available assets.
 *
 * Independent of Pixi; tracks asset identities, paths and missing entries.
 * The consuming render/ layer creates actual Textures.
 */
export * from "./manifest.ts";
