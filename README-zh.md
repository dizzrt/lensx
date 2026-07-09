# lensX

lensX 是一个基于 Rust、Tauri 2、Vue 3、TypeScript 和 Rsbuild 构建的轻量级桌面效率启动器。

项目关注快速全局呼出、低常驻资源占用、键盘优先交互，以及面向本地命令和未来扩展点的清晰基础。

本文档与英文 `README.md` 必须保持内容一致。当项目定位、启动命令、当前状态或文档入口发生变化时，需要同步更新两份 README。

## 当前状态

项目处于早期初始化阶段，目前包含：

- Tauri 桌面壳；
- 为紧凑启动器界面配置的无边框主窗口；
- 托盘菜单设置；
- 全局快捷键设置；
- 基础 Vue 输入界面。

命令注册、搜索索引、扩展运行时、同步等更大的产品能力，只有在代码中已经实现后，才能作为已交付能力写入文档。

## 技术栈

- 桌面运行时：Tauri 2
- 系统层：Rust
- 前端：Vue 3 和 TypeScript
- 构建工具：Rsbuild / Rspack
- UI：Naive UI
- 样式：UnoCSS、Less 和 PostCSS
- 包管理器：pnpm
- 格式化与 lint：Biome
- Python 环境管理：uv
- 规格流程：OpenSpec

## 启动方式

安装依赖：

```bash
pnpm install
```

启动开发服务：

```bash
pnpm run dev
```

构建前端：

```bash
pnpm run build
```

预览生产构建：

```bash
pnpm run preview
```

## 项目结构

- `src/`：Vue 前端源码。
- `src-tauri/`：Rust 与 Tauri 桌面壳。
- `public/`：前端静态资源。
- `static/`：项目静态资源。
- `openspec/`：OpenSpec 配置、规格与变更。
- `docs/`：英文与中文镜像项目文档。
- `tmp/`：临时本地参考资料。它不是稳定信息源，正式文档和 OpenSpec 产物不得引用其中的文件或路径。

## 文档入口

- `README.md`：英文开发者入口。
- `README-zh.md`：内容一致的中文开发者入口。
- `AGENTS.md`：Agent 操作指南。
- `docs/index.md`：文档地图。
- `openspec/config.yaml`：OpenSpec 生成上下文和产物规则。

## 开发约束

- Rust 侧负责系统集成、性能敏感工作、持久化和稳定 Tauri command 边界。
- Vue 侧负责界面展示、交互状态和视图组合。
- 重要行为变更、架构变更和稳定需求变更应使用 OpenSpec。
- Python 脚本和依赖操作必须通过 `uv` 执行，例如 `uv run ...` 和 `uv add ...`。
- 不要把规划中的能力写成已实现行为。
