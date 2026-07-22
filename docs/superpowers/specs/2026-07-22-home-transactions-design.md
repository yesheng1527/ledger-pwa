# 海风小账本首页与流水页设计规格

**日期：** 2026-07-22  
**状态：** 用户已确认设计，等待书面规格复核  
**前置实现：** `d91568e`（UI 基础、登录门、五栏框架与密码恢复加固）

## 1. 目标

把现有首页和流水占位页替换为可读取真实本地账本数据的正式页面，并补齐此前有意延后的 `LedgerViewModel` UI 数据边界。

本阶段完成：

- 首页总资产、今日支出、本月收入/支出/结余、总预算进度与剩余。
- 四个快捷支出分类、“更多”和最近三条流水。
- 流水搜索、月份/账户/日期/分类筛选、日期分组、每日收支合计和紧凑流水行。
- 流水详情、同类型编辑、立即软删除、8 秒撤销和超时后同步。
- 首页、流水和分类所需的独立手绘 SVG 资产。
- 320、390、430 CSS 像素宽度下的功能、无障碍和视觉回归门禁。

## 2. 范围外

- 新建记账表单、交易类型切换和 OCR。快捷分类只把预选意图交给现有中央记账层，不伪造保存。
- 统计页、账户/分类/预算管理页、提醒、备份和冲突解决界面。
- 流水虚拟列表；只有固定大数据夹具证明有必要时才引入。
- GitHub Pages 上线、Service Worker 和真实 iPhone 非零安全区验收。

## 3. 架构

页面继续遵守单向依赖：

```text
AppProviders
  └─ 当前 ledgerId + LedgerViewModel
       ├─ LocalLedgerRepository（账本范围的一致快照与变化监听）
       ├─ calculateMetrics / posting / operation validation
       └─ saveOperation / syncNow
            ├─ HomePage
            └─ TransactionsPage
                 ├─ TransactionRow
                 ├─ TransactionDetailSheet
                 └─ UndoToast
```

`src/features` 不直接导入 Dexie、Supabase、`LocalLedgerRepository` 或 `SyncEngine`。页面只依赖 ViewModel 的显示模型和命令。

### 3.1 Repository 读取边界

`LocalLedgerRepository` 新增账本范围的原子读取，而不复用面向备份的全库 `exportSnapshot()`：

```ts
interface LedgerReadSnapshot {
  ledgerId: string;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  entries: LedgerEntryRecord[];
  budgets: Budget[];
  categoryBudgets: CategoryBudget[];
}

readLedgerSnapshot(ledgerId: string): Promise<LedgerReadSnapshot>;
watchLedger(ledgerId: string, onChange: () => void): () => void;
```

读取在一个 Dexie 只读事务内完成，并对每张表强制按 `ledgerId` 过滤。监听只负责发出失效通知，数据映射仍由 ViewModel 完成。

### 3.2 ViewModel 合同

`LedgerViewModel` 由当前 `ledgerId`、Repository、固定时钟、UUID 工厂、`saveOperation` 和 `syncNow` 构造。正式环境使用真实时钟与 `crypto.randomUUID()`，测试环境注入固定值。

```ts
interface LedgerViewModel {
  getHomeSnapshot(input?: { now?: Date }): Promise<HomeSnapshot>;
  getTransactions(filters: TransactionFilters): Promise<TransactionListSnapshot>;
  getTransactionDetail(id: string): Promise<TransactionDetail | null>;
  updateTransaction(input: TransactionEditInput): Promise<void>;
  deleteTransaction(id: string): Promise<{ undoUntil: string }>;
  undoTransactionDelete(id: string): Promise<void>;
  flushPendingDelete(): Promise<void>;
  subscribe(listener: () => void): () => void;
}
```

ViewModel 不缓存密码、令牌或 Supabase 对象。异步页面查询使用请求代次保护，较旧响应不能覆盖较新的筛选结果。

### 3.3 Provider 生命周期

个人账本初始化成功后，`AppProviders` 创建 ViewModel 并和 `initializing=false` 一起发布。退出、用户变化或初始化重新开始时立即清除旧 ViewModel 和订阅。

`AuthGate` 只有在会话、本地账本和 ViewModel 都就绪后才显示 `AppShell`。测试服务可注入固定 ViewModel；生产构建继续禁止 E2E fixture 字符串。

## 4. 首页

### 4.1 数据口径

首页所有数字来自同一次 `LedgerReadSnapshot`：

