// 无依赖的 Chrome DevTools Protocol 驱动器：截图 + 收集控制台错误
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2] ?? "http://127.0.0.1:5199/";
const out = process.argv[3] ?? "/tmp/shot.png";
const waitMs = Number(process.argv[4] ?? 3500);
const port = 9333 + Math.floor(Math.random() * 200);
const profile = mkdtempSync(join(tmpdir(), "cdp-"));

const chrome = spawn(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  [
    "--headless=new", "--no-sandbox", "--hide-scrollbars",
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--window-size=1440,900", "--enable-unsafe-swiftshader",
    "--use-gl=angle", "--use-angle=swiftshader",
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(150);
  }
  throw new Error("chrome did not start");
}

const ws = new WebSocket(await getWs());
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result ?? m.error);
    pending.delete(m.id);
  }
  if (m.method === "Runtime.consoleAPICalled") {
    logs.push(`[${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description ?? a.type).join(" "));
  }
  if (m.method === "Runtime.exceptionThrown") {
    logs.push("[exception] " + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
  }
  if (m.method === "Log.entryAdded") logs.push(`[log:${m.params.entry.level}] ${m.params.entry.text}`);
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url });
await sleep(waitMs);

const shot = await send("Page.captureScreenshot", { format: "png" });
if (shot?.data) writeFileSync(out, Buffer.from(shot.data, "base64"));

const title = await send("Runtime.evaluate", { expression: "document.title + ' | nodes=' + document.querySelectorAll('*').length + ' | canvas=' + document.querySelectorAll('canvas').length", returnByValue: true });
console.log("PAGE:", title?.result?.value);
console.log("LOGS:\n" + (logs.join("\n") || "(none)"));
ws.close();
chrome.kill();
process.exit(0);
