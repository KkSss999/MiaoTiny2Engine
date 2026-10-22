# 架构复核

## 结论

方向正确：纯 core + 可选平台适配器 + 应用层组合，足以承载轻量 2D 游戏。当前修订首先补齐所有权、时间、事件、数据变更契约，而不是增加框架层数。它是可复用框架底座，不等于已经完成的平台引擎。

## 依赖方向

```text
consumer application
  ├─ render (optional Pixi presentation)
  ├─ engine (runtime + assets/audio/input/save adapters)
  └─ core
       ├─ kernel
       ├─ db → kernel
       ├─ ecs → db, kernel
       └─ agent → kernel
```

core 不允许依赖第三方运行时包、浏览器适配器或应用。边界检查使用 TypeScript AST，覆盖普通/副作用/动态 import、re-export 和 require；禁止不可静态检查的计算导入。它检查模块依赖方向，不证明行为上的“只读渲染”，也不强制内部模块只能经 barrel 导入。

## 数据与运行

- ECS 是高频、可变的模拟数据。结构操作和显式 set 发变更通知；直接 get/query 字段修改不追踪。需要回放或网络同步时，应用必须明确采样/dirty tracking 策略。
- DB 是低频、受校验的内容/持久化数据。读写边界克隆，CRUD 维护索引。导入先完整校验所有待替换表，全部提交后通知观察者。
- Runtime 统一每个固定步：Schedule → commands.flush → bus.drain。事件中新增命令留到下一步；异步 I/O 不属于模拟 tick。
- Loop 是步数规划器；Runtime.frame/elapsed 和系统上下文代表已执行的模拟步。不能把一次 catch-up 后的 Loop.frame 当成每一步的 frame。
- Lifetime/EntityScope 管理所有权；应用在初始化时注册系统、资源、订阅，在 reset 后重新装配世界。dispose 不允许复用。
- renderer 消费状态、生成表现对象，不能成为逻辑真相；框架不会替应用自动强制只读。

## 保留而非扩张

保留现有 archetype ECS、schema/store/table、FSM、流场、确定性 RNG。没有新后端、微服务、依赖注入容器、网络协议或通用编辑器。浏览器音频仍需用户手势；图像由 Pixi 的真实异步加载器加载，纹理由调用者按所有权管理。

## 尚待真实使用验证的决定

1. 一次最小真实应用验证 API 易用性与渲染生命周期，再决定是否拆包。当前源模块边界比提前 monorepo 更轻。
2. archetype/SparseSet、索引与克隆成本需要代表性实体量 benchmark；单元测试通过不等于性能达标。
3. 全局命名 registry 目前严格拒绝不同定义复用同名；插件/HMR 若成为需求，再引入显式 Registry 实例，不能静默覆盖。
4. 保存格式只覆盖 DB 快照，不声称支持任意 ECS、函数、浏览器句柄或完整游戏状态恢复。
5. 回放/多人网络同步需要显式输入记录、随机流、时钟和状态序列化；当前确定性原语只是基础。
6. WebAudio/Pixi adapter 单测不替代真实浏览器、GPU、音频设备和长时运行 QA。

先用无头示例证明组合契约，再按应用需求补齐能力，不再把旧游戏的规则变成“引擎通用层”。
