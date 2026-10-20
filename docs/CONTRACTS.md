# 层间契约

> 每一层对外只暴露 `index.ts`；跨层引用一律走别名 `#core/*` `#content/*`，层内用相对路径。

## 别名

| 别名 | 指向 | 谁能用 |
|---|---|---|
| `#core/*` | `src/core/*` | 所有人 |
| `#content/*` | `src/content/*` | 所有人 |

`package.json imports` + `tsconfig paths` + `vite alias` 三处已配好，node / tsc / vite 都能解析。

## 1. content —— 纯数据

```ts
// #content/index.ts
export const contentDb: Database
export function loadContent(): number          // 幂等，模块加载时已调用
export function getWeapon(id): WeaponRow | undefined
export function getEnemy(id): EnemyDef | undefined
export function getAffix(id): AffixRow | undefined
export function getClip(id): AnimationClip | undefined
export function applyContentPatch(table, row): boolean   // 开发期热更新
```

约束：**不含行为**。能被编辑器独立打开、校验、diff。

## 2. engine —— 运行时服务

### assets

```ts
type SpriteEntry = { id: string; image?: string | null; size?: [number, number] }
type SheetEntry  = { id: string; image?: string | null; frameWidth: number; frameHeight: number; cols: number; rows: number }
type AudioEntry  = { id: string; src: string; volume?: number }

getManifest(): Manifest
getSpriteEntry(id) / getSheetEntry(id) / getAudioEntry(id)
missingImages(): { sprites: string[]; sheets: string[] }
```

**不依赖 pixi**。真实图片路径写在 `content/manifest.json`；程序化占位图属于表现层（`render/placeholders.ts`），不在 manifest 里。

### inputmap

```ts
type ActionMap = Record<string, string[]>   // action → KeyboardEvent.code[]

new InputActions(input: InputState, map: ActionMap)
  down(action): boolean
  pressed(action): boolean    // 消费一次
  axis(negative, positive): -1 | 0 | 1
```

映射数据在 `content/actions.json`。玩法系统只认 action 名，不认物理键。

### audio

```ts
interface AudioPort {
  play(id: SfxId, options?: { volume?, rate? }): void
  setVolume(master: number): void
  readonly unlocked: boolean
  dispose(): void
}
```

游戏侧只发事件（`WeaponFired` / `DamageLanded` / `EntityKilled`），音频层订阅并决定播什么。**game 不 import 音频实现**，通过 bridge 注入。

### save

```ts
interface SavePort {
  read<T>(key: string): T | null
  write(key: string, value: unknown): void
  remove(key: string): void
}
```

存的是 `db.export()` 快照与设置；版本迁移在 core/db。

## 3. game —— 玩法

只暴露两样给 UI：

```ts
// #game/api.ts     命令（UI → 游戏）
api.start(race, seed?) / restart() / pause() / resume() / toMenu() / pickReward(i)

// #game/store.ts   状态（游戏 → UI）
hud.get() / hud.subscribe(fn) / hud.patch(partial)
```

其余内部结构（world、systems、factory）**不对 UI 暴露**。

## 4. render —— 表现

只做三件事：读 ECS 组件、订游戏事件、画。**禁止写 ECS**。

## 5. ui —— 界面

只用 `api` 与 `store`。开发页（`?debug=content`）允许读 `#content` 与 manifest，但不碰 world。
