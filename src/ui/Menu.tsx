import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { api, type Race } from "../game/api";

gsap.registerPlugin(useGSAP);

type Screen = "title" | "race";

const RACE_INFO: Record<Race, { title: string; en: string; rows: [string, string][] }> = {
  human: {
    title: "人类 · 改造者",
    en: "HUMAN / AUGMENTED",
    rows: [
      ["资源", "电量 · 过热"],
      ["槽位", "植入体 ×4｜手臂 / 腿部 / 躯干 / 神经"],
      ["武器", "枪械 · 工业工具 · 外骨骼重武器"],
      ["玩法", "改装身体：爆发 · 射击 · 机动"],
    ],
  },
  undead: {
    title: "不死者 · 刻印者",
    en: "UNDEAD / INSCRIBED",
    rows: [
      ["资源", "魂火 · 击杀充能"],
      ["槽位", "刻印 ×4｜骨 / 魂 / 咒 / 契"],
      ["武器", "骨器 · 咒物 · 死灵法器"],
      ["玩法", "献祭 · 召唤 · 诅咒 · 复活"],
    ],
  },
};

export function Menu() {
  const [screen, setScreen] = useState<Screen>("title");
  const [race, setRace] = useState<Race>("human");
  const [seedText, setSeedText] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const start = () => {
    const parsed = Number.parseInt(seedText.trim(), 10);
    api.start(race, Number.isFinite(parsed) && parsed > 0 ? parsed : undefined);
  };

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      // 用 fromTo 而不是 from：StrictMode 下 effect 会跑两遍，
      // from 会以"当前内联样式"作为终点，残留的 opacity:0 会让元素永远不显示。
      gsap.fromTo(
        "[data-anim]",
        { y: 16, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, stagger: 0.06, ease: "power2.out", clearProps: "transform,opacity" },
      );
    },
    { scope: rootRef, dependencies: [screen] },
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Escape") {
        if (screen === "race") setScreen("title");
        return;
      }
      if (screen === "title") {
        if (event.code === "Enter" || event.code === "Space") {
          event.preventDefault();
          setScreen("race");
        }
        return;
      }
      if (event.code === "Digit1") setRace("human");
      else if (event.code === "Digit2") setRace("undead");
      else if (event.code === "Enter") start();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, race, seedText]);

  return (
    <div
      ref={rootRef}
      className="pointer-events-auto absolute inset-0 overflow-hidden bg-void font-mono text-bone"
    >
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(#39e0c8 1px, transparent 1px), linear-gradient(90deg, #39e0c8 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_0%,#0a0e14_75%)]" />

      {screen === "title" ? (
        <div className="relative z-10 flex h-full flex-col items-center justify-center">
          <div data-anim className="text-[10px] tracking-[0.7em] text-brass/50">
            ROOM-BASED ROGUELIKE
          </div>
          <h1
            data-anim
            className="mt-6 text-[64px] font-bold leading-none tracking-[0.4em] text-bone"
            style={{ textShadow: "0 0 32px rgba(201,162,39,0.18)" }}
          >
            锈 与 骨
          </h1>
          <div data-anim className="mt-6 flex items-center gap-4">
            <span className="h-px w-16 bg-gradient-to-r from-transparent to-brass/50" />
            <span className="text-[10px] tracking-[0.5em] text-brass/70">RUST &amp; BONE</span>
            <span className="h-px w-16 bg-gradient-to-l from-transparent to-brass/50" />
          </div>
          <p data-anim className="mt-8 max-w-md text-center text-[11px] leading-relaxed text-bone/40">
            人类靠植入体改造身体，不死者靠灵魂刻印对抗机械。
            <br />
            两套互斥的构筑规则，两种不同的玩法。
          </p>

          <button
            data-anim
            onClick={() => setScreen("race")}
            className="mt-10 w-64 border border-bone/20 bg-white/[0.03] py-3 text-[12px] tracking-[0.4em] text-bone/80 transition hover:border-brass/60 hover:bg-brass/10 hover:text-bone"
          >
            开始游戏
          </button>
          <div data-anim className="mt-3 text-[10px] tracking-[0.3em] text-bone/20">
            按 Enter 继续
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex h-full flex-col items-center justify-center">
          <div data-anim className="text-[10px] tracking-[0.6em] text-brass/50">
            选择种族
          </div>

          <div data-anim className="mt-7 flex gap-4">
            <RaceCard id="human" info={RACE_INFO.human} selected={race === "human"} onSelect={setRace} />
            <RaceCard id="undead" info={RACE_INFO.undead} selected={race === "undead"} onSelect={setRace} />
          </div>

          <div data-anim className="mt-8 flex items-center gap-3">
            <span className="text-[10px] tracking-[0.2em] text-bone/25">种子</span>
            <input
              value={seedText}
              onChange={(event) => setSeedText(event.target.value.replace(/\D/g, ""))}
              placeholder="随机"
              className="w-32 border border-bone/15 bg-white/[0.04] px-2 py-1 text-center text-[11px] tracking-[0.15em] text-bone/80 outline-none placeholder:text-bone/20 focus:border-brass/50"
            />
          </div>

          <div data-anim className="mt-8 flex items-center gap-3">
            <button
              onClick={() => setScreen("title")}
              className="w-28 border border-bone/10 py-2 text-[11px] tracking-[0.25em] text-bone/40 transition hover:border-bone/25 hover:text-bone/70"
            >
              返回
            </button>
            <button
              onClick={start}
              className="w-44 border border-brass/50 bg-brass/10 py-2 text-[11px] tracking-[0.3em] text-bone/90 transition hover:border-brass hover:bg-brass/20"
            >
              进入废土 [Enter]
            </button>
          </div>

          <div data-anim className="mt-6 text-[10px] tracking-[0.25em] text-bone/20">
            1 / 2 切换种族 · Esc 返回
          </div>
        </div>
      )}
    </div>
  );
}

function RaceCard({
  id,
  info,
  selected,
  onSelect,
}: {
  id: Race;
  info: { title: string; en: string; rows: [string, string][] };
  selected: boolean;
  onSelect: (race: Race) => void;
}) {
  const soul = id === "undead";
  const accentText = soul ? "text-soul/60" : "text-brass/60";
  const dotClass = selected ? (soul ? "text-soul" : "text-brass") : "text-bone/20";
  return (
    <button
      data-anim
      onClick={() => onSelect(id)}
      className={[
        "group relative w-[300px] border px-5 py-4 text-left transition",
        selected
          ? soul
            ? "border-soul/60 bg-soul/[0.06]"
            : "border-brass/60 bg-brass/[0.06]"
          : "border-bone/12 bg-white/[0.02] hover:border-bone/30",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-semibold tracking-[0.15em] text-bone">{info.title}</span>
        <span className={`text-[9px] tracking-[0.2em] ${dotClass}`}>{selected ? "●" : "○"}</span>
      </div>
      <div className="mt-1 text-[9px] tracking-[0.25em] text-bone/25">{info.en}</div>
      <dl className="mt-4 space-y-1.5">
        {info.rows.map(([k, v]) => (
          <div key={k} className="flex gap-2 text-[10px] leading-snug">
            <dt className={`w-8 shrink-0 ${accentText}`}>{k}</dt>
            <dd className="text-bone/55">{v}</dd>
          </div>
        ))}
      </dl>
    </button>
  );
}
