// 截图：可选 --auto 开启自动开火，用于抓战斗画面
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2] ?? "http://127.0.0.1:5199/";
const out = process.argv[3] ?? "/tmp/cap.png";
const auto = process.argv.includes("--auto");
const size = process.argv.find((a) => a.startsWith("--size="))?.split("=")[1];
const [vw, vh] = size ? size.split("x").map(Number) : [1440, 900];
const waitMs = Number(process.argv.find((a) => a.startsWith("--wait="))?.split("=")[1] ?? 2500);
const port = 9700 + Math.floor(Math.random() * 200);
const profile = mkdtempSync(join(tmpdir(), "cdp-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", "--no-sandbox", "--hide-scrollbars",
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  `--window-size=${vw},${vh}`, "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader",
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
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? m.error); pending.delete(m.id); return; }
  if (m.method === "Runtime.exceptionThrown") {
    errors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text);
  }
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    errors.push(m.params.args.map((a) => a.description ?? a.value).join(" "));
  }
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = (e) => send("Runtime.evaluate", { expression: e, returnByValue: true });

await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: vw, height: vh, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url });
// 等游戏实例就绪（首屏要等 vite 预构建 + Pixi 初始化）
for (let i = 0; i < 60; i++) {
  const r = await evalJs("!!window.__dbg");
  if (r?.result?.value === true) break;
  await sleep(250);
}
if (auto) await evalJs("window.__dbg.auto(true)");
if (process.argv.includes("--god")) await evalJs("window.__dbg.god()");
const give = process.argv.find((a) => a.startsWith("--give="))?.split("=")[1];
if (give) {
  const [weaponId, affixId] = give.split(",");
  await evalJs(`window.__dbg.give('${weaponId}', '${affixId}')`);
}
const statusId = process.argv.find((a) => a.startsWith("--status="))?.split("=")[1];
if (process.argv.includes("--boss")) {
  await evalJs("window.__dbg.gotoRoom(window.__dbg.state().bossId)");
}
const gotoRoom = process.argv.find((a) => a.startsWith("--goto="))?.split("=")[1];
if (gotoRoom) await evalJs(`window.__dbg.gotoRoom('${gotoRoom}')`);
const tp = process.argv.find((a) => a.startsWith("--tp="))?.split("=")[1];
if (tp) {
  const [x, y] = tp.split(",").map(Number);
  await evalJs(`window.__dbg.teleport(${x}, ${y})`);
}
const spawnId = process.argv.find((a) => a.startsWith("--spawn="))?.split("=")[1];
if (spawnId) await evalJs(`window.__dbg.spawn('${spawnId}')`);
for (const arg of process.argv.filter((a) => a.startsWith("--spawnat="))) {
  const [id, sx, sy] = arg.slice("--spawnat=".length).split(",");
  await evalJs(`window.__dbg.spawnAt('${id}', ${Number(sx)}, ${Number(sy)})`);
}
const walkKey = process.argv.find((a) => a.startsWith("--walk="))?.split("=")[1];
if (walkKey) await evalJs(`window.__dbg.walk('${walkKey}')`);
if (statusId) await evalJs(`window.__dbg.status('${statusId}')`);
await sleep(waitMs);
// 真实鼠标事件（走命中测试，能验证 HUD 有没有挡住画布）
const move = process.argv.find((a) => a.startsWith("--move="))?.split("=")[1];
if (move) {
  const [mx, my] = move.split(",").map(Number);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mx, y: my, button: "none" });
  await sleep(120);
}
const click = process.argv.find((a) => a.startsWith("--click="))?.split("=")[1];
if (click) {
  const [cx, cy] = click.split(",").map(Number);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cx, y: cy, button: "none" });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: cx, y: cy, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cx, y: cy, button: "left", clickCount: 1 });
  await sleep(250);
}

const thenScript = process.argv.find((a) => a.startsWith("--then="))?.slice("--then=".length);
if (thenScript) {
  await evalJs(thenScript);
  await sleep(700);
}
for (const arg of process.argv.filter((a) => a.startsWith("--key="))) {
  const code = arg.slice("--key=".length);
  const key = code.startsWith("Digit") ? code.slice(5) : code;
  await evalJs(`window.dispatchEvent(new KeyboardEvent('keydown', { code: '${code}', key: '${key}', bubbles: true }))`);
  await sleep(400);
}
const probe = process.argv.find((a) => a.startsWith("--probe="))?.slice("--probe=".length);
if (probe) console.log("probe:", (await evalJs(probe))?.result?.value);
const st = await evalJs("JSON.stringify(window.__dbg ? window.__dbg.state() : null)");
console.log("state:", st?.result?.value);
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log("wrote", out);
if (errors.length) {
  console.log("--- 页面异常");
  for (const e of errors.slice(0, 5)) console.log(String(e).slice(0, 400));
}
ws.close();
chrome.kill();
process.exit(0);