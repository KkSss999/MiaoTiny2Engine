import { useEffect, useRef } from "react";
import { AnimatedSprite, Application, Container, Graphics, Text, type Texture } from "pixi.js";
import { SPRITES, type SpriteId } from "../render/assets.ts";
import { getSheetFrame, prepareSheets } from "../render/sheets.ts";
import { allClips } from "../game/content.ts";

/**
 * 资源画廊：把 assets.ts 里每个程序化图形画出来看一眼。
 * 直接画 Graphics（不复用烘焙管线），避免和游戏实例共用渲染器。
 */
export function SpriteGallery() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const app = new Application();
    let disposed = false;
    let ready = false;

    app
      .init({
        background: 0x0a0e14,
        resizeTo: el,
        height: 420,
        antialias: false,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        preference: "webgl",
      })
      .then(() => {
        ready = true;
        if (disposed) {
          app.destroy({ releaseGlobalResources: true });
          return;
        }
        el.appendChild(app.canvas);

        const ids = Object.keys(SPRITES) as SpriteId[];
        const cellW = 104;
        const cellH = 84;
        const cols = Math.max(1, Math.floor(app.screen.width / cellW));

        ids.forEach((id, i) => {
          const col = i % cols;
          const rowIndex = Math.floor(i / cols);
          const x = col * cellW + cellW / 2;
          const y = rowIndex * cellH + 30;

          const wrap = new Container();
          wrap.position.set(x, y);
          app.stage.addChild(wrap);

          const g = new Graphics();
          const asset = SPRITES[id];
          if (asset.draw) asset.draw(g);
          else g.rect(-10, -10, 20, 20).fill(0xff00ff);
          wrap.addChild(g);

          const label = new Text({
            text: id,
            style: { fontFamily: "ui-monospace, monospace", fontSize: 9, fill: 0x8a8478 },
          });
          label.anchor.set(0.5, 0);
          label.position.set(x, y + 34);
          app.stage.addChild(label);
        });

        // ---- 动画片段：网格切图 + 帧序列实时播放
        prepareSheets(app.renderer);

        const clips = allClips();
        const animTop = Math.ceil(ids.length / cols) * cellH + 40;

        const animTitle = new Text({
          text: "ANIMATIONS",
          style: { fontFamily: "ui-monospace, monospace", fontSize: 10, fill: 0x8a6d3b, letterSpacing: 3 },
        });
        animTitle.position.set(12, animTop - 20);
        app.stage.addChild(animTitle);

        clips.forEach((clip, i) => {
          const frames = clip.frames
            .map((f) => getSheetFrame(clip.sheet, f))
            .filter((t): t is Texture => t !== null);
          if (frames.length === 0) return;

          const x = 110 + i * 150;
          const y = animTop + 30;

          const anim = new AnimatedSprite({ textures: frames, animationSpeed: clip.fps / 60, loop: clip.loop, autoPlay: true });
          anim.anchor.set(0.5);
          anim.position.set(x, y);
          app.stage.addChild(anim);

          const label = new Text({
            text: `${clip.id} · ${clip.fps}fps`,
            style: { fontFamily: "ui-monospace, monospace", fontSize: 9, fill: 0x8a8478 },
          });
          label.anchor.set(0.5, 0);
          label.position.set(x, y + 34);
          app.stage.addChild(label);
        });
      })
      .catch(() => {});

    return () => {
      disposed = true;
      // 初始化还没完成就卸载时不能 destroy，Pixi 会在半初始化的实例上抛错
      if (!ready) return;
      ready = false;
      app.destroy({ releaseGlobalResources: true }, { children: true });
    };
  }, []);

  return (
    <div className="mt-6">
      <div className="mb-2 text-[10px] tracking-[0.4em] text-brass/50">SPRITES</div>
      <div ref={host} className="w-full overflow-hidden border border-bone/10" />
    </div>
  );
}