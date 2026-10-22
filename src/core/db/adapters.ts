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

  private get storage(): Storage {
    if (!globalThis.localStorage) throw new Error("localStorage is unavailable");
    return globalThis.localStorage;
  }

  async read(key: string): Promise<string | null> {
    return this.storage.getItem(this.prefix + key) ?? null;
  }

  async write(key: string, data: string): Promise<void> {
    this.storage.setItem(this.prefix + key, data);
  }

  async delete(key: string): Promise<void> {
    this.storage.removeItem(this.prefix + key);
  }
}
