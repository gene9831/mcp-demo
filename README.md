# MCP Demo

## 开发环境启动

### 安装依赖

```bash
pnpm install
```

### 环境变量配置

> ⚠️ **重要**：启动前必须配置环境变量

在项目根目录创建 `.env` 文件，配置以下环境变量：

```env
# DeepSeek API Key（必需）
VITE_API_KEY=your_deepseek_api_key_here
```

**说明**：

- `VITE_API_KEY`：DeepSeek API 密钥，用于调用聊天接口（必需）

### 启动开发服务器

同时启动 UI 开发服务器和 MCP 服务器：

```bash
pnpm dev
```

这将启动两个服务：

- **UI 服务**：运行在 `http://localhost:5174`
- **MCP 服务**：运行在 `http://localhost:3001`

### 单独启动服务

如果只需要启动 UI 开发服务器：

```bash
pnpm dev:ui
```

如果只需要启动 MCP 服务器：

```bash
pnpm mcp:dev
```

## 其他命令

- `pnpm build` - 构建生产版本
- `pnpm preview` - 预览生产构建
- `pnpm test` - 运行测试
- `pnpm test:ui` - 运行测试 UI
