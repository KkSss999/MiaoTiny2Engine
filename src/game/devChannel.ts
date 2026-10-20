import { applyContentPatch } from "./content.ts";

/**
 * 开发期热更新通道。
 * 编辑器保存后往 BroadcastChannel 推一条，运行中的游戏立刻改内存里的内容表，
 * 不用刷新、不用重开一局。生产构建里没有编辑器，这个频道永远不会有人说话。
 */
const CHANNEL = "cbb-dev";
const ENABLED = import.meta.env.DEV;

export function connectDevChannel(): () => void {
  if (!ENABLED || typeof BroadcastChannel === "undefined") return () => {};

  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event) => {
    const data = event.data as { type?: string; table?: string; row?: Record<string, unknown> } | null;
    if (!data || data.type !== "content" || !data.table || !data.row) return;
    const ok = applyContentPatch(data.table, data.row);
    console.info(`[dev] 热更新 ${data.table}/${String(data.row.id)} → ${ok ? "已应用" : "忽略"}`);
  };

  return () => channel.close();
}
