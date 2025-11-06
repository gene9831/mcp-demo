// Message metadata interface
export interface MessageMetadata {
  createdAt?: number
  updatedAt?: number
  id?: string
  model?: string
  [key: string]: any
}

// Base message interface
export interface Message {
  role: string
  content: string
  metadata?: MessageMetadata
  tool_calls?: ToolCall[]
  tool_call_id?: string
  [key: string]: any
}

// Tool definition
export interface Tool {
  type: 'function'
  function: {
    name: string
    description: string
    /**
     * function 的输入参数，以 JSON Schema 对象描述
     */
    parameters: any
  }
}

// Main request body interface - for API requests
export interface RequestBody {
  messages: Partial<Message>[]
  model: string
  stream?: boolean
  tools?: Tool[]
  [key: string]: any
}

// Request body for plugins - only contains messages and additional parameters
export interface MessageRequestBody {
  messages: Partial<Message>[]
  tools?: Tool[]
  [key: string]: any
}

// Define different states for the request process
export type RequestState = 'idle' | 'processing' | 'completed' | 'aborted' | 'error'
export type RequestProcessingState = 'requesting' | 'streaming' | string

export interface ToolCall {
  index: number
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string // JSON string
    result?: string
  }
}

// Usage information for API response
export interface Usage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  prompt_tokens_details?: {
    cached_tokens: number
  }
  prompt_cache_hit_tokens?: number
  prompt_cache_miss_tokens?: number
}

// Delta content for streaming responses
export interface Delta {
  role?: string
  content?: string
  tool_calls?: ToolCall[]
}

// Choice item in streaming response
export interface Choice {
  index: number
  delta: Delta
  logprobs: any
  finish_reason: string | null
}

// SSE chunk data structure for streaming responses
export interface SSEStreamChunk {
  id: string
  object: string
  created: number
  model: string
  system_fingerprint: string | null
  choices: Choice[]
  usage?: Usage
}

export interface useMessageOptions {
  initialMessages?: Message[]
  requestMessageFields?: (keyof Message)[]
  plugins?: useMessagePlugin[]
}

export interface BasePluginContext {
  messages: Message[]
  currentTurn: Message[]
  requestState: RequestState
  processingState?: RequestProcessingState
  requestMessageFields: (keyof Message)[]
  plugins: useMessagePlugin[]
  setRequestState: (state: RequestState, processingState?: RequestProcessingState) => void
  abortSignal: AbortSignal
}

export type MaybePromise<T> = T | Promise<T>

export interface useMessagePlugin {
  /**
   * 插件名称。
   */
  name?: string
  /**
   * 一次对话回合（turn）开始的生命周期钩子。
   * 触发时机：用户消息入队后、正式发起请求之前。
   * 执行策略：按插件注册**顺序**串行执行，适合需要依赖顺序的初始化/校验。有错误则中断，整个流程结束。
   * 返回：可选返回清理函数。清理函数将在 finally 块中执行，即使主流程发生错误也会执行。
   * 清理函数按**顺序**串行执行，错误会被收集而不中断执行，最终与主流程错误聚合（如果存在主流程错误）。
   */
  onTurnStart?: (
    context: BasePluginContext,
  ) => MaybePromise<void | ((context: BasePluginContext) => MaybePromise<void>)>
  /**
   * 一次对话回合（turn）结束的生命周期钩子。
   * 触发时机：本轮对话完成（成功、失败或被中止）后，在执行 onTurnStart 返回的清理函数之前。
   * 执行策略：按插件注册**顺序**串行执行所有插件的 onTurnEnd（不依赖 onTurnStart 是否成功），有错误则中断。
   */
  onTurnEnd?: (context: BasePluginContext) => MaybePromise<void>
  /**
   * 请求开始前的生命周期钩子。
   * 触发时机：已组装 requestBody，正式发起请求之前。
   * 执行策略：按插件注册顺序串行执行，避免并发修改 requestBody 产生冲突。
   * 用途：增补 tools、注入上下文参数、进行参数校验等。
   */
  onBeforeRequest?: (
    context: BasePluginContext & {
      requestBody: MessageRequestBody
      /**
       * 设置请求消息列表。会自动根据 `requestMessageFields` 过滤消息字段，只保留指定的字段。
       * @param messages - 要设置的完整消息列表
       */
      setRequestMessages: (messages: Message[]) => void
    },
  ) => MaybePromise<void>
  /**
   * 请求完成后的生命周期钩子（如收到 AI 响应或需要处理 tool_calls 等）。
   * 触发时机：本次请求（含流式）结束后。
   * 执行策略：并行执行（Promise.all），各插件通过 appendMessage 追加消息，消息会按插件注册顺序合并。
   * 返回：void；不再使用返回值，所有消息追加通过 appendMessage 接口完成。
   */
  onAfterRequest?: (
    context: BasePluginContext & {
      currentMessage: Message
      lastChoiceChunk?: Choice
      /**
       * 追加消息到消息列表。支持自动触发下一次请求。
       * @param message - 要追加的消息或消息数组
       * @param options.request - 是否自动触发下一次请求，默认为 false
       * @param options.priority - 优先级，数字越大优先级越高，默认为 0（仅在异步模式下有效）
       * @param options.async - 是否异步模式，默认为 false。true 时收集后统一合并并按优先级排序，false 时立即 push 到 messages
       */
      appendMessage: (
        message: Message | Message[],
        options?: { request?: boolean; priority?: number; async?: boolean },
      ) => void
      /**
       * 追加消息到消息列表，并自动触发下一次请求（相当于 appendMessage(message, { request: true })）。
       * @param message - 要追加的消息或消息数组
       * @param options.priority - 优先级，数字越大优先级越高，默认为 0（仅在异步模式下有效）
       * @param options.async - 是否异步模式，默认为 false。true 时收集后统一合并并按优先级排序，false 时立即 push 到 messages
       */
      appendAndRequest: (message: Message | Message[], options?: { priority?: number; async?: boolean }) => void
    },
  ) => MaybePromise<void>
  /**
   * 消息追加钩子，在消息准备添加到 messages 数组时触发。
   * 触发时机：响应消息和插件追加的消息等在添加到 messages 数组之前（不包括通过 send 或 sendMessage 发送的用户消息）。
   * 执行策略：按插件注册顺序串行执行（每个消息单独触发）。
   * 默认行为：如果没有任何插件调用 preventDefault，系统会自动将消息追加到 messages 数组末尾。
   * 自定义行为：如果插件调用了 preventDefault，则阻止默认追加逻辑，插件需要自行负责将消息添加到 messages 数组。
   * 用途：自定义消息添加逻辑、修改消息属性、控制消息添加位置、消息过滤等。
   */
  onMessageAppend?: (
    context: BasePluginContext & {
      /**
       * 当前待追加的消息对象。插件可以直接修改此对象的属性，或调用 preventDefault() 阻止默认追加行为。
       */
      currentMessage: Message
      /**
       * 阻止默认追加逻辑。如果调用了此函数，将不会执行默认的消息追加到 messages 数组的操作。
       * 插件需要自行负责将消息添加到 messages 数组。
       */
      preventDefault: () => void
    },
  ) => void
  /**
   * SSE 流式数据处理钩子，在接收到每个数据块时触发。
   * 用途：自定义增量合并、实时 UI 效果等。
   */
  onSSEStreamData?: (context: BasePluginContext & { currentMessage: Message; data: SSEStreamChunk }) => void
}
