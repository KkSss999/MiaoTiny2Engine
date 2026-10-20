/**
 * 存档端口：db 快照 ↔ 存储介质。
 * 版本迁移在 core/db 里已有，这里只管"放哪儿"。
 */
export interface SavePort {
  read<T>(key: string): T | null;
  write(key: string, value: unknown): void;
  remove(key: string): void;
}

export function createLocalSave(prefix = "cbb"): SavePort {
  const keyOf = (key: string) => `${prefix}:${key}`;
  return {
    read<T>(key: string): T | null {
      try {
        const raw = localStorage.getItem(keyOf(key));
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;
      }
    },
    write(key: string, value: unknown): void {
      try {
        localStorage.setItem(keyOf(key), JSON.stringify(value));
      } catch {
        /* 配额满 / 隐私模式：静默失败，别让存档把游戏搞崩 */
      }
    },
    remove(key: string): void {
      try {
        localStorage.removeItem(keyOf(key));
      } catch {
        /* 同上 */
      }
    },
  };
}
