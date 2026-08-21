# lensX

[English](./README.md)

lensX 是一款轻量级桌面效率启动器，用于通过键盘优先的方式快速访问本地工作流和可扩展工具。

项目目前正在建立应用基础。只有得到当前源码和测试支持的功能，才会被文档描述为已经可用。

## 项目目标

- 从任何位置快速呼出，让常用工作流始终触手可及。
- 保持轻量、响应迅速的桌面运行体验。
- 为本地工具和未来扩展提供清晰、安全的边界。
- 通过持续维护的文档和规格，让开发约定、架构与行为易于查找。

## 环境要求

- Node.js 24
- pnpm 11
- Rust 工具链
- Tauri 2 对当前平台要求的系统依赖

## 快速启动

安装依赖：

```bash
pnpm install
```

启动前端开发服务器：

```bash
pnpm run dev
```

以开发模式启动桌面应用：

```bash
pnpm run app:dev
```

统一启动器会持有前端服务器，把实际本地端口传给 Tauri，并统一清理两个进程。只有需要
独立前端服务器时才使用 `pnpm run dev`。

## 常用命令

```bash
pnpm run test
pnpm run typecheck
pnpm run check
pnpm run build
pnpm run src-tauri:test
pnpm run src-tauri:check
```

## 开始参与开发

1. 阅读[文档索引](docs/zh/index.md)。
2. 使用 AI 编码 Agent 时阅读 [AGENTS.md](AGENTS.md)。
3. 对重要的行为、架构或契约变更使用 OpenSpec 工作流。
4. 每次相关变更都要同步维护测试和两个语言版本的文档。

## 许可证

参见 [LICENSE](LICENSE)。
