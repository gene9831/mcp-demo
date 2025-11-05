# useMessage 支持工具调用

- 工具调用使用插件集成
- 多个工具同时调用
- 工具可取消调用（工具实际请求不取消，可以取消当前对话流程）

## 问题

- ✅ 工具调用用户禁止，保留工具调用消息
- ✅ 工具调用只保留结果，用于下一次回话（此特性可选）
- ✅ 如果工具调用也根据signal中断，会不会提前抛出错误
  - 工具错误不会抛出
  - 其他插件如果使用signal来抛出错误，也会正常转换成abort状态。使用了当前abortController.signal.aborted来判断是否是中止错误。

## 完整生命周期流程

```text
sendMessage/send (用户调用)
    ↓
开始一个对话回合
    ↓
1. onTurnStart (串行执行，可返回清理函数)
    ↓
2. onBeforeRequest (串行执行，可修改 requestBody)
    ↓
发起请求，开始流式响应
    ↓
3. onResponseMessageAppend (第一个数据块时触发，可阻止默认追加)
    ↓
4. onSSEStreamData (每个 SSE 数据块触发)
    ↓
流式响应结束
    ↓
5. onAfterRequest (并行执行，通过 appendMessage 追加消息)
    ↓
有新消息且 shouldRequest=true?
    ├─ 是 → 递归请求（从 onBeforeRequest 开始）
    └─ 否 → 6. onTurnEnd (串行执行)
    ↓
执行清理 onTurnStart 返回的清理函数 (如有，LIFO 顺序)
    ↓
完成
```

## 关键钩子函数说明

### 1. onTurnStart

- **时机**: 用户消息入队后，正式发起请求之前
- **执行方式**: 串行执行（按插件注册顺序），有错误则中断，整个流程结束
- **返回值**: 可选的清理函数，会在 finally 块中执行（LIFO 顺序）
- **注意**: 递归请求（由 `onAfterRequest` 触发）**不会**执行此钩子，直接从 `onBeforeRequest` 开始

### 2. onBeforeRequest

- **时机**: requestBody 已创建，正式发起请求之前
- **执行方式**: 串行执行（避免并发修改 requestBody），有错误则中断，整个流程结束
- **用途**: 增补 tools、注入上下文参数、参数校验等
- **注意**: 递归请求会再次执行此钩子

### 3. onResponseMessageAppend

- **时机**: 接收到响应数据的第一个数据块时，消息对象已创建但尚未添加到 messages 数组
- **执行方式**: 按插件注册顺序串行执行
- **默认行为**: 如果没有任何插件调用 `preventDefault()`，系统会自动将消息追加到 messages 数组末尾
- **自定义行为**: 如果插件调用了 `preventDefault()`，则阻止默认追加逻辑，插件需要自行负责将消息添加到 messages 数组
- **用途**: 自定义消息添加逻辑、修改消息属性、控制消息添加位置等

### 4. onSSEStreamData

- **时机**: 接收到每个 SSE 数据块时
- **执行方式**: 每个数据块都会触发所有插件
- **用途**: 自定义增量合并、实时 UI 效果等

### 5. onAfterRequest

- **时机**: 本次请求（含流式）结束后
- **执行方式**: 并行执行（Promise.all），任一插件抛错将中断本轮流程
- **消息追加**: 通过 `appendMessage` 或 `appendAndRequest` 追加消息
  - `appendMessage(message, { request: true })` 或 `appendAndRequest(message)` 会自动触发下一次请求
  - 支持优先级排序：消息会按优先级降序排序，优先级相同时按插件注册顺序排序
- **递归请求**: 如果 `appendMessage` 时设置了 `request: true`，会自动触发新一轮请求
  - 递归请求从 `onBeforeRequest` 开始执行（**不会**执行 `onTurnStart`）
  - 递归请求完成后会再次执行 `onAfterRequest`，形成循环直到不再有消息需要追加或触发请求

### 6. onTurnEnd

- **时机**: 本轮对话完成（成功、失败或被中止）后，在执行清理函数之前
- **执行方式**: 串行执行（不依赖 onTurnStart 是否成功），有错误则中断，整个流程结束
- **注意**: 递归请求不会执行此钩子，只有整个对话回合（turn）结束时才会执行

## 清理函数执行顺序

清理函数采用 **LIFO（后进先出）** 策略：

- 插件 A 的清理函数先注册（先返回）
- 插件 B 的清理函数后注册（后返回）
- 执行顺序：B → A（逆序执行）

清理函数会在 `finally` 块中执行，即使主流程发生错误也会执行。清理函数的错误会被收集，不会中断其他清理函数的执行，最终与主流程错误聚合。

## 消息优先级和排序

在 `onAfterRequest` 中，多个插件可能通过 `appendMessage` 追加消息。消息会按照以下规则排序：

1. **优先级排序**：按 `priority` 降序排序（数字越大优先级越高）
2. **注册顺序**：优先级相同时，按插件注册顺序（`index` 升序）排序

排序后的消息会按顺序追加到 `messages` 数组，并添加到 `currentTurn` 中。
