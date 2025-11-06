// 生成器函数，模拟工具调用并流式输出

// 函数参数选项接口
interface SimulateToolCallOptions {
  signal?: AbortSignal
  useDeltaMode?: boolean
}

// 函数重载：根据 useDeltaMode 推断返回类型
export function simulateToolCallGenerator(
  toolName: string,
  args: { a: number; b: number },
  options: { signal?: AbortSignal; useDeltaMode: true },
): AsyncGenerator<Record<string, any>, void, unknown>
export function simulateToolCallGenerator(
  toolName: string,
  args: { a: number; b: number },
  options?: { signal?: AbortSignal; useDeltaMode?: false },
): AsyncGenerator<string, void, unknown>
export function simulateToolCallGenerator(
  toolName: string,
  args: { a: number; b: number },
  options?: SimulateToolCallOptions,
): AsyncGenerator<string | Record<string, any>, void, unknown>
export async function* simulateToolCallGenerator(
  toolName: string,
  args: { a: number; b: number },
  options?: SimulateToolCallOptions,
): AsyncGenerator<string | Record<string, any>, void, unknown> {
  const { signal, useDeltaMode } = options ?? {}

  await new Promise((resolve) => setTimeout(resolve, 1000))

  // 错误模拟
  if (Math.random() < 0.2) {
    throw new Error('Simulated error: Random failure for testing purposes')
  }

  // 根据工具名称计算结果
  let result: number
  let operator: string
  let operationName: string

  if (toolName === 'add') {
    result = args.a + args.b
    operator = '+'
    operationName = 'adding'
  } else if (toolName === 'multiply') {
    result = args.a * args.b
    operator = '*'
    operationName = 'multiplying'
  } else {
    throw new Error(`Unknown tool: ${toolName}`)
  }

  // Delta 模式：输出 delta 对象
  if (useDeltaMode) {
    // 第一次输出：包含 type 和空 text 的初始 delta 对象
    yield { type: 'text', text: '' }
    // 将结果转换为字符串，每个字符作为一个 delta 对象输出
    const resultString = String(result)
    for (let i = 0; i < resultString.length; i++) {
      // 每次迭代前检查是否被终止
      if (signal?.aborted) {
        throw new Error('Tool call was aborted')
      }

      await new Promise((resolve) => setTimeout(resolve, 100))

      // 延迟后再次检查
      if (signal?.aborted) {
        throw new Error('Tool call was aborted')
      }

      yield { text: resultString[i] }
    }
    return
  }

  // 默认模式：输出字符串字符
  const resultString = `{"type":"text","text":"${result}"}`

  // 每100ms输出一个字符
  for (let i = 0; i < resultString.length; i++) {
    // 每次迭代前检查是否被终止
    if (signal?.aborted) {
      throw new Error('Tool call was aborted')
    }

    await new Promise((resolve) => setTimeout(resolve, 100))

    // 延迟后再次检查
    if (signal?.aborted) {
      throw new Error('Tool call was aborted')
    }

    yield resultString[i]
  }
}
