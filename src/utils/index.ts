interface GroupOptions<T extends Record<string, any>, K extends string = 'groupId'> {
  /** 用于分组的属性名，默认为'id' */
  groupBy?: keyof T
  /** 分组ID的key名称，默认为'groupId' */
  groupIdKey?: K
  /** 是否要求相邻对象相同才能分到同一组 */
  requireAdjacent?: boolean
}

// 分组结果类型：包含唯一分组ID和对应组内元素
type GroupResult<T extends Record<string, any>, K extends string = 'groupId'> = {
  [P in K]: string | number // 唯一分组ID
} & {
  items: T[] // 组内元素
}

/**
 * 按指定属性全局分组（不要求相邻）
 * 组ID直接使用元素的指定属性值（全局唯一）
 */
function groupGlobally<T extends Record<string, any>, K extends string = 'groupId'>(
  arr: T[],
  options: GroupOptions<T, K> = {},
): GroupResult<T, K>[] {
  const { groupBy = 'id' as keyof T, groupIdKey = 'groupId' as K } = options
  const groupsMap = new Map<string | number, GroupResult<T, K>>()

  for (const item of arr) {
    const groupValue = item[groupBy] as string | number
    if (groupsMap.has(groupValue)) {
      groupsMap.get(groupValue)!.items.push(item)
    } else {
      // 全局分组：groupId直接使用item的指定属性值
      const groupResult = {
        [groupIdKey]: groupValue,
        items: [item],
      } as GroupResult<T, K>
      groupsMap.set(groupValue, groupResult)
    }
  }

  return Array.from(groupsMap.values())
}

/**
 * 按指定属性相邻分组（仅相邻相同属性值合并）
 * 组ID使用`属性值+序号`（同一属性值的相邻分组按出现顺序编号）
 */
function groupAdjacent<T extends Record<string, any>, K extends string = 'groupId'>(
  arr: T[],
  options: GroupOptions<T, K> = {},
): GroupResult<T, K>[] {
  if (arr.length === 0) return []

  const { groupBy = 'id' as keyof T, groupIdKey = 'groupId' as K } = options
  const groups: GroupResult<T, K>[] = []
  // 记录同一属性值的相邻分组出现次数
  const valueCounter = new Map<string | number, number>()

  // 初始化第一个组
  const firstValue = arr[0][groupBy] as string | number
  valueCounter.set(firstValue, 1)
  let currentGroup: GroupResult<T, K> = {
    [groupIdKey]: `${firstValue}-1`, // 格式：属性值-序号
    items: [arr[0]],
  } as GroupResult<T, K>

  for (let i = 1; i < arr.length; i++) {
    const currentItem = arr[i]
    const lastItemInGroup = currentGroup.items[currentGroup.items.length - 1]
    const currentValue = currentItem[groupBy] as string | number
    const lastValue = lastItemInGroup[groupBy] as string | number

    if (currentValue === lastValue) {
      // 相邻属性值相同，加入当前组
      currentGroup.items.push(currentItem)
    } else {
      // 相邻属性值不同，保存当前组并创建新组
      groups.push(currentGroup)

      // 更新计数器：同一属性值的相邻分组序号+1
      const count = (valueCounter.get(currentValue) || 0) + 1
      valueCounter.set(currentValue, count)

      // 新组ID：属性值+当前序号
      currentGroup = {
        [groupIdKey]: `${currentValue}-${count}`,
        items: [currentItem],
      } as GroupResult<T, K>
    }
  }

  // 添加最后一个组
  groups.push(currentGroup)
  return groups
}

/**
 * 按指定属性对对象数组进行分组，每个分组包含唯一的分组ID
 * @param arr 待分组的对象数组
 * @param options 分组配置项
 * @returns 带唯一分组ID的分组结果数组
 */
function groupBy<T extends Record<string, any>, K extends string = 'groupId'>(
  arr: T[],
  options: GroupOptions<T, K> = {},
): GroupResult<T, K>[] {
  const { requireAdjacent = false } = options

  if (requireAdjacent) {
    return groupAdjacent(arr, options)
  } else {
    return groupGlobally(arr, options)
  }
}

// 导出函数和类型
export { groupBy }
export type { GroupOptions, GroupResult }

// 自定义中止错误类型，便于使用 instanceof 判断
export class AbortError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AbortError'
  }
}

/**
 * @param signal AbortController 的信号对象
 * @returns 一个在信号中止时拒绝的 Promise
 */
export function createAbortPromise(signal: AbortSignal): { promise: Promise<never>; cleanup: () => void } {
  // 如果信号已经被中止，直接返回一个拒绝的 Promise，并提供空 cleanup
  if (signal.aborted) {
    return { promise: Promise.reject(new AbortError(String(signal.reason ?? 'Aborted'))), cleanup: () => {} }
  }

  let handler: (() => void) | null = null
  const promise = new Promise<never>((_, reject) => {
    handler = () => {
      reject(new AbortError(String(signal.reason ?? 'Aborted')))
    }
    signal.addEventListener('abort', handler, { once: true })
  })

  const cleanup = () => {
    if (handler) {
      signal.removeEventListener('abort', handler)
      handler = null
    }
  }

  return { promise, cleanup }
}

/**
 * 包装一个现有的 Promise，使其支持 AbortController 终止。
 * @param originalPromise 您的原始 Promise
 * @param signal AbortController 的信号
 * @returns 一个可被中止的新 Promise
 */
export function makeAbortable<T>(originalPromise: Promise<T>, signal: AbortSignal): Promise<T> {
  // 1. 创建带清理能力的中止 Promise
  const { promise: abortPromise, cleanup } = createAbortPromise(signal)

  // 2. 使用 Promise.race() 赛跑，并在结束后主动移除监听器
  return Promise.race([
    originalPromise, // 原始 Promise
    abortPromise, // 中止 Promise
  ]).finally(cleanup)
}

/**
 * 检查值是否为异步可迭代对象
 * @param value 要检查的值
 * @returns 是否为异步可迭代对象
 */
export function isAsyncIterable<T>(value: any): value is AsyncIterable<T> {
  return value != null && typeof value[Symbol.asyncIterator] === 'function'
}

/**
 * 将 Promise 转换为异步生成器
 * @param promise 要转换的 Promise
 * @returns 异步生成器
 */
export async function* promiseToAsyncGenerator<T>(promise: Promise<T>): AsyncGenerator<T, void, unknown> {
  yield await promise
}

/**
 * 将 Promise 或异步迭代器统一转换为异步生成器
 * @param value Promise 或异步迭代器
 * @returns 异步生成器
 */
export function toAsyncGenerator<T>(value: Promise<T> | AsyncIterable<T>): AsyncGenerator<T, void, unknown> {
  if (isAsyncIterable(value)) {
    // 如果已经是异步迭代器，直接返回（AsyncGenerator 是 AsyncIterable 的子类型）
    // 使用类型断言，因为运行时 AsyncIterable 通常就是 AsyncGenerator
    return value as AsyncGenerator<T, void, unknown>
  } else {
    // 如果是 Promise，转换为异步生成器
    return promiseToAsyncGenerator(value)
  }
}

/**
 * 从对象中提取指定字段，返回一个新对象
 * @param obj 源对象
 * @param fields 要提取的字段数组
 * @returns 只包含指定字段的新对象
 */
export function pickFields<T extends Record<string, any>, K extends keyof T>(obj: T, fields: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>
  for (const field of fields) {
    if (field in obj) {
      result[field] = obj[field]
    }
  }
  return result
}