- “总资产”显示核心指标 `netWorthCents`，即资产账户余额减负债账户余额。
- 今日支出仅统计本地当天的费用支出，退款抵减；收入、转账和余额校准不计入。
- 本月收入、净支出和结余继续由 `calculateMetrics()` 计算，页面不复制财务公式。
- 当前月有效总预算作为预算上限。已用金额为 `max(0, periodNetExpenseCents)`，剩余允许为负并明确显示“已超支”。
- 没有有效总预算时显示“未设置预算”，不显示虚假的 0 元进度。

日期边界按设备本地时区生成月初/月末和今日起止，再以 ISO 时间传给核心指标函数。

### 4.2 内容层级

从上到下固定为：

1. 海边手绘场景、问候和次要同步状态。
2. 总资产主数字。
3. 今日支出、本月结余、收入和支出。
4. 总预算进度、已用和剩余/超支。
5. 四个快捷支出分类和“更多”。
6. 最近三条未删除流水。

正常同步状态不抢占总资产层级；离线待同步或失败状态才显示短中文提示和可用操作。

### 4.3 快捷分类与最近流水

快捷分类从有效支出分类中选择：优先匹配餐饮、交通、购物、娱乐的稳定图标键，缺失时按 `sortOrder` 补足，最多四个；“更多”不预选分类。

点击快捷分类调用 `onStartEntry({ categoryId })`，点击“更多”调用 `onStartEntry({ categoryId: null })`。本阶段现有中央记账层显示明确的后续阶段提示并保留该意图，不创建交易。

最近流水按 `occurredAt` 倒序、再按 `id` 稳定排序，最多三条；点击可打开同一个交易详情层。

## 5. 流水页

### 5.1 筛选合同

```ts
interface TransactionFilters {
  month: string;       // YYYY-MM，必填
  accountId: string | null;
  date: string | null; // 本地 YYYY-MM-DD
  categoryId: string | null;
  query: string;
}
```

- 顶部顺序固定为标题/搜索、月份/账户/日期、分类横向滚动区。
- 搜索对去除首尾空白后的文本做不区分大小写匹配，范围为备注、分类名和账户名。
- 账户筛选匹配交易的任一分录账户；转账任一端命中都保留。
- 日期必须属于当前月份；切换月份时清除不兼容的日期。
- 分类、账户、日期和搜索条件组合使用。
- 已删除流水始终排除。

### 5.2 分组与行显示

结果按本地日期倒序分组，组内按 `occurredAt` 倒序、再按 `id` 稳定排序。日期标题显示当日费用支出和收入合计；退款抵减支出，转账和校准不进入合计。

每行至少显示：

- 手绘分类/类型图标。
- 主要名称：优先非空备注，否则使用分类名或交易类型中文名。
- 分类、时间和账户。
- 带显式正负号与文字语义的人民币金额。

支出使用支出语义，收入使用收入语义，退款标明“退款”，校准标明“余额调整”。转账显示“转出账户 → 转入账户”，金额为中性色，不能仅靠红绿区分。

### 5.3 详情与编辑

激活流水行打开 `TransactionDetailSheet`，显示类型、金额、分类、账户、发生时间、备注、版本和退款关联信息。层打开后焦点进入标题或第一个操作，Escape/关闭后回到原行。

编辑保持原交易类型，避免在更新中暗中改变账务语义：

- 支出/收入：金额、单账户、同类分类、时间、备注。
- 转账：金额、转出/转入账户、时间、备注；两个账户不能相同。
- 退款：金额、退款账户、时间、备注；保留原支出关联并继续执行累计退款上限。
- 余额校准：金额方向、账户、时间、备注。

金额通过整数分解析工具处理，不使用浮点乘法。保存生成新的 `transaction.update` operation，`baseVersion` 使用打开编辑时的版本，新版本严格加一，并由核心 posting/operation 校验重新生成分录。

版本已变化时不覆盖服务端或同步后的记录；保留编辑输入，提示“流水已更新，请刷新后重试”。

### 5.4 删除与撤销

详情层中的删除操作立即保存 `transaction.delete` tombstone。现有 Repository 的 `notBefore = deletedAt + 8 秒` 继续作为同步延迟边界。

删除成功后：

1. 列表和首页最近流水立即移除该项。
2. `UndoToast` 以 `role=status` 告知“流水已删除”，提供 44px 撤销按钮并显示 8 秒可用期。
3. 8 秒内撤销调用现有 `undoTransactionDelete()`，恢复相同交易版本并取消待发送删除 operation。
4. 超时调用 `flushPendingDelete()` 触发同步；页面刷新或应用重启后，既有同步触发器仍会发送已到期 tombstone。

