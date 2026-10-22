# cbb

轻量 TypeScript 游戏框架，不包含旧游戏、游戏资源或未完成的 React 前端。
目标是可组合、可测试的单进程运行时，不是完整编辑器、服务端或成品游戏引擎。

## 使用

需要 Node.js 24+、pnpm 10.11+。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test:all
```

`test:all` 包含依赖边界、所有测试、严格类型检查、可分发 JS/声明构建，以及无头集成示例。
`pnpm sample` 运行 `examples/headless.ts`：三个有序固定步、暂停、销毁，不加载浏览器或 Pixi。
`pnpm build` 输出 `dist/`，不自动发布 npm，也不部署。

## 入口与边界

- 根入口：无头 core 命名空间，以及 World、Schedule、defineComponent、Loop。
- `core/kernel`：事件、所有权生命周期、固定步时钟、输入状态、种子 RNG。
- `core/db`：校验、表、索引、快照迁移和异步存储适配器。
- `core/ecs`：实体代数句柄、archetype、查询、命令队列、调度和实体作用域。
- `core/agent`：FSM、流场寻路。
- `engine/runtime`：无头组合入口，统一系统、命令、事件顺序。
- `engine/assets`、`engine/audio`、`engine/inputmap`、`engine/save`：可选适配器。
- `render`：可选 Pixi 工具；纹理、相机边界、图层和资源清单由调用方注入，不依赖具体游戏。

根入口不导入 Pixi。包目前仍为 private，子路径导出指向构建后的 JS；源代码示例使用相对 `.ts` 导入。

## 重要约定

DB 返回隔离副本，必须通过 CRUD 修改；ECS 的 get/query 是刻意保留的可变热路径，不会自动为每次字段赋值发事件。
清空 World 会失效旧实体句柄、销毁作用域、清除资源、订阅和待处理工作；dispose 是终态。
运行时异常不会回滚已经执行的系统：进入 faulted 状态，清除未完成队列，必须 reset 并重新初始化世界。

详细说明：[架构](docs/ARCHITECTURE.md)、[契约](docs/CONTRACTS.md)、[清理与修复记录](docs/EXTRACTION.md)。
