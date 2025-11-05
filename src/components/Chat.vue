<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useMcpClient } from '../composables/useMcpClient'
import { useMessage } from '../composables/useMessage'
import { lengthPlugin, toolPlugin } from '../plugins'
import type { Tool } from '../types'
import { simulateToolCallGenerator } from '../utils/mock'
import Bubble from './Bubble.vue'

// Use MCP client composable
const { status: mcpStatus, listTools, connect } = useMcpClient()

// Use the message composable
const { messages, requestState, processingState, isProcessing, sendMessage, abortRequest } = useMessage({
  initialMessages: [{ role: 'system', content: 'You are a helpful assistant.' }],
  plugins: [
    toolPlugin({
      getTools: () => {
        return getTools()
      },
      callTool: (toolCall, { abortSignal }) => {
        // const args = JSON.parse(toolCall.function.arguments)
        // const result = await callTool(toolCall.function.name, args)
        // return JSON.stringify(Array.isArray(result.content) ? result.content[0] : result.content)

        const args = JSON.parse(toolCall.function.arguments) as { a: number; b: number }
        // 返回生成器以模拟流式工具调用，传入 abortSignal 以支持终止
        return simulateToolCallGenerator(toolCall.function.name, args, abortSignal)
      },
    }),
    lengthPlugin(),
  ],
})

const inputValue = ref('')

// Computed properties for UI state
const canSend = computed(() => !isProcessing.value && inputValue.value.trim())

// Auto-scroll to bottom when new messages arrive
const scrollToBottom = () => {
  nextTick(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  })
}

// Watch for new messages and scroll to bottom
watch(
  messages,
  () => {
    scrollToBottom()
  },
  { deep: true },
)

// Handle Enter key press
const handleKeyPress = (event: KeyboardEvent) => {
  // 正在进行输入法合成时不响应回车
  if (event.isComposing) return

  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSendMessage()
  }
}

// Clear input after sending
const clearInput = () => {
  inputValue.value = ''
}

const handleSendMessage = () => {
  const inputMessage = inputValue.value
  clearInput()
  sendMessage(inputMessage)
}

const getTools = async () => {
  if (mcpStatus.value !== 'connected') {
    await connect()
  }

  const tools = (await listTools()).map((tool) => {
    const { inputSchema: parameters, ...rest } = tool
    return {
      type: 'function',
      function: {
        ...rest,
        parameters,
      },
    }
  })

  return tools as Tool[]
}

// Handle list tools button click
const handleListTools = async () => {
  try {
    const tools = await getTools()
    console.log('tools', tools)
  } catch (error: any) {
    console.error('Failed to list tools:', error)
  }
}
</script>

<template>
  <div class="chat-container">
    <div class="chat-interface">
      <!-- Chat Messages Area -->
      <div class="messages-container">
        <div v-if="messages.length === 0" class="empty-state">
          <p>Start a conversation by typing a message below</p>
        </div>
        <Bubble
          v-for="(message, index) in messages"
          :key="index"
          :role="message.role"
          :content="message.content"
          :hidden="message.role === 'system'"
          :metadata="message.metadata"
          :tool_calls="message.tool_calls"
          :align="message.role === 'user' ? 'right' : 'left'"
        />
      </div>

      <div style="height: 142.5px"></div>

      <div class="bottom-container">
        <!-- Input Section -->
        <div class="input-section">
          <textarea
            v-model="inputValue"
            @keydown="handleKeyPress"
            placeholder="Type your message here..."
            :disabled="isProcessing"
            class="message-input"
          ></textarea>
          <div class="button-group">
            <button @click="handleListTools" :class="['list-tools-button', { disabled: mcpStatus !== 'connected' }]">
              List Tools
            </button>
            <button @click="handleSendMessage" :disabled="!canSend" :class="['send-button', { disabled: !canSend }]">
              Send
            </button>
            <button
              @click="abortRequest"
              :disabled="!isProcessing"
              :class="['cancel-button', { disabled: !isProcessing }]"
            >
              Cancel
            </button>
          </div>
        </div>

        <!-- Status Indicator -->
        <div class="status-indicator">
          <span :class="`status-${requestState === 'processing' ? processingState : requestState}`">{{
            requestState === 'processing' ? processingState : requestState
          }}</span>
        </div>

        <div class="gradient"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-container {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
}

.chat-interface {
  background: #f5f5f5;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  margin: 20px 0;
  padding: 15px;
  background: white;
  border-radius: 6px;
  border: 1px solid #ddd;
  height: 60vh;
  min-height: 60vh;
}

.empty-state {
  text-align: center;
  color: #666;
  padding: 40px 20px;
  font-style: italic;
}

.bottom-container {
  background-color: var(--bg-color);
  position: fixed;
  bottom: 0;
  width: 800px;

  .gradient {
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    height: 20px;
    background: var(--bg-color);
    mask: linear-gradient(to bottom, transparent, black);
    pointer-events: none;
  }
}

.input-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.button-group {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.message-input {
  min-height: 60px;
  max-height: 120px;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  resize: vertical;
  font-size: 14px;
}

.message-input:focus {
  outline: none;
  border-color: #007bff;
}

.message-input:disabled {
  background-color: #f8f9fa;
  cursor: not-allowed;
}

.send-button,
.cancel-button,
.list-tools-button {
  padding: 12px 24px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}

.send-button {
  background-color: #007bff;
  color: white;
}

.send-button:hover:not(:disabled) {
  background-color: #0056b3;
}

.list-tools-button {
  background-color: #28a745;
  color: white;
}

.list-tools-button:hover:not(:disabled) {
  background-color: #218838;
}

.cancel-button {
  background-color: #dc3545;
  color: white;
}

.cancel-button:hover:not(:disabled) {
  background-color: #c82333;
}

.send-button:disabled,
.cancel-button:disabled,
.list-tools-button:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
  opacity: 0.6;
}

.status-indicator {
  margin: 10px 0;
  text-align: center;
}

.status-indicator span {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
}

/* 请求中 - 黄色/橙色系 */
.status-requesting {
  background-color: #fff4e6;
  color: #b45309;
}

/* 流式传输中 - 蓝色系 */
.status-streaming {
  background-color: #dbeafe;
  color: #1e40af;
}

/* 工具调用中 - 紫色系 */
.status-calling-tools {
  background-color: #f3e8ff;
  color: #6b21a8;
}

/* 已完成 - 绿色系 */
.status-completed {
  background-color: #d1fae5;
  color: #065f46;
}

/* 已中止/错误 - 红色系 */
.status-aborted,
.status-error {
  background-color: #fee2e2;
  color: #991b1b;
}
</style>