删除保存失败时页面数据保持不变。撤销失败时 toast 不静默消失，而是显示中文失败说明和“重新加载”入口。

## 6. 视觉资产与响应式布局

新增独立资产：

- `illustration:home-seaside`：首页海边、椰树/吊床与帆船场景。
- `illustration:empty-ledger`：空流水插画。
- `category:*`：餐饮、交通、购物、住房、娱乐、日用、学习、医疗、旅行、收入和其他。

资产基于已提交视觉参考重绘为独立 SVG，必须有 `viewBox`，不得嵌入整张设计稿、emoji、远程 URL 或脚本。分类图标进入现有类型安全 registry；缺少未知自定义图标时回退 `category:other`。

首页使用纸张纹理、暖边框、柔和阴影和已有颜色令牌。流水页保持紧凑，不增加大面积统计卡。320px 下只允许分类 chips 容器自身横向滚动，文档和主内容不得横向溢出。

所有金额使用等宽数字。预算超支、收入/支出和选中状态都有文字、符号或图标辅助，不能只靠颜色。

## 7. 加载、空状态与错误

- 首次查询显示占位骨架或简短加载状态，不回退到旧的“下一阶段”占位文案。
- 空账本仍显示 0 元真实指标、未设置预算和正式空流水插画。
- 查询失败显示中文概述和重试按钮，不显示 IndexedDB/Supabase 原始错误。
- 快速切换筛选时取消旧结果的提交资格，避免列表闪回。
- 同步进行中不锁住本地筛选、查看、编辑或删除；保存仍坚持本地优先。

## 8. 无障碍

- 页面有唯一可识别标题；筛选控件有可见标签或稳定 accessible name。
- 预算使用 `role=progressbar`，提供当前值、最大值及中文摘要；无预算时不伪装成 0% progressbar。
- 分类 chips、流水行、详情/编辑/删除/撤销操作均至少 44×44 CSS 像素。
- 详情层使用 dialog 语义、焦点圈定、Escape 关闭和来源焦点恢复；背景继续使用 `inert`。
- 删除/撤销结果使用适当 live region，不能反复打断输入。
- 减少动态效果时禁用非必要的卡片/提示过渡，但不隐藏状态变化。

## 9. 测试与视觉批准

### 9.1 自动化层次

1. Repository：账本范围过滤、原子快照、变化监听和跨账本隔离。
2. ViewModel：固定时钟下的首页指标、预算、快捷分类、最近三条、组合筛选、日期分组、金额语义、编辑 operation、删除与撤销。
3. React：加载/空/错误、筛选、详情焦点、编辑校验、8 秒 fake timer 和撤销失败。
4. Browser：320×568、390×844、430×932 的内容层级、触控目标、无横向文档溢出、dialog、live region 和减少动态效果。

固定财务夹具必须包含支出、收入、转账、退款、余额校准、不同账户/分类、跨日/月记录、总预算和已删除记录，以证明过滤与统计口径。

### 9.2 视觉基线流程

- 登录、忘记密码、恢复密码和未预选分类的中央记账层现有批准像素保持不变。
- 首页三张现有 placeholder 基线将被有意替换；新增至少 320、390、430 三档首页候选和 390 流水候选。
- 先生成独立候选图供用户确认。用户确认前不得运行快照更新命令。
- 用户确认后才写入正式基线，并记录每张 SHA-256、代码来源提交和接受差异。
- 真实非零 iPhone safe-area inset 仍需后续实机验收；Chromium 证据只声明已验证 fallback 与无重叠。

### 9.3 完整门禁

- 全量单元测试、类型检查、生产构建、普通 Playwright 与视觉比较全部通过。
- 生产包不得包含固定财务夹具、E2E 模式、测试密码、service-role 密钥或页面对 Supabase/Dexie 的直接访问。
- `git diff --check` 通过，工作树干净。

## 10. 完成标准

- 首页无需进入二级页面即可回答总资产、今日支出和本月预算余量。
- 首页所有数字来自同一真实本地账本快照，不含伪造财务数据。
- 流水页完成组合筛选、紧凑日期分组、每日合计、详情和同类型编辑。
- 删除可在 8 秒内恢复，超时后进入正常同步路径；失败不会静默丢数据。
- 四个普通标签继续保持挂载、筛选/详情/滚动状态保持，中央记账来源行为不回归。
- 320px 无文档横向滚动，关键操作 44px，可用键盘和屏幕阅读器完成。
- 新首页/流水视觉经用户批准后进入正式基线，既有认证像素保持不变。
