// Generator function to simulate tool call with streaming output
// 生成器函数，模拟工具调用并流式输出
export async function* simulateToolCallGenerator(
  toolName: string,
  args: { a: number; b: number },
  signal?: AbortSignal,
): AsyncGenerator<string, void, unknown> {
  // Error simulation: 20% probability of failure
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

  // Create a longer result string with full equation and description
  // 创建包含完整算式和说明的长字符串
  const resultString = `Result: ${args.a} ${operator} ${args.b} = ${result}`

  // Yield each character with 100ms delay
  // 每100ms输出一个字符
  for (let i = 0; i < resultString.length; i++) {
    // Check if aborted before each iteration
    // 每次迭代前检查是否被终止
    if (signal?.aborted) {
      throw new Error('Tool call was aborted')
    }

    await new Promise((resolve) => setTimeout(resolve, 100))

    // Check again after delay
    // 延迟后再次检查
    if (signal?.aborted) {
      throw new Error('Tool call was aborted')
    }

    yield resultString[i]
  }
}
