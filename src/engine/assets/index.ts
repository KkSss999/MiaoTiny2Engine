/**
 * 资源层：清单 → 可用资源。
 *
 * 这一层不认识 pixi，只负责"有哪些资源、路径是什么、缺不缺"。
 * 真正把资源变成 Texture 的是 render/（消费方）。
 */
export * from "./manifest.ts";
