<script setup lang="ts">
import { computed } from 'vue'
import { useMarkdown } from '../composables/useMarkdown'
import type { BubbleProps } from './Bubble.type'
import ToolCall from './ToolCall.vue'

const props = withDefaults(defineProps<BubbleProps>(), {
  align: 'left',
})

// Use markdown rendering
const { renderedMarkdown } = useMarkdown(computed(() => props.content))

// Format Unix timestamp for display
const formatUnixTime = (timestamp: number) => {
  const date = new Date(timestamp * 1000)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
</script>

<template>
  <div v-show="!hidden" :class="['message', `message-${role}`, `message-align-${align}`]">
    <div class="message-header">
      <span class="message-role">
        {{ role === 'tool' ? `🔧 tool` : role }}
      </span>
      <span class="message-time" v-if="metadata?.createdAt">
        {{ formatUnixTime(metadata.createdAt) }}
      </span>
    </div>
    <div>
      <div v-if="role === 'assistant'" class="markdown-content" v-html="renderedMarkdown"></div>
      <div v-else class="content">
        {{ content }}
      </div>
      <!-- Render tool calls if they exist -->
      <ToolCall v-if="tool_calls && tool_calls.length > 0" :toolCalls="tool_calls" />
    </div>
  </div>
</template>

<style lang="less" scoped>
.message {
  margin-bottom: 12px;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid #eee;
}

/* Role-based background colors */
.message-user {
  background-color: #e3f2fd;
}

.message-assistant {
  background-color: #f3e5f5;
}

.message-tool {
  background-color: #f0f8ff;
  border-left: 4px solid #007bff;
}

/* Align-based positioning */
.message-align-left {
  margin-right: 20%;
}

.message-align-right {
  margin-left: 20%;
}

.message-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 12px;
  color: #666;
}

.message-role {
  font-weight: 600;
  text-transform: uppercase;
}

.message-time {
  font-size: 11px;
  opacity: 0.7;
}

.content {
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
}

:deep(.markdown-content) {
  font-size: 14px;
  line-height: 1.5;

  & > *:first-child {
    margin-top: 0;
  }

  & > *:last-child {
    margin-bottom: 0;
  }

  // Paragraphs
  p {
    margin: 8px 0;
  }

  // Lists
  ul,
  ol {
    margin: 8px 0;
    padding-left: 20px;
  }

  li {
    margin: 4px 0;
  }

  // Code blocks
  pre {
    background-color: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 12px;
    margin: 8px 0;
    overflow-x: auto;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 13px;
    line-height: 1.4;
  }

  // Inline code
  code {
    background-color: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 3px;
    padding: 2px 4px;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 13px;
  }

  // Links
  a {
    color: #007bff;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  // Blockquotes
  blockquote {
    margin: 8px 0;
    padding-left: 16px;
    border-left: 4px solid #ddd;
    color: #666;
    font-style: italic;
  }

  // Horizontal rule
  hr {
    border: none;
    border-top: 1px solid #ddd;
    margin: 16px 0;
  }

  // Strong and emphasis
  strong {
    font-weight: 600;
  }

  em {
    font-style: italic;
  }
}
</style>
