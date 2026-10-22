# 核心契约

## World / Entity

实体是 world-local 的有代数整数句柄，不能跨 World 使用。has/get 对失效句柄不返回新实体数据；set 和所有权获取拒绝失效句柄。clear 不重置代数，耗尽代数的槽位退休，避免旧句柄复活。

query(A,B) 与 query(B,A) 各自保持列投影顺序，包括 chunks 和排除查询。循环中需结构变更时使用命令队列。

clear 是可复用 reset：实体、资源、查询缓存、事件订阅、待处理事件/命令和旧作用域失效。dispose 是终态。保留 Query 实例可见当前世界；不要保留旧组件对象作为新世界状态。

ECS 值可变；get/query/snapshot 不是只读数据屏障。DataChanged 覆盖显式结构/CRUD 操作，不保证每次字段赋值都发事件。同步通知异常可能发生于已提交的操作之后，调用者不能假设回滚。

## 所有权与事件

已销毁 Lifetime 的 fork/adopt 会立即销毁孩子，EventScope 不允许重新注册活监听。所有权循环被拒绝。清理回调全部尝试；Lifetime 清理异常会被记录，不中断其他清理。

EventBus.emit 是同步调用；异常传播。drain 与命令 flush 是失败即停，保留尚未执行的批次项，不重放失败项。clear/reset 取消旧批次。Runtime 在失败时进一步丢弃待处理工作并进入 faulted 状态。

## 时间与 Runtime

每步系统收到不同 frame/elapsed。暂停不积累模拟时间（在 tick 内 pause 于当前 catch-up 批次结束后生效）；reset 清空时钟、世界和 faulted 状态，但保留系统注册。应用必须重新创建实体、资源、订阅。

追帧上限丢弃超出的整步，保留小数插值余量；maxDeltaMs 还会截断过长真实间隔。Runtime 不读取真实时钟。系统、命令、事件的异常不提供事务回滚；reset 后才可恢复。

## DB

数据必须可 structuredClone；读取、CRUD 返回值和事件 payload 是隔离副本。修改副本不会更改表和索引。主键不可通过 update 修改。

import 对快照、迁移输出、行和重复主键先校验；失败不改变现有表。快照中未出现的表保持不变。所有参与表与索引先提交，再通知观察者。观察者失败抛 ImportNotificationError(committed=true)，load 返回 ok:false, committed:true，不能误认为导入未发生。

schema/shape/component 全局名称不得绑定不同定义。重复注册必须复用原来的 validator/factory 身份，不能依赖泛型强转隐藏冲突。不同模块应使用命名空间前缀。

## 持久化、资源与表现

StorageAdapter 是异步字符串 read/write/delete；SavePort 是其 JSON 便利层，read/write/remove 都返回 Promise。缺键返回 null；损坏 JSON、序列化、配额、I/O、不可用 localStorage 都可观察地失败，调用方必须处理。

清单由 parseManifest/createAssetCatalog 校验并注入；没有默认游戏内容。loadImageTexture 是异步真实加载，失败拒绝而非返回假成功。共享 Pixi Assets 缓存纹理不由个别表现对象擅自销毁。atlas 子纹理由消费方管理，源纹理保留调用者所有权。
