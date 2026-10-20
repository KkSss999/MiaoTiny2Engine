# 架构

> 一条总原则：**依赖只能向下，下层只被消费。**
> 判断某段代码属于哪一层，只问一个问题：它需要认识谁？

## 现状

| 层 | 规模 | 状态 |
|---|---|---|
| `src/core/kernel` | 946 行 | 稳定：事件总线/生命周期、固定步长、输入状态、种子随机 |
| `src/core/db` | 1138 行 | 稳定：schema、Store、版本化快照 |
| `src/core/ecs` | 1472 行 | 稳定：实体/archetype/查询/调度/作用域/反射 |
| `src/core/agent` | 840 行 | 稳定：状态机、流场寻路 |
| `src/game` | 4372 行 | **偏胖**：内容表、规则、系统、生成、工厂、调试混在一起 |
| `src/render` | 1359 行 | 可用：资源烘焙、摄像机、粒子、UI 锚点 |
| `src/ui` | 1043 行 | 可用：HUD、菜单、内容编辑器 |
| `content/*.json` | — | 武器/敌人/词条/状态/动画数据 |

已经守住的东西：

- core 的依赖方向由 `pnpm check:core` 强制（反向 import 直接失败）
- 游戏逻辑发事件，表现层订阅；渲染不写 ECS
- 内容表启动即校验，schema 是唯一事实来源

## 目标分层

```
6  surface/    render(pixi)   ui(react)        只读状态 + 订阅事件 + 发命令
        ↑
5  app/        启动 · 局生命周期 · 模式 · 路由    唯一装配处
        ↑
4  game/       组件 · 系统 · 规则 · 生成         只认识玩法
        ↑
3  engine/     assets · audio · save · inputmap  只认识资源与平台
        ↑
2  content/    内容表 schema + JSON + 资源清单    只认识数据
        ↑
1  core/       kernel · db · ecs · agent         不认识游戏
```

### 各层职责

**1 core** —— 通用能力，和本游戏无关。
事件/生命周期、数据表、实体组件、状态机、寻路、随机、输入状态。
判定：换成任何游戏都能原样用。

**2 content** —— 数据，不含行为。
内容表（武器/敌人/词条/状态/动画）的 schema 与 JSON、资源清单（manifest）。
判定：能被编辑器独立打开、校验、diff。

**3 engine** —— 运行时服务，不认识玩法规则。
- `assets`：manifest → 纹理/图集/音频的加载与缓存
- `audio`：订阅游戏事件播放声音（游戏不需要知道音频存在）
- `save`：db 快照 ↔ 存储介质，带版本迁移
- `inputmap`：action 到物理键的映射（`move.up` → `KeyW`）

**4 game** —— 玩法。组件、系统、规则（伤害/状态/词条/植入体/技能）、生成、工厂。
判定：认识"玩家""武器""房间"，但不认识 pixi、不认识 React。

**5 app** —— 装配。创建世界、装载内容、跑循环、切换模式、路由（游戏 / 编辑器 / 地图调试）。

**6 surface** —— 表现。渲染与 UI 只做两件事：**读**状态、**订阅**事件；主动行为一律通过命令接口。

## 边界规则（可自动化检查）

| 规则 | 检查方式 |
|---|---|
| core 不依赖任何上层 | `check:core`（已有） |
| content 只依赖 core | 扩展 check |
| engine 只依赖 core + content | 扩展 check |
| **game 不得 import render / ui** | 扩展 check |
| **render 不得写 ECS**（只能读 + 订阅） | 代码评审 + 约定 |
| **ui 不直接访问 world**（只走 api / store） | 扩展 check：ui 不得 import `game/world` |
| tools 不得 import render | 约定 |

## 缺口

| # | 缺口 | 影响 |
|---|---|---|
| 1 | **没有资源层**：贴图/图集的定义混在 `render/assets.ts`，与 pixi 绑死 | 接美术、音频、UI 图标全卡在这 |
| 2 | **键位写死在系统里**（`KeyE`/`Space`） | 改键、手柄、多平台输入无处可放 |
| 3 | **没有音频** | 打击反馈少一半 |
| 4 | **没有存档** | 关掉就没了，局外成长无处存 |
| 5 | **`game/` 偏胖**：content 与 debug 混在里面 | 内容层无法被工具单独消费 |
| 6 | **ui ↔ game 的契约不明确** | 编辑器直接 import 了 render/game 内部 |
| 7 | **动画只有 idle** | 受击/死亡/攻击没有状态切换 |

## 分阶段

### P0 资源层（engine/assets）

把"资源"变成一等公民，其他三个缺口（动画、音频、图标）都挂在它上面。

- `content/manifest.json`：`{ sprites, sheets, clips, audio }`，**纯数据**
  - `sprites`: `{ id, image?, frame?, size }`
  - `sheets`: `{ id, image | procedural, frameWidth/Height, cols, rows, clips[] }`
  - `audio`: `{ id, src, volume }`
- 程序化占位图从 manifest 里挪到 `render/placeholders.ts`（**占位是开发工具，不是数据**）
- `engine/assets`：加载器 + 缓存，不认识 pixi（返回资源描述），pixi 侧只负责把它变成 Texture
- 编辑器加一页"资源"，列出 manifest 条目与缺图状态

验收：manifest 里加一张图 → 编辑器能看到 → 游戏能渲染；删掉 `image` 自动回落到占位图。

### P1 输入映射（engine/inputmap）

`content/actions.json`：`{ "move.up": ["KeyW", "ArrowUp"], "fire": ["Mouse0"] }`。
系统只写 `input.action("move.up")`，物理键在映射层。

### P2 音频（engine/audio）

事件驱动：`DamageLanded` → 受击音，`WeaponFired` → 开火音。
先做接口 + 静音实现，音频文件后补。

### P3 存档（engine/save）

`db.export()` → 存储适配器（localStorage / 文件）；载入时走已有 migrations。
局外解锁、设置都放这里。

### P4 game 收敛

`content.ts`/`contentSchema.ts` 移到 `src/content/`；`check-deps` 覆盖 game/render/ui 三层的边界。

### P5 动画状态机

受击 / 死亡 / 攻击 三个 clip，由事件与 brain 状态切换（依赖 P0 的 clips）。

## 不做什么

- 不做 ECS 之外的"第二套对象系统"
- 不为了分层而分层：每加一层，必须能指出**它的消费者是谁**
- 不引入 UI 框架级状态管理：HUD 的 store 已经够用
