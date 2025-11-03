<script setup lang="ts">
import type { ToolCall } from '../types'

defineProps<{
  toolCalls: ToolCall[]
}>()

// Format tool call arguments as JSON for better readability
const formatToolData = (fn: ToolCall['function']) => {
  const data = { arguments: fn.arguments, result: fn.result }
  try {
    data.arguments = JSON.parse(fn.arguments)
  } catch {}
  try {
    if (fn.result) {
      data.result = JSON.parse(fn.result)
    }
  } catch {}
  return JSON.stringify(data, null, 2)
}
</script>

<template>
  <div class="tool-calls">
    <div v-for="toolCall in toolCalls" :key="toolCall.id" class="tool-call">
      <strong>🔧 {{ toolCall.function.name }}</strong>
      <div class="tool-arguments">
        <code>{{ formatToolData(toolCall.function) }}</code>
      </div>
    </div>
  </div>
</template>

<style lang="less" scoped>
.tool-calls {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #eee;
  font-size: 12px;

  .tool-call {
    background-color: #f8f9fa;
    padding: 8px;
    border-radius: 6px;
    margin-bottom: 6px;
    border-left: 3px solid #007bff;

    strong {
      display: block;
      margin-bottom: 6px;
      color: #007bff;
      font-size: 13px;
    }

    .tool-arguments {
      margin-top: 4px;
    }

    code {
      background-color: #e9ecef;
      padding: 4px 6px;
      border-radius: 3px;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 12px;
      display: block;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 150px;
      overflow-y: auto;
    }
  }
}
</style>
