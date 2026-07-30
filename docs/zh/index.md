# lensX 文档

英文文档是持续维护的项目文档规范来源。本简体中文索引与
[英文索引](../en/index.md)保持相同结构。

## 架构

- [架构概览](architecture/overview.md) — 项目目标、当前基础、系统边界和依赖方向。
- [扩展平台](architecture/extension-platform.md) — 启动器 action、插件、隔离和 Host
  契约的架构方向。

## 开发

- [开发入门](development/getting-started.md) — 环境配置、开发命令和仓库目录说明。
- [前端指南](development/frontend-guidelines.md) — React、Semi Design、样式、主题、
  国际化和无障碍规则。
- [项目工作流](development/project-workflow.md) — 事实来源、文档治理、OpenSpec 和
  临时材料规则。
- [验证](development/validation.md) — 前端和 Rust 必需的验证与完成标准。

## 需求

稳定的能力需求位于 `openspec/specs/`，提议中或进行中的工作位于
`openspec/changes/`。已经实现的行为始终必须通过当前源码和测试确认。
