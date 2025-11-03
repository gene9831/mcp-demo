// Type definition for objects with index property
export type ObjectWithIndex = { index: number; [key: string]: any }

// Type guard to check if value is an object
const isObject = (value: any) => {
  return typeof value === 'object' && value !== null
}

const isObjectWithIndex = (value: any): value is ObjectWithIndex => {
  return isObject(value) && typeof value.index === 'number'
}

/**
 * Merge delta data from streaming responses
 * Handles string concatenation, object merging, and array merging by index
 *
 * @param target - Target object to merge into
 * @param source - Source object to merge from
 * @returns Merged target object
 */
export const combileDeltaData = (target: Record<string, any>, source: Record<string, any>) => {
  for (const [sourceKey, sourceValue] of Object.entries(source)) {
    const targetValue = target[sourceKey]

    if (targetValue) {
      if (typeof targetValue === 'string' && typeof sourceValue === 'string') {
        // Both are strings, concatenate them
        target[sourceKey] = targetValue + sourceValue
      } else if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
        if (
          targetValue.every((item) => isObjectWithIndex(item)) &&
          sourceValue.every((item) => isObjectWithIndex(item))
        ) {
          // Both are arrays of objects with index property, merge by index
          const targetMap = new Map(targetValue.map((item) => [item.index, item]))
          const sourceMap = new Map(sourceValue.map((item) => [item.index, item]))

          // Merge the two Maps, recursively merge objects with same index
          for (const [index, sourceItem] of sourceMap) {
            if (targetMap.has(index)) {
              // Objects with same index, recursively merge
              const targetItem = targetMap.get(index)!
              targetMap.set(index, combileDeltaData(targetItem, sourceItem) as ObjectWithIndex)
            } else {
              // New index, add directly
              targetMap.set(index, sourceItem)
            }
          }

          // Convert Map back to array, assign to corresponding index positions
          const arrLen = Math.max(...Array.from(targetMap.keys()), -1) + 1

          const resultArray = arrLen > targetValue.length ? Array.from({ length: arrLen }) : targetValue

          for (const [index, item] of targetMap) {
            resultArray[index] = item
          }

          target[sourceKey] = resultArray
        } else {
          // Regular arrays, merge directly
          target[sourceKey] = [...targetValue, ...sourceValue]
        }
      } else if (isObject(targetValue) && isObject(sourceValue)) {
        // Both are objects, recursively merge
        target[sourceKey] = combileDeltaData(targetValue, sourceValue)
      }
    } else {
      // Property doesn't exist, assign directly
      target[sourceKey] = sourceValue
    }
  }

  return target
}
