import type { MessageMetadata, ToolCall } from '../types'



export interface BubbleProps {
  role: string
  content: string
  metadata?: MessageMetadata
  tool_calls?: ToolCall[]
  hidden?: boolean
  align?: 'left' | 'right'
}
