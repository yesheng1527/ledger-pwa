# Supabase 认证与同步引擎设计

## 目标与范围

本阶段完成海风小账本的底层认证和同步能力，不制作登录、注册或同步状态页面。后续 UI 只消费稳定的服务接口和状态，不直接操作 Supabase。

交付接口为：

- `AuthService`：注册、登录、重置密码、更新密码、退出和会话订阅。
- `LedgerApi`：初始化个人账本、提交幂等操作、拉取增量变化。
- `SyncEngine.syncNow()`：单次同步入口。
- `SyncEngine.getStatus()`：读取同步状态。
- `AppProviders`：管理会话、活动账本和自动同步触发器。

本阶段不包含登录界面、冲突选择界面、后台推送、Service Worker 后台同步或多账本切换。

## 方案选择

采用分层方案：一个 Supabase 客户端，外加独立的认证服务、账本 API、同步引擎和 React Provider。这样可以用假 API 测试同步规则，并保证界面代码不依赖 Supabase 数据格式。

不采用以下方案：

- 页面直接调用 Supabase：实现快，但认证、数据映射和错误处理会散落在组件中。
- 现在实现后台同步：iOS 对后台执行支持不稳定，且超出当前核心阶段范围。

## 组件设计

### Supabase 客户端

`src/services/supabase.ts` 创建并导出唯一客户端。配置来自 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`，启用会话持久化、自动刷新和登录回调检测。浏览器代码不得包含或读取 `service_role` 密钥，也不自定义令牌存储。

### AuthService

`AuthService` 封装 Supabase Auth，提供：

- `signUp(email, password)`
- `signIn(email, password)`
- `requestPasswordReset(email)`
- `updatePassword(password)`
- `signOut()`
- `onSessionChange(listener)`

密码重置地址默认使用当前站点来源下的重置路径，并允许测试注入。服务返回领域友好的结果或抛出可映射错误，不把 Supabase 客户端暴露给页面。

### LedgerApi

`LedgerApi` 是云端账本的唯一访问层：

- `bootstrapPersonalLedger()` 调用初始化 RPC 并返回账本 ID。
- `applyOperation(operation)` 调用幂等写入 RPC，并把 `applied` 或 `conflict` 结果转换为稳定的 TypeScript 联合类型。
- `pullChanges(ledgerId, afterSeq)` 调用增量 RPC，把数据库的 snake_case 记录转换为本地 camelCase 记录。

映射层保留实体 ID、版本、删除或归档状态和 `change_seq`。流水更新产生的旧分录 tombstone 会转换为本地删除指令；软删除的流水和归档实体仍以带状态的完整记录写入本地库。

### LocalLedgerRepository 扩展

在不改变 Dexie 版本的前提下补充同步所需的窄接口：

- 查询用户的本地个人账本。
- 统计所有尚未完成的 outbox 项。
- 为失败操作保存中文错误摘要并保持 `pending`。
- 将冲突保存到 `conflicts`，同时把对应 outbox 标记为 `conflict`。
- 原子应用服务器页面、处理分录 tombstone 并推进游标。

业务写入仍由现有 `saveOperation()` 完成；Provider 暴露的保存命令在本地事务成功后触发同步。

### SyncEngine

同步引擎绑定一个活动账本、仓库和 `LedgerApi`，对外只暴露 `syncNow()`、`getStatus()` 和状态订阅。

状态结构为：

```ts
type SyncStatus = {
  mode: 'idle' | 'syncing' | 'offline' | 'error' | 'conflict';
  pendingCount: number;
  lastSyncedAt: string | null;
  message: string | null;
};
```

`syncNow()` 规则：

1. 同一实例只允许一个同步 Promise；并发调用共享同一个结果。
2. 离线时不访问 API，状态设为 `offline`，outbox 保持不变。
3. 读取已经到期的 pending 操作，按 `(createdAt, operationId)` 顺序逐条上传。
4. 成功应用后删除对应 outbox；重复操作依赖服务端幂等结果，不重复建账。
5. 遇到冲突时保存本地操作和服务端版本，标记 outbox 为 `conflict`，停止后续上传并执行一次拉取。
6. 遇到网络或服务错误时保留当前及后续操作，记录中文摘要并结束本轮同步，不再拉取。
7. 全部上传成功或遇到已保存的冲突后，从本地游标开始逐页拉取；每一页的实体变化和新游标必须在同一个 Dexie 事务中提交。
8. 只有完整同步成功后才更新 `lastSyncedAt`。

错误摘要不展示令牌、SQL 或完整服务端响应。常见网络错误显示“网络连接失败，稍后会自动重试”，未知错误显示“同步失败，请稍后重试”。

## 会话与触发流程

首次在线登录后，Provider 必须先调用 `bootstrapPersonalLedger()`，再构造同步引擎并执行初次拉取。新用户离线登录无法完成初始化，应显示“首次登录需要联网完成初始化”。

已在本机初始化过的用户可从本地成员关系恢复活动账本并离线打开；网络恢复后再次调用幂等 bootstrap，然后同步。

以下事件请求 `syncNow()`：

- 已认证启动完成。
- 本地保存成功。
- 浏览器触发 `online`。
- 页面从隐藏变为可见。
- 用户手动重试。

Provider 在卸载或会话切换时移除监听器，防止 React Strict Mode 下重复订阅。退出动作只调用 AuthService；阻止带未同步数据退出的产品交互在后续 UI 阶段实现。

## 测试与验收

同步引擎使用真实 Dexie 测试库和假的 `LedgerApi`，覆盖：

- 按顺序上传并只提交一次。
- `notBefore` 未到期时不上传。
- 多次同时调用保持 single-flight。
- 网络失败保留 outbox 并输出中文摘要。
- 冲突保存本地/服务端两个版本并停止后续上传。
- 上传后从既有游标拉取，实体与游标原子提交。
- 离线时不调用 API。

服务层测试覆盖 Supabase RPC 参数、snake_case 到 camelCase 的映射和错误透传。Provider 测试覆盖启动、在线和可见性触发器不会重复注册。

验收命令：

```powershell
npm.cmd run test:run
npm.cmd run typecheck
npm.cmd run build
```

同时检查 `src/services` 之外不存在直接 Supabase 查询，客户端代码中不存在服务端管理密钥。
