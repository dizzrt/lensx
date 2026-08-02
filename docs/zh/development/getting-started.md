# 开发入门

## 环境要求

- Node.js `>=24 <25`
- pnpm `>=11 <12`
- 当前版本的 Rust 工具链
- Tauri 2 对当前平台要求的系统依赖

确认 JavaScript 工具链：

```bash
node --version
pnpm --version
```

确认 Rust 工具链：

```bash
rustc --version
cargo --version
```

## 安装

```bash
pnpm install
```

仓库使用 `package.json` 中声明的包管理器版本。不要使用其他包管理器生成 lockfile 变更。

## 开发模式

启动前端开发服务器：

```bash
pnpm run dev
```

配置的开发服务器监听 `40755` 端口。

启动带有前端开发服务器的桌面应用：

```bash
pnpm exec tauri dev
```

预览前端生产构建：

```bash
pnpm run build
pnpm run preview
```

构建桌面安装包：

```bash
pnpm exec tauri build
```

## 仓库目录

- `src/` — React 和 TypeScript 前端源码。
- `tests/` — 前端和 DOM 相关测试。
- `src-tauri/` — Rust 与 Tauri 桌面源码和配置。
- `packages/*` — 包含 package manifest 时纳入 workspace 的公共 package。
- `plugins/official/*` — 存在时纳入 workspace 的官方插件 package。
- `examples/plugins/*` — 存在时纳入 workspace 的示例插件 package。
- `public/` 与 `static/` — 前端资源和 HTML 输入。
- `docs/en/` — 规范英文实现与架构文档。
- `docs/zh/` — 与之对应的简体中文文档。
- `openspec/specs/` — 稳定能力需求（存在时）。
- `openspec/changes/` — 提议中和进行中的变更。

根应用仍是 private workspace package。在受支持的成员位置新增 package 前，请阅读
[插件 Workspace](plugin-workspace.md)。

## 第一次贡献

1. 阅读 `AGENTS.md`。
2. 从 `docs/en/index.md` 开始。
3. 检查相关稳定 spec 和活动 change。
4. 确认当前代码路径和已有测试。
5. 在实现重要行为、架构或契约变更前使用 OpenSpec。
6. 随实现一起更新测试和两个语言版本的文档。
7. 执行 `validation.md` 中描述的必需验证。

## 环境问题排查

如果已经安装的可执行文件无法从 `PATH` 找到，在重试前加载交互式 shell 配置：

```bash
source ~/.zshrc
```

不要用机器特有的假设替代已经声明的 Node、pnpm 或 Rust 工具链要求。
