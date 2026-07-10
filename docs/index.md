# Documentation Index / 文档索引

This directory contains stable project documentation for lensX. English and
Simplified Chinese documents are maintained as fully mirrored trees.

本目录承接 lensX 的稳定项目文档。英文与中文文档树必须保持完全镜像。

## Entry Points / 入口

`docs/index.md` is the single documentation router. Do not add placeholder
`index.md` files under category directories. Category directories should contain
actual topic documents only.

`docs/index.md` 是唯一文档路由入口。不要在分类目录下新增占位 `index.md` 文件；
分类目录只放实际主题文档。

| Category | English Path | 中文路径 | Purpose / 用途 |
| --- | --- | --- | --- |
| Architecture / 架构 | `docs/en/architecture/` | `docs/zh/architecture/` | Long-lived architecture, layering, module boundaries, desktop runtime constraints. / 长期架构、分层、模块边界、桌面运行时约束。 |
| Plugins / 插件 | `docs/en/plugins/` | `docs/zh/plugins/` | Plugin contract, runtime boundaries, SDK usage, package format, permissions, and Host API rules. / 插件契约、运行时边界、SDK 使用、包格式、权限和 Host API 规则。 |
| Workflow / 流程 | `docs/en/workflow/` | `docs/zh/workflow/` | Development workflow, OpenSpec workflow, validation, documentation maintenance. / 开发流程、OpenSpec 流程、验证、文档维护。 |
| Decisions / 决策 | `docs/en/decisions/` | `docs/zh/decisions/` | Durable decisions, trade-offs, and long-lived constraints. / 长期决策、取舍和稳定约束。 |

## Current Documents / 当前文档

Current mirrored topic documents:

- Plugin architecture: `docs/en/plugins/architecture.md` / `docs/zh/plugins/architecture.md`
- Plugin development: `docs/en/plugins/development.md` / `docs/zh/plugins/development.md`

当前镜像主题文档：

- 插件架构：`docs/en/plugins/architecture.md` / `docs/zh/plugins/architecture.md`
- 插件开发：`docs/en/plugins/development.md` / `docs/zh/plugins/development.md`

## Document Roles / 文档分工

- `README.md`: English developer entry.
- `README-zh.md`: Simplified Chinese developer entry with matching content.
- `AGENTS.md`: root agent operating guide.
- `docs/AGENTS.md`: documentation maintenance guide for agents.
- `docs/index.md`: the only documentation entry index.
- `docs/en/`: English stable documentation.
- `docs/zh/`: Simplified Chinese stable documentation.
- `openspec/specs/`: stable capability specifications.
- `openspec/changes/`: proposed or in-progress changes.

## Mirror Rule / 镜像规则

Every Markdown document under `docs/en/` must have a matching Simplified Chinese
document under `docs/zh/` with the same relative path, and every Markdown
document under `docs/zh/` must have a matching English document under `docs/en/`
with the same relative path.

`docs/index.md` is the single documentation entry index. Do not create
`docs/en/index.md`, `docs/zh/index.md`, or placeholder category index files such
as `docs/en/architecture/index.md` and `docs/zh/architecture/index.md` unless the
documentation structure changes through an explicit project decision.

`docs/en/` 与 `docs/zh/` 下的 Markdown 文件必须按相同相对路径一一对应。

`docs/index.md` 是唯一文档入口索引。除非项目明确决定改变文档结构，否则不要创建
`docs/en/index.md`、`docs/zh/index.md`，也不要创建类似
`docs/en/architecture/index.md` 和 `docs/zh/architecture/index.md` 的分类占位索引。

## Reading Guidance / 查阅建议

1. Start with the root `README.md` or `README-zh.md` for project positioning,
   setup commands, and current status.
2. Read architecture documents when working on code structure, Rust/Tauri/Vue
   boundaries, module ownership, or data flow.
3. Read workflow documents when working on OpenSpec, documentation maintenance,
   validation, or collaboration rules.
4. Read decision records when you need to understand why a durable approach was
   chosen.
5. Check `openspec/specs/` and `openspec/changes/` before changing behavior or
   stable requirements.

## Temporary Material / 临时资料

`tmp/` may contain local reference material for agents, but it is not a stable
project source. Committed documentation and OpenSpec artifacts must not cite
`tmp/` file names, paths, or temporary document identities. Restate useful
information as project-owned requirements, constraints, or decisions.

`tmp/` 可以存放供 Agent 理解上下文的临时资料，但它不是稳定项目来源。正式文档和
OpenSpec 产物不得引用 `tmp/` 中的文件名、路径或临时文档身份；有价值的信息应转述为项目自有的需求、约束或决策。
