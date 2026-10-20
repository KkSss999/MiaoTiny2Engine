# cbb · 锈与骨 / Rust & Bone

元气骑士式俯视房间制 Roguelike。**人类·改造者**（植入体 / 电量过热 / 枪械）与 **不死者·刻印者**（刻印 / 魂火 / 骨器）两套互斥的构筑规则。

当前状态：ECS 化完成的可玩灰盒——程序生成地图、四向门、房间清怪、双种族资源、Boss。

## 跑起来

```bash
pnpm install
pnpm dev                     # http://localhost:5173
pnpm test:all                # core 单测 + 游戏层单测（寻路/伤害/奖励）
```

| 地址 | 作用 |
|---|---|
| `/?race=human&seed=123` | 跳过选种族；固定种子 |
| `/?debug=map&seed=42` | 地图生成调试页 |

## 操作

| 键 | 作用 |
|---|---|
| WASD | 移动 |
| 鼠标 / 左键 | 瞄准 / 射击 |
| Space | 冲刺（人类 2 段 / 不死者 1 段，带无敌帧） |
| E | 人类：电磁拳 AOE（耗电、会过热）｜不死者：魂爆三连（耗魂火） |
| 走进绿门 | 清房后从任意门离开 |
| Esc | 暂停 / 继续（暂停里可重开或回主菜单） |
| 主菜单 | Enter 进入选种族，1/2 切种族，Enter 开始，Esc 返回 |

## 层次（依赖单向，只被消费）

```
src/core/event   Lifetime 所有权树 + 事件总线 + 订阅作用域        （入度 0）
src/core/time    Loop 固定步长时钟（纯逻辑）                     （入度 0）
     ↑
src/core/db      schema/shape + Store(CRUD) + DataChanged       （只消费 event）
     ↑
src/core/ecs     组件形状来自 db；变更发 DataChanged；生命周期用 Lifetime
src/core/fsm     状态转移广播到 event 总线
```

这条约束由 `pnpm check:core` 守住 —— 脚本扫 import 图，反向依赖直接失败：

```
core 依赖图： db → event ×2  ecs → db ×7  ecs → event ×4  fsm → event ×3
✓ 依赖方向正确
```

**一条变更通道**：DB 的行变更和 ECS 的实体/组件变更都是同一种 `Change`，都走 `DataChanged`：

```ts
{ schema: "weapons" | "component/Position" | "ecs/entity",
  type: "create" | "update" | "delete",
  key, before?, after? }
```

## 架构

```
src/core/              底层：只被消费，不认识游戏
  event/               Lifetime 所有权树、事件总线、订阅作用域
  time/                Loop：固定步长 / 插值 alpha / 追帧上限
  db/                  schema 与 shape 定义、Store(CRUD 总线)、版本化快照
  ecs/                 实体句柄、archetype 存储、查询缓存、调度、EntityScope
  fsm/                 有序转移 / minTime / interrupt / 栈式打断
  */test/              各自的单测（node --test，不开浏览器）

app 侧用 `@core/xxx/index.ts` 引用；core 内部一律相对路径，所以测试能直接跑。
```

src/game/              游戏层
  components.ts         纯数据组件（Position/Velocity/Health/PlayerTag/...）
  resources.ts          单例：RoomCtx / RunCtx / ViewCtx / DebugCtx
  damage.ts             伤害管线：修饰 → 扣血 → 落地事件 → 死亡/升级
  status.ts             状态效果（燃烧/冰冻/诅咒）：施加、倍率查询
  skills.ts             技能表：冷却/消耗 + 施法实现
  combat.ts             碰撞、爆炸、玩家/敌人受伤入口（无 pixi）
  test/                 游戏层单测（不需要浏览器）
  effects.ts            系统不造实体，只投递“要生成什么”
  world/WorldManager.ts 楼层协调器（不留资源，只用 run 的 Lifetime 装房间作用域）
  entities/factory.ts   实体构造（玩家/敌人/子弹/道具）
  ai/                   行为状态机定义（敌人三套 + 玩家动作）
  systems/              playerControl → skills → projectiles → enemies → status → roomFlow → hudSync
  core/Loop.ts          固定步长时钟（纯逻辑，喂 deltaMs 出 steps/alpha）
  core/Loop.test.ts     步数 / 插值 / 追帧上限 / 夹取
  debug.ts              window.__dbg 调试钩子（与生产代码分离）
  content.ts            内容表：房间模板 seed 进 @gdd/db，启动即校验
  events.ts             游戏事件定义（RoomCleared / EntityKilled / PlayerDamaged）
  game.ts               编排层：Pixi、房间装载、生成实体、渲染同步、调试钩子
  gen/                  地图/房间模板生成（纯 TS）

src/render/            表现层（唯一 import pixi 的地方）
  Renderer.ts           统筹：插值、旋转、闪烁、消息、粒子
  viewRegistry.ts       实体 ↔ 显示对象绑定（靠 onAdd/onRemove 钩子）
  assets.ts             资源表 + 程序化占位（接美术后换成图集帧）
  layerContainers.ts    6 个图层，prop/actor 层内按 y 排序
  roomView.ts           地板 / 墙 / 门
  camera.ts             跟随 + trauma 抖动（独立随机流）
  particles.ts          粒子池（不进 ECS）
  tweens.ts             出场弹一下之类的缩放补间
  fx.ts                 事件 → 表现（击杀爆点、受击火花）
```

**数据流**：系统只读组件、写组件、投递 effect/事件 → 编排层 drain effect 生成实体并挂 Sprite → 帧末 `bus.drain()` 处理延迟事件 → 渲染同步只做 position / rotation / alpha。

**状态机**：`Brain` 组件装的就是纯数据 `{state, time, stack, triggers}`，能 JSON 存读。系统每帧 `step(def, brain, ctx, dt)`；`ctx` 只带动作闭包（move/shoot/hitPlayer），状态机本身不认识 World。

**事件总线**：`world.bus` 一条总线同时承载 ECS 生命周期（EntityCreated/Destroyed、ComponentAdded/Removed）和游戏事件。`emit` 同步派发用于逻辑（击杀、受伤），`post` 入队留给帧末做表现（清房、换房）。没有监听器时 `hasListeners` 短路，零成本。

**边界**：`systems/` 不 import pixi；逻辑只声明 `SpriteRef`（spriteId + 图层 + 旋转方式），显示对象由 `src/render/` 自己建和销毁。

## 已实现

- 程序化楼层：主干 + 分支 + 加环，BFS 定 Boss，按距离撒商店/休息/精英
- 房间模板 + 五层随机（抽取/镜像/抖动/删减/散布），门通道保护
- 四向门：门是墙上的缺口，未清房被塞住，走过去才换房
- 两族资源（HEAT / SOUL）、技能表、8 个植入体/刻印（开局 2 个，精英/Boss 三选一扩充）
- 12 把武器 / 8 种行为 / 6 个词条，掉落拾取 + 双槽
- 战斗：子弹扫射、爆炸桶、精英房、Boss（冲撞 + 召唤）

## 下一步

1. 把 `game.ts` 里的 spawn 工厂和渲染同步拆成 `spawn.ts` / `view/`
2. 内容层：武器表（12 把）+ 词条（6 种）——用 @gdd/db 建表，挂到伤害事件上
3. 植入体 / 刻印槽位与局外解锁
4. 房间类型内容：商店买卖、休息回血、事件房
5. Tauri 2 外壳