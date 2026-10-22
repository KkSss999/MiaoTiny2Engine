# 清理与修复记录

基于 main 的 52ed569b784c9f50bf32092c06d05f7b1697eb32。只提交新分支/草稿 PR，不修改 main，不重写历史。以下删除内容可以从该基线提交恢复。

## 清理边界

删除旧玩法与规则、游戏 JSON、旧应用组合入口、React 菜单/HUD/内容编辑器、Vite 前端和旧游戏截图/压测/dev API 脚本。未发现该基线追踪的 PNG/音频等二进制资源；资源主要是 JSON 清单和程序绘制的游戏占位图。没有把缺失的资源文件声称为已删除。

保留全部 core/kernel/db/ecs/agent；保留通用音频、输入映射、存储、资源清单适配器。提取 camera、图层、particles、tweens、真实异步纹理加载和图集切片。DamageNumbers 虽偏玩法表现，实质是无游戏依赖的池化文字效果，作为可选 render 工具保留；不属于无头核心。没有保留旧 Renderer/实体视图绑定，它们依赖旧游戏的组件和规则。

## 审计问题处理

- P1：查询缓存保留列顺序；stale has/set 和生命周期访问校验代数；clear 不复用旧 ID，并取消旧作用域/队列/订阅；DB 导入在提交前检查全部行和重复主键。
- 生命周期终态、事件/命令异常余项与清理重入补回归测试。
- DB 隔离副本维护索引契约，ECS 保持可变热路径并明确说明事件范围。
- 新增无头 Runtime，固定步 frame/time、pause/reset、系统→命令→事件顺序和 faulted 契约。
- 清单校验与注入、真实图像加载、异步 SavePort/StorageAdapter 兼容、保存错误可观察。
- schema/component 同名不同定义拒绝，避免不安全泛型别名。
- dev API 主键篡改/并发写问题随未完成的游戏编辑器整体删除；没有残留服务端接口需要修补。
- AST 依赖检查、严格类型检查、构建、无头示例和 GitHub Actions 纳入完整检查。

## 验证

在 Node 24.19.0 / TypeScript 5.9.3 / Pixi 8.22.0 下，pnpm test:all 通过：依赖边界、175 个测试、typecheck、JS/声明构建、headless 示例。额外验证构建后的包自引用入口 cbb、cbb/render、cbb/engine/runtime 可以加载。git diff --check 通过。

最初构建因非相对 #core/*.ts 导入无法安全 emit 而失败；已改为相对源模块导入并重新通过全链路。未捕获修改前干净基线的完整执行，不宣称原分支全部测试通过。

测试包含无头 Pixi 对象/纹理所有权与 mocked loader；未执行真实浏览器/GPU/音频输出、性能或长时压测。新增 CI 需在远端运行结果确认，不能用本地通过代替远端通过。

## 删除路径（84 个）

- `content/actions.json`
- `content/affixes.json`
- `content/animations.json`
- `content/enemies.json`
- `content/manifest.json`
- `content/statuses.json`
- `content/weapons.json`
- `index.html`
- `scripts/capture.mjs`
- `scripts/dev-api.mjs`
- `scripts/shot.mjs`
- `scripts/soak.mjs`
- `src/App.tsx`
- `src/app/game.ts`
- `src/content/index.ts`
- `src/content/schema.ts`
- `src/content/templates.ts`
- `src/game/affixes.ts`
- `src/game/ai/attacks.ts`
- `src/game/ai/enemyAi.ts`
- `src/game/ai/perception.ts`
- `src/game/ai/playerAi.ts`
- `src/game/ai/steering.ts`
- `src/game/api.ts`
- `src/game/audioBridge.ts`
- `src/game/combat.ts`
- `src/game/components.ts`
- `src/game/damage.ts`
- `src/game/debug.ts`
- `src/game/devChannel.ts`
- `src/game/effects.ts`
- `src/game/entities/factory.ts`
- `src/game/events.ts`
- `src/game/gen/boundary.ts`
- `src/game/gen/floor.ts`
- `src/game/gen/templates.ts`
- `src/game/implants.ts`
- `src/game/input.ts`
- `src/game/layers.ts`
- `src/game/query.ts`
- `src/game/resources.ts`
- `src/game/rewards.ts`
- `src/game/rooms.ts`
- `src/game/settings.ts`
- `src/game/skills.ts`
- `src/game/status.ts`
- `src/game/store.ts`
- `src/game/systems/animation.ts`
- `src/game/systems/enemies.ts`
- `src/game/systems/hudSync.ts`
- `src/game/systems/nav.ts`
- `src/game/systems/playerControl.ts`
- `src/game/systems/projectiles.ts`
- `src/game/systems/roomFlow.ts`
- `src/game/systems/skills.ts`
- `src/game/systems/status.ts`
- `src/game/systems/totems.ts`
- `src/game/systems/weapons.ts`
- `src/game/test/damage.test.ts`
- `src/game/test/harness.ts`
- `src/game/test/rewards.test.ts`
- `src/game/weapons.ts`
- `src/game/world/WorldManager.ts`
- `src/main.tsx`
- `src/render/Renderer.ts`
- `src/render/bossBar.ts`
- `src/render/fx.ts`
- `src/render/nameplates.ts`
- `src/render/placeholders.ts`
- `src/render/playerWeapon.ts`
- `src/render/roomView.ts`
- `src/render/viewRegistry.ts`
- `src/styles.css`
- `src/ui/AssetBrowser.tsx`
- `src/ui/ContentEditor.tsx`
- `src/ui/Hud.tsx`
- `src/ui/MapDebug.tsx`
- `src/ui/Menu.tsx`
- `src/ui/RewardPanel.tsx`
- `src/ui/SpriteGallery.tsx`
- `src/ui/UiShell.tsx`
- `src/ui/useUiScale.ts`
- `src/vite-env.d.ts`
- `vite.config.ts`
