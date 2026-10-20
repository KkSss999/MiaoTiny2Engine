import { useEffect, useRef } from "react";
import { Game } from "./app/game";
import { api } from "./game/api";
import { Hud } from "./ui/Hud";
import { MapDebug } from "./ui/MapDebug";
import { ContentEditor } from "./ui/ContentEditor";

export default function App() {
  const params = new URLSearchParams(location.search);
  const isMapDebug = params.get("debug") === "map";
  const isContentDebug = params.get("debug") === "content";
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isMapDebug || isContentDebug || !hostRef.current) return;
    const game = new Game();
    let cancelled = false;
    const race = new URLSearchParams(location.search).get("race");
    game.init(hostRef.current).then(() => {
      if (cancelled) return game.destroy();
      // 开发用：?race=human 直接跳过选种族，方便截图和冒烟测试
      if (race === "human" || race === "undead") api.start(race);
    });
    return () => {
      cancelled = true;
      game.destroy();
    };
  }, [isMapDebug, isContentDebug]);

  if (isMapDebug) return <MapDebug />;
  if (isContentDebug) return <ContentEditor />;

  return (
    <div className="relative h-full w-full bg-void text-bone">
      <div ref={hostRef} className="absolute inset-0" />
      <Hud />
    </div>
  );
}