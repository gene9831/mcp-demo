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
┌─────────────────────────────────────────┐
│             执行请求阶段                  │
│                                         │
│  2. onBeforeRequest (串行执行，可修改 requestBody)
│     ↓
│  发起请求，开始流式响应
│     ↓
│  3. onSSEStreamData (每个 SSE 数据块触发)
│     ↓
│  流式响应结束
│     ↓
│  4. onAfterRequest (并行执行，通过 appendMessage/appendAndRequest 追加消息)
│     ↓
│  有新消息且 shouldRequest=true?
│     ├─ 是 → 递归请求（从 onBeforeRequest 开始）
│     └─ 否 → 退出执行请求阶段
└─────────────────────────────────────────┘
    ↓
5. onTurnEnd (串行执行)
    ↓
执行清理 onTurnStart 返回的清理函数 (如有，LIFO 顺序)
    ↓
完成
```

## 消息追加钩子

### onMessageAppend

- **时机**: 响应消息和插件追加的消息等在添加到 messages 数组之前（不包括通过 send 或 sendMessage 发送的用户消息）
- **执行方式**: 按插件注册顺序串行执行（每个消息单独触发）
- **上下文参数**:
  - `currentMessage`: 当前待追加的消息对象，可直接修改属性
  - `preventDefault()`: 阻止默认追加逻辑，插件需自行负责将消息添加到 messages 数组
- **行为**: 默认自动追加到 messages 数组末尾，调用 `preventDefault()` 可自定义添加逻辑、修改属性、控制位置或过滤消息

## 关键钩子函数说明

### 1. onTurnStart

- **时机**: 用户消息入队后，正式发起请求之前
- **执行方式**: 按插件注册**顺序**串行执行，适合需要依赖顺序的初始化/校验。有错误则中断，整个流程结束
- **返回值**: 可选返回清理函数。清理函数在 finally 块中执行（即使主流程错误也会执行），按**顺序**串行执行，错误会被收集而不中断执行，最终与主流程错误聚合
- **注意**: 递归请求（由 `onAfterRequest` 触发）**不会**执行此钩子，直接从 `onBeforeRequest` 开始

### 2. onBeforeRequest

- **时机**: 已组装 requestBody，正式发起请求之前
- **执行方式**: 按插件注册顺序串行执行，避免并发修改 requestBody。有错误则中断，整个流程结束
- **用途**: 增补 tools、注入上下文参数、进行参数校验等
- **上下文参数**:
  - `requestBody`: 请求体对象，可直接修改
  - `setRequestMessages(messages)`: 设置请求消息列表，会自动根据 `requestMessageFields` 过滤字段
- **注意**: 递归请求会再次执行此钩子

### 3. onSSEStreamData

- **时机**: 接收到每个 SSE 数据块时
- **执行方式**: 每个数据块都会触发所有插件
- **上下文参数**: `currentMessage`（当前正在构建的消息对象）、`data`（SSE 数据块）
- **用途**: 自定义增量合并、实时 UI 效果等

### 4. onAfterRequest

- **时机**: 本次请求（含流式）结束后
- **执行方式**: 并行执行（Promise.all），各插件通过 appendMessage 追加消息，消息会按插件注册顺序合并。任一插件抛错将中断本轮流程
- **上下文参数**:
  - `currentMessage`: 当前响应消息
  - `lastChoiceChunk`: 最后一个选择块（可选）
  - `appendMessage(message, options?)`: 追加消息到消息列表
    - `message`: 要追加的消息或消息数组
    - `options.request`: 是否自动触发下一次请求，默认为 false
    - `options.priority`: 优先级，数字越大优先级越高，默认为 0（仅在异步模式下有效）
    - `options.async`: 是否异步模式，默认为 false
  - `appendAndRequest(message, options?)`: 追加消息并自动触发下一次请求（相当于 `appendMessage(message, { request: true })`）
- **消息追加行为**:
  - **同步模式**（`async: false` 或未设置）：立即写入 `messages`，触发 `onMessageAppend` 钩子，不参与批量合并与优先级排序
  - **异步模式**（`async: true`）：收集后统一合并并按优先级降序排序，优先级相同时按插件注册顺序排序，合并后触发 `onMessageAppend` 钩子
  - 设置 `request: true` 或使用 `appendAndRequest` 会自动触发下一次请求（从 `onBeforeRequest` 开始，**不会**执行 `onTurnStart`），形成循环直到不再有消息需要追加或触发请求

### 5. onTurnEnd

- **时机**: 本轮对话完成（成功或被中止）后，在执行清理函数之前。仅当 `onTurnStart` 成功且 `executeRequest` 成功或中止时执行；如果 `onTurnStart` 或 `executeRequest` 抛出非中止错误，则不会执行
- **执行方式**: 按插件注册**顺序**串行执行，有错误则中断，整个流程结束
- **注意**: 递归请求不会执行此钩子，只有整个对话回合（turn）结束时才会执行

## 清理函数执行顺序

清理函数采用 **LIFO（后进先出）** 策略：后注册的先执行（逆序执行）。清理函数在 `finally` 块中执行，即使主流程发生错误也会执行。错误会被收集而不中断执行，最终与主流程错误聚合。

## 消息优先级和排序

在 `onAfterRequest` 中，异步模式（`async: true`）下的消息会按以下规则排序：

1. 按 `priority` 降序排序（数字越大优先级越高）
2. 优先级相同时，按插件注册顺序排序

排序后的消息会按顺序追加到 `messages` 数组，并添加到 `currentTurn` 中。
