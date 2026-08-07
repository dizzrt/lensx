# lensX 文档

英文文档是持续维护的项目文档规范来源。本简体中文索引与
[英文索引](../en/index.md)保持相同结构。

## 架构

- [架构概览](architecture/overview.md) — 项目目标、当前基础、系统边界和依赖方向。
- [扩展平台](architecture/extension-platform.md) — 已交付的公共 Contract package，以及
  插件和隔离的架构方向。
- [插件包格式](architecture/plugin-package-format.md) — 已交付的 `.lxp` canonical
  `tar.zst` profile、inspection 边界、limits 和验证方式。

## 开发

- [开发入门](development/getting-started.md) — 环境配置、开发命令和仓库目录说明。
- [插件 Workspace](development/plugin-workspace.md) — Contract package、workspace 成员位置、
  lifecycle scripts、依赖边界和 pack 检查。
- [插件项目模板](development/plugin-project-template.md) — 选择、运行、调整、隔离、打包与验证
  仓库维护的插件起步项目。
- [插件开发者 CLI](development/plugin-developer-cli.md) — 通过公共 CLI 创建、构建、校验、
  打包和检查插件。
- [插件开发模式](development/plugin-development-mode.md) — 在专用 Host 构建中手动注册、
  重新加载与移除未打包的 `dist/`。
- [前端指南](development/frontend-guidelines.md) — React、Semi Design、样式、主题、
  国际化和无障碍规则。
- [项目工作流](development/project-workflow.md) — 事实来源、文档治理、OpenSpec 和
  临时材料规则。
- [验证](development/validation.md) — 前端和 Rust 必需的验证与完成标准。

## 需求

稳定的能力需求位于 `openspec/specs/`，提议中或进行中的工作位于
`openspec/changes/`。已经实现的行为始终必须通过当前源码和测试确认。
