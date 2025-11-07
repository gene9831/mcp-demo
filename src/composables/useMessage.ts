import { computed, reactive, ref } from 'vue'
import type {
  BasePluginContext,
  Choice,
  MaybePromise,
  Message,
  MessageRequestBody,
  RequestProcessingState,
  RequestState,
  SSEStreamChunk,
  useMessageOptions,
} from '../types'
import { AbortError, makeAbortable, pickFields } from '../utils'
import { createChatStreamIterator } from '../utils/chatStream'
import { combileDeltaData } from '../utils/deltaDataMerger'

export const useMessage = (options: useMessageOptions = {}) => {
  const {
    initialMessages = [],
    requestMessageFields = ['role', 'content', 'tool_calls', 'tool_call_id'],
    plugins = [],
  } = options

  const requestState = ref<RequestState>('idle')
  const processingState = ref<RequestProcessingState | undefined>(undefined)
  const messages = ref<Message[]>(initialMessages)
  let abortController: AbortController | null = null
  let currentTurn: Message[] = []

  // Computed properties for UI state
  const isProcessing = computed(() => requestState.value === 'processing')

  // Function to handle sending message with streaming
  const sendMessage = async (content: string) => {
    // Validate input content
    if (!content || !content.trim()) {
      console.warn('Cannot send empty message')
      return
    }

    // Validate current state - only allow sending when not processing
    if (isProcessing.value) {
      console.warn('Cannot send message while processing is in progress')
      return
    }

    const now = Math.floor(Date.now() / 1000)
    // Add user message to conversation
    messages.value.push({ role: 'user', content: content.trim(), metadata: { createdAt: now, updatedAt: now } })
    currentTurn.push(messages.value[messages.value.length - 1])

    // Execute the request
    await tryExecuteRequest()
  }

  const send = async (...msgs: Message[]) => {
    if (msgs.length === 0) {
      console.warn('Cannot send empty messages')
      return
    }

    // Validate current state - only allow sending when not processing
    if (isProcessing.value) {
      console.warn('Cannot send message while processing is in progress')
      return
    }

    messages.value.push(...msgs)
    currentTurn.push(...msgs)

    // Execute the request
    await tryExecuteRequest()
  }

  const sanitizeMessages = (messages: Message[]) => {
    return messages.map((message) => pickFields(message, requestMessageFields))
  }

  const setRequestState = (state: RequestState, pState?: RequestProcessingState) => {
    requestState.value = state
    if (state === 'processing') {
      processingState.value = pState || 'requesting'
    } else {
      processingState.value = undefined
    }
  }

  // Create base context for plugins
  const getBaseContext = (): Omit<BasePluginContext, 'abortSignal'> => ({
    messages: messages.value,
    currentTurn,
    requestState: requestState.value,
    processingState: processingState.value,
    requestMessageFields,
    plugins,
    setRequestState,
  })

  const executeRequest = async (abortSignal: AbortSignal) => {
    setRequestState('processing', 'requesting')

    const requestBody: MessageRequestBody = {
      messages: sanitizeMessages(messages.value),
    }

    const setRequestMessages = (messages: Message[]) => {
      requestBody.messages = sanitizeMessages(messages)
    }

    // Allow plugins to modify request body (e.g., add tools)
    const baseContext = getBaseContext()
    for (const plugin of plugins) {
      await plugin.onBeforeRequest?.({ ...baseContext, abortSignal, requestBody, setRequestMessages })
    }

    const message: Message = reactive({ role: '', content: '' })
    let lastChoiceChunk: Choice | undefined = undefined
    let messageAppended = false

    const streamIterator = await createChatStreamIterator<SSEStreamChunk>(requestBody, {
      signal: abortSignal,
    })

    for await (const chunk of streamIterator) {
      setRequestState('processing', 'streaming')

      // 目前只选择index为0的choice
      const choice = chunk.choices?.find((choice) => choice.index === 0)
      if (choice) {
        lastChoiceChunk = choice
        // Ensure metadata exists
        if (!message.metadata) {
          message.metadata = {}
        }

        const { created, choices, ...rest } = chunk
        message.metadata.createdAt = created
        message.metadata.updatedAt = Math.floor(Date.now() / 1000)
        Object.assign(message.metadata, rest)

        combileDeltaData(message, choice.delta)
      }

      const baseContext = getBaseContext()
      for (const plugin of plugins) {
        plugin.onSSEChunk?.({ ...baseContext, abortSignal, chunk, currentMessage: message })
      }

      if (!messageAppended) {
        messageAppended = true

        innerAppendMessage(message)
      }
    }

    await postRequest(message, abortSignal, lastChoiceChunk)
  }

  const tryExecuteRequest = async () => {
    const ac = new AbortController()
    abortController = ac

    // Store cleanup functions returned from onTurnStart (stack behavior: LIFO)
    type TurnCleanup = (context: BasePluginContext) => MaybePromise<void>
    const cleanupStack: TurnCleanup[] = []
    let mainError: unknown = null

    try {
      setRequestState('processing', 'requesting')
      // 1) onTurnStart 串行执行，有错误则中断
      const baseContextAtStart = getBaseContext()
      for (const plugin of plugins) {
        const cleanupFn = await plugin.onTurnStart?.({ ...baseContextAtStart, abortSignal: ac.signal })
        // 如果返回了清理函数，则将其压入栈中（LIFO: 后进先出）
        // 这样在 finally 块中执行清理函数时，会按照注册顺序逆序执行
        if (typeof cleanupFn === 'function') {
          cleanupStack.unshift(cleanupFn)
        }
      }

      // 2) 主流程执行，有错误则中断（不包括中止错误）
      try {
        await executeRequest(ac.signal)
        setRequestState('completed')
      } catch (err) {
        // 检查是否是中止错误：优先检查当前使用的 AbortController 的信号状态
        // 然后检查错误类型（instanceof 检查最准确）
        // 最后通过 name 属性作为后备检查（处理跨模块/序列化等边界情况）
        if (ac.signal.aborted || err instanceof AbortError || (err instanceof Error && err.name === 'AbortError')) {
          setRequestState('aborted')
        } else {
          throw err
        }
      }

      // 3) onTurnEnd 串行执行，有错误则中断
      const baseContextAtEnd = getBaseContext()
      for (const plugin of plugins) {
        await plugin.onTurnEnd?.({ ...baseContextAtEnd, abortSignal: ac.signal })
      }
    } catch (err) {
      setRequestState('error')
      mainError = err
    } finally {
      const cleanupErrors: unknown[] = []

      // Always execute cleanup functions returned from onTurnStart, even if errors occurred
      const baseContextAtCleanup = getBaseContext()
      for (const cleanup of cleanupStack) {
        try {
          await cleanup({ ...baseContextAtCleanup, abortSignal: ac.signal })
        } catch (err) {
          cleanupErrors.push(err)
        }
      }

      // Reset abortController and currentTurn
      abortController = null
      currentTurn = []

      // Aggregate errors: main error first, then cleanup errors
      const allErrors: unknown[] = []
      if (mainError) {
        allErrors.push(mainError)
      }
      allErrors.push(...cleanupErrors)

      // Throw errors: single error directly, multiple errors as AggregateError
      if (allErrors.length > 0) {
        if (allErrors.length === 1) {
          throw allErrors[0]
        }
        throw new AggregateError(allErrors, 'Errors occurred during turn lifecycle')
      }
    }
  }

  // Function to cancel the current message request
  const abortRequest = () => {
    abortController?.abort()
  }

  const postRequest = async (currentMessage: Message, abortSignal: AbortSignal, lastChoiceChunk?: Choice) => {
    // 收集每个插件的消息组，支持优先级排序。index 用于在优先级相同时保持插件注册顺序
    type MessageGroup = { messages: Message[]; priority: number; index: number }
    const pluginMessageGroups: MessageGroup[] = []
    let shouldRequest = false

    const baseContext = getBaseContext()

    const tasks = plugins
      .map((plugin, index) => {
        // 初始化该插件的消息组数组（即使插件没有 onAfterRequest）
        const messageGroup: MessageGroup = { messages: [], priority: 0, index }
        pluginMessageGroups[index] = messageGroup

        if (!plugin.onAfterRequest) {
          return null
        }

        const appendMessage = (
          message: Message | Message[],
          options?: { request?: boolean; priority?: number; async?: boolean },
        ) => {
          const msgs = Array.isArray(message) ? message : [message]

          // 如果是异步模式，收集到 messageGroup，稍后统一合并
          if (options?.async) {
            messageGroup.messages.push(...msgs)
            messageGroup.priority = options?.priority ?? 0
          } else {
            // 同步模式（默认）：直接 push 到 messages.value
            innerAppendMessage(msgs)
          }

          if (options?.request) {
            shouldRequest = true
          }
        }

        const appendAndRequest = (message: Message | Message[], options?: { priority?: number; async?: boolean }) => {
          appendMessage(message, { ...options, request: true })
        }

        return plugin.onAfterRequest({
          ...baseContext,
          abortSignal,
          currentMessage,
          lastChoiceChunk,
          appendMessage,
          appendAndRequest,
        })
      })
      .filter((task): task is Promise<void> => task !== null)

    // 并行执行所有 onAfterRequest 钩子
    await makeAbortable(Promise.all(tasks), abortSignal)

    // 排序逻辑：先按优先级降序，优先级相同时按插件注册顺序（index 升序）
    const mergedMessages = pluginMessageGroups
      .slice()
      .sort((a, b) => {
        // 优先级不同时，按优先级降序排序
        if (b.priority !== a.priority) {
          return b.priority - a.priority
        }
        // 优先级相同时，保持插件注册顺序（index 小的在前）
        return a.index - b.index
      })
      .flatMap((group) => group.messages)

    if (mergedMessages.length > 0) {
      innerAppendMessage(mergedMessages)
    }

    if (shouldRequest) {
      await executeRequest(abortSignal)
    }
  }

  const innerAppendMessage = (message: Message | Message[]) => {
    const msgs = Array.isArray(message) ? message : [message]

    for (const msg of msgs) {
      let shouldPreventDefault = false
      const preventDefault = () => {
        shouldPreventDefault = true
      }

      const baseContext = getBaseContext()
      for (const plugin of plugins) {
        if (plugin.onMessageAppend) {
          plugin.onMessageAppend({
            ...baseContext,
            abortSignal: abortController!.signal,
            currentMessage: msg,
            preventDefault,
          })
        }
      }

      // 如果 preventDefault 未被调用，执行默认追加逻辑
      if (!shouldPreventDefault) {
        messages.value.push(msg)
      }

      currentTurn.push(msg)
    }
  }

  return {
    // State
    requestState,
    processingState,
    messages,

    // Computed
    isProcessing,

    // Methods
    sendMessage,
    send,
    abortRequest,
    setRequestState,
  }
}
