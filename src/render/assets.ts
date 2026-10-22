import { Assets, Texture } from "pixi.js";

/**
 * Load an actual image through Pixi's shared asset cache. Failures reject instead
 * of silently substituting old-game art. The caller owns shared cache lifetime:
 * use Assets.unload(url) only once no views or atlas frames still use it.
 */
export async function loadImageTexture(url: string): Promise<Texture> {
  if (!url.trim()) throw new TypeError("Image URL must not be empty");
  const asset: unknown = await Assets.load(url);
  if (!(asset instanceof Texture)) throw new TypeError(`Asset is not an image texture: ${url}`);
  return asset;
}
