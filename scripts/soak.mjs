// 浸泡测试：自动游玩一段时间，采样帧率/对象数/异常，用来复现卡死
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2] ?? "http://127.0.0.1:5199/?race=human&seed=123";
const seconds = Number(process.argv.find((a) => a.startsWith("--for="))?.split("=")[1] ?? 90);
const port = 9700 + Math.floor(Math.random() * 200);
const profile = mkdtempSync(join(tmpdir(), "cdp-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", "--no-sandbox", "--hide-scrollbars",
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  "--window-size=1440,900", "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader",
  "about:blank",
], { stdio: ["ignore", "ignore", "ignore"] });

async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const p = list.find((t) => t.type === "page");
      if (p?.webSocketDebuggerUrl) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(150);
  }
  throw new Error("no chrome");
}

const ws = new WebSocket(await wsUrl());
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result ?? m.error);
    pending.delete(m.id);
    return;
  }
  if (m.method === "Runtime.exceptionThrown") {
    errors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text);
  }
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    errors.push(m.params.args.map((a) => a.description ?? a.value).join(" "));
  }
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evalJs = (e) => send("Runtime.evaluate", { expression: e, returnByValue: true });

await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url });

for (let i = 0; i < 80; i++) {
  const r = await evalJs("!!window.__dbg");
  if (r?.result?.value === true) break;
  await sleep(250);
}

// 自动游玩：自动瞄准开火 + 无敌，每 6 秒换个房间
await evalJs("window.__dbg.auto(true)");
// 高射速武器 + 燃烧：把伤害飘字压到最狠
await evalJs("window.__dbg.give('minigun', 'burn')");
await evalJs("window.__dbg.god()");

const sample = `(() => {
  const t = performance.now();
  const s = window.__dbg.state();
  return JSON.stringify({
    t: Math.round(t),
    fps: window.__fps ?? null,
    views: s.views,
    sprites: (s.sprites || []).length,
    bullets: s.bullets,
    enemies: s.enemies,
    kills: s.kills,
    room: s.room,
    heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
  });
})()`;

await evalJs(`window.__fps = 0; (function loop(){ window.__fps++; requestAnimationFrame(loop); })();`);

const started = Date.now();
let lastKept = 0;
const rooms = ["r1", "r3", "r4", "r7"];

while (Date.now() - started < seconds * 1000) {
  const elapsed = Math.round((Date.now() - started) / 1000);
  const t0 = Date.now();
  const res = await Promise.race([
    evalJs(sample),
    sleep(5000).then(() => ({ timeout: true })),
  ]);
  const took = Date.now() - t0;

  if (res?.timeout) {
    console.log(`[${elapsed}s] >>> 主线程 5 秒无响应（卡死）`);
    break;
  }
  console.log(`[${elapsed}s] eval ${took}ms ${res?.result?.value ?? res?.exceptionDetails?.text ?? "?"}`);

  if (elapsed - lastKept >= 12) {
    lastKept = elapsed;
    const room = rooms[Math.floor(elapsed / 12) % rooms.length];
    await evalJs(`window.__dbg.gotoRoom('${room}'); window.__dbg.god();`);
  }
  await sleep(1500);
}

if (errors.length) {
  console.log("--- 异常");
  for (const e of errors.slice(0, 10)) console.log(e);
} else {
  console.log("--- 无异常");
}

ws.close();
chrome.kill();
process.exit(0);