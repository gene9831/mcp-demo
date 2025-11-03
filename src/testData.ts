import type { Message } from './types'

export const testdata: Message[] = [
  { role: 'system', content: '你是一个数学老师，擅长计算和解答数学问题。' },
  {
    role: 'user',
    content: '帮我同时计算两个算式\n1. 4+4\n2. 4x4',
    metadata: { createdAt: 1761556699, updatedAt: 1761556699 },
  },
  {
    role: 'assistant',
    content: '我来帮您同时计算这两个算式。',
    metadata: { createdAt: 1761556700, updatedAt: 1761556702 },
    tool_calls: [
      {
        index: 0,
        id: 'call_00_wy0r2VgGNvzUp1tIfCfSnGPO',
        type: 'function',
        function: { name: 'add', arguments: '{"a": 4, "b": 4}' },
      },
      {
        index: 1,
        id: 'call_01_ZaQqGi3jCXr1iJ308Yu1hJkj',
        type: 'function',
        function: { name: 'multiply', arguments: '{"a": 4, "b": 4}' },
      },
    ],
  },
  {
    role: 'tool',
    tool_call_id: 'call_00_wy0r2VgGNvzUp1tIfCfSnGPO',
    content: '{"type":"text","text":"8"}',
    metadata: { createdAt: 1761556702, updatedAt: 1761556703 },
  },
  {
    role: 'tool',
    tool_call_id: 'call_01_ZaQqGi3jCXr1iJ308Yu1hJkj',
    content: '{"type":"text","text":"16"}',
    metadata: { createdAt: 1761556702, updatedAt: 1761556703 },
  },
  {
    role: 'assistant',
    content: '计算结果如下：\n\n1. 4 + 4 = 8\n2. 4 × 4 = 16\n\n两个算式的结果分别是 8 和 16。',
    metadata: { createdAt: 1761556703, updatedAt: 1761556705 },
  },
]

export const testdata2: Message[] = [
  {
    role: 'user',
    content: '帮我同时计算两个算式\n1: 4+4\n2: 4x4',
    metadata: { createdAt: 1761556699, updatedAt: 1761556699 },
  },
  {
    role: 'assistant',
    content: '我来帮您同时计算这两个算式。',
    metadata: { createdAt: 1761556700, updatedAt: 1761556702 },
    tool_calls: [
      {
        index: 0,
        id: 'call_00_wy0r2VgGNvzUp1tIfCfSnGPO',
        type: 'function',
        function: { name: 'add', arguments: '{"a": 4, "b": 4}', result: '{"type":"text","text":"8"}' },
      },
      {
        index: 1,
        id: 'call_01_ZaQqGi3jCXr1iJ308Yu1hJkj',
        type: 'function',
        function: { name: 'multiply', arguments: '{"a": 4, "b": 4}', result: '{"type":"text","text":"16"}' },
      },
    ],
  },
  {
    role: 'tool',
    tool_call_id: 'call_00_wy0r2VgGNvzUp1tIfCfSnGPO',
    content: '{"type":"text","text":"8"}',
    metadata: { createdAt: 1761556702, updatedAt: 1761556703 },
  },
  {
    role: 'tool',
    tool_call_id: 'call_01_ZaQqGi3jCXr1iJ308Yu1hJkj',
    content: '{"type":"text","text":"16"}',
    metadata: { createdAt: 1761556702, updatedAt: 1761556703 },
  },
  {
    role: 'assistant',
    content: '计算结果如下：\n\n1. 4 + 4 = 8\n2. 4 × 4 = 16\n\n两个算式的结果分别是 8 和 16。',
    metadata: { createdAt: 1761556703, updatedAt: 1761556705 },
  },
]
