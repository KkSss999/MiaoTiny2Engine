export interface StorageAdapter {
  read(key: string): Promise<string | null>;
  write(key: string, data: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MemoryStorage implements StorageAdapter {
  private map = new Map<string, string>();

  async read(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }

  async write(key: string, data: string): Promise<void> {
    this.map.set(key, data);
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }

  get keys(): string[] {
    return [...this.map.keys()];
  }
}

/** 浏览器环境：localStorage。Tauri 下换成文件适配器即可，核心不用改 */
export class LocalStorageAdapter implements StorageAdapter {
  private prefix: string;

  constructor(prefix = "gdd:") {
    this.prefix = prefix;
  }

  async read(key: string): Promise<string | null> {
    return globalThis.localStorage?.getItem(this.prefix + key) ?? null;
  }

  async write(key: string, data: string): Promise<void> {
    globalThis.localStorage?.setItem(this.prefix + key, data);
  }

  async delete(key: string): Promise<void> {
    globalThis.localStorage?.removeItem(this.prefix + key);
  }
}
