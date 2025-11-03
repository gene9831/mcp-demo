import { describe, expect, it } from 'vitest'
import { combileDeltaData } from '../deltaDataMerger'

describe('deltaDataMerger', () => {
  describe('combileDeltaData', () => {
    describe('Basic Operations', () => {
      it('should concatenate strings', () => {
        const target = { content: 'Hello' }
        const source = { content: ' World' }
        const result = combileDeltaData(target, source)
        expect(result.content).toBe('Hello World')
      })

      it('should merge nested objects', () => {
        const target = { user: { name: 'John', age: 30 }, content: 'Hello' }
        const source = { user: { city: 'New York' }, content: ' World' }
        const result = combileDeltaData(target, source)
        expect(result).toEqual({
          user: { name: 'John', age: 30, city: 'New York' },
          content: 'Hello World',
        })
      })

      it('should handle undefined target values', () => {
        const target = {}
        const source = { newKey: 'newValue' }
        const result = combileDeltaData(target, source)
        expect(result).toEqual({ newKey: 'newValue' })
      })
    })

    describe('Array Merging by Index', () => {
      it('should merge arrays by index with sparse arrays and handle expansion', () => {
        const target = {
          choices: [
            { index: 0, delta: { content: 'Hello' } },
            { index: 2, delta: { content: 'World' } },
          ],
        }
        const source = {
          choices: [
            { index: 0, delta: { content: ' ' } },
            { index: 1, delta: { content: 'Beautiful ' } },
            { index: 5, delta: { content: '!' } },
          ],
        }
        const result = combileDeltaData(target, source)
        expect(result.choices).toEqual([
          { index: 0, delta: { content: 'Hello ' } },
          { index: 1, delta: { content: 'Beautiful ' } },
          { index: 2, delta: { content: 'World' } },
          undefined, // Sparse array positions
          undefined,
          { index: 5, delta: { content: '!' } },
        ])
      })

      it('should handle complex nested merging in indexed arrays', () => {
        const target = {
          choices: [
            {
              index: 0,
              delta: { content: 'Hello', role: 'assistant' },
              finish_reason: null,
            },
          ],
        }
        const source = {
          choices: [
            {
              index: 0,
              delta: { content: ' World', tool_calls: [{ name: 'test' }] },
            },
            {
              index: 1,
              delta: { content: 'New choice' },
              finish_reason: 'stop',
            },
          ],
        }

        const result = combileDeltaData(target, source)
        expect(result.choices).toEqual([
          {
            index: 0,
            delta: {
              content: 'Hello World',
              role: 'assistant',
              tool_calls: [{ name: 'test' }],
            },
            finish_reason: null,
          },
          {
            index: 1,
            delta: { content: 'New choice' },
            finish_reason: 'stop',
          },
        ])
      })
    })

    describe('Regular Array Merging', () => {
      it('should handle mixed array types and non-indexed arrays', () => {
        const target = { data: [1, 2, 3] } // Regular array
        const source = { data: [{ index: 0, delta: { content: 'Hello' } }] } // Array with index objects

        const result = combileDeltaData(target, source)
        expect(result.data).toEqual([1, 2, 3, { index: 0, delta: { content: 'Hello' } }]) // Should merge as regular arrays
      })

      it('should handle arrays with partial indexed objects and non-numeric indices', () => {
        const target = {
          data: [{ index: 0, value: 'first' }, 'regular string', { index: 'a', value: 'third' }],
        }
        const source = {
          data: [
            { index: 1, value: 'second' },
            { index: null, value: 'fourth' },
          ],
        }

        const result = combileDeltaData(target, source)
        // Should treat as regular array since not all items have numeric index
        expect(result.data).toEqual([
          { index: 0, value: 'first' },
          'regular string',
          { index: 'a', value: 'third' },
          { index: 1, value: 'second' },
          { index: null, value: 'fourth' },
        ])
      })
    })

    describe('Real SSE Data Scenarios', () => {
      it('should handle typical chat completion and tool calls delta data', () => {
        let message: Record<string, any> = { role: '', content: '' }

        // First chunk: role assignment
        message = combileDeltaData(message, { role: 'assistant', content: '' })
        expect(message).toEqual({ role: 'assistant', content: '' })

        // Content streaming
        const contentChunks = ['根据', '查询', '结果', '，', '我', '为您', '分析']
        for (const chunk of contentChunks) {
          message = combileDeltaData(message, { content: chunk })
        }
        expect(message.content).toBe('根据查询结果，我为您分析')

        // Tool calls delta data with partial arguments
        message = combileDeltaData(message, {
          tool_calls: [
            {
              index: 0,
              id: 'call_00_IoFU0vIpdn9Xn6WPHpW2Fwqr',
              type: 'function',
              function: { name: 'get-current-date', arguments: '' },
            },
          ],
        })

        message = combileDeltaData(message, {
          tool_calls: [
            {
              index: 0,
              function: { arguments: '{}' },
            },
          ],
        })

        expect(message.tool_calls).toEqual([
          {
            index: 0,
            id: 'call_00_IoFU0vIpdn9Xn6WPHpW2Fwqr',
            type: 'function',
            function: { name: 'get-current-date', arguments: '{}' },
          },
        ])
      })
    })

    describe('Edge Cases', () => {
      it('should handle special values and mixed data types', () => {
        const testCases = [
          { target: { data: null }, source: { data: 'new value' } },
          { target: { data: undefined }, source: { data: 'new value' } },
          { target: { data: NaN }, source: { data: 'new value' } },
        ]

        testCases.forEach(({ target, source }) => {
          const result = combileDeltaData(target, source)
          expect(result.data).toBe('new value')
        })

        // Test mixed data types
        const target = {
          string: 'Hello',
          number: 42,
          array: [1, 2, 3],
        }
        const source = {
          string: ' World',
          boolean: true,
          array: [4, 5, 6],
        }

        const result = combileDeltaData(target, source)
        expect(result).toEqual({
          string: 'Hello World',
          number: 42,
          array: [1, 2, 3, 4, 5, 6], // Regular arrays are concatenated
          boolean: true,
        })
      })

      it('should handle deeply nested objects and performance', () => {
        const target = {
          level1: {
            level2: {
              level3: { value: 'original' },
            },
          },
        }
        const source = {
          level1: {
            level2: {
              level3: { newValue: 'added' },
            },
          },
        }

        const result = combileDeltaData(target, source)
        expect(result).toEqual({
          level1: {
            level2: {
              level3: {
                value: 'original',
                newValue: 'added',
              },
            },
          },
        })

        // Performance test with large arrays
        const targetLarge = {
          choices: Array.from({ length: 1000 }, (_, i) => ({
            index: i,
            delta: { content: `Item ${i}` },
          })),
        }
        const sourceLarge = {
          choices: [{ index: 500, delta: { content: 'Updated' } }],
        }

        const start = Date.now()
        const resultLarge = combileDeltaData(targetLarge, sourceLarge)
        const end = Date.now()

        expect(resultLarge.choices[500].delta.content).toBe('Item 500Updated')
        expect(end - start).toBeLessThan(1000) // Should complete within 1 second
      })
    })
  })
})
