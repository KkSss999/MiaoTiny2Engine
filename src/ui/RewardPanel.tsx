import { useEffect, useSyncExternalStore } from "react";
import { api } from "../game/api";
import { hud } from "../game/store";

const KIND_LABEL: Record<string, string> = { weapon: "武器", implant: "植入体 / 刻印", heal: "修复" };
const KIND_STYLE: Record<string, string> = {
  weapon: "border-brass/60 hover:bg-brass/10",
  implant: "border-soul/60 hover:bg-soul/10",
  heal: "border-bone/25 hover:bg-bone/10",
};
const KIND_TEXT: Record<string, string> = {
  weapon: "text-brass/70",
  implant: "text-soul/70",
  heal: "text-bone/50",
};

export function RewardPanel() {
  const s = useSyncExternalStore(hud.subscribe, hud.get);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const index = Number.parseInt(event.key, 10);
      if (index >= 1 && index <= s.rewards.length) api.pickReward(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s.rewards.length]);

  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-6 bg-void/85 font-mono backdrop-blur-[2px]">
      <div className="text-[10px] tracking-[0.6em] text-brass/50">SALVAGE</div>
      <div className="text-xl tracking-[0.35em] text-bone">选 择 强 化</div>

      <div className="flex gap-4">
        {s.rewards.map((option, index) => (
          <button
            key={index}
            onClick={() => api.pickReward(index)}
            className={[
              "w-[210px] border px-4 py-4 text-left transition",
              KIND_STYLE[option.kind] ?? "border-bone/20",
            ].join(" ")}
          >
            <div className="flex items-center justify-between">
              <span className={`text-[9px] tracking-[0.25em] ${KIND_TEXT[option.kind] ?? "text-bone/40"}`}>
                {KIND_LABEL[option.kind] ?? option.kind}
              </span>
              <span className="text-[9px] text-bone/20">{index + 1}</span>
            </div>
            <div className="mt-2 text-[13px] tracking-[0.1em] text-bone/90">{option.name}</div>
            {option.affix && <div className="mt-0.5 text-[10px] tracking-[0.15em] text-brass/60">{option.affix}</div>}
            <div className="mt-2 text-[10px] leading-relaxed text-bone/40">{option.desc}</div>
          </button>
        ))}
      </div>

      <div className="text-[10px] tracking-[0.3em] text-bone/20">1 / 2 / 3 选择</div>
    </div>
  );
}
