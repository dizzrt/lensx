## Why

当前全局快捷键实现只服务于一个写死的唤起动作，能验证基础体验，但不适合作为后续多个快捷键、自定义快捷键、冲突检测和动态重载的底座。现在先在 Rust 侧建立清晰的快捷键管理边界，可以在不急于开发 Vue 设置页的前提下，降低后续扩展成本。

## What Changes

- 引入 Rust 侧快捷键管理能力，将快捷键绑定建模为默认配置、注册表和动作路由，而不是在回调中直接写死窗口操作。
- 将现有 `Ctrl+Shift+Space` 作为默认全局快捷键绑定，映射到启动器窗口激活动作。
- 建立启动器窗口动作：显示、隐藏、切换显示状态，并在显示时尽量恢复、聚焦主窗口。
- 支持注册、注销、重新注册快捷键绑定的内部接口，为后续用户自定义快捷键和设置页接入预留稳定边界。
- 保持 Vue 侧设置页不在本次范围内；本次只允许增加最小必要的 Tauri 命令或 Rust API 边界，不实现前端配置 UI。
- 不引入命令注册表、插件快捷键、搜索索引或开机自启动能力。

## Capabilities

### New Capabilities

- `desktop-shortcuts`: 定义桌面全局快捷键的默认绑定、动作路由、注册生命周期、窗口激活行为和后续自定义快捷键所需的 Rust 侧基础能力。

### Modified Capabilities

- `launcher-panel`: 启动器面板需要支持由桌面快捷键动作可靠显示、隐藏和切换，但不改变面板内容、布局或前端交互要求。

## Impact

- Rust/Tauri desktop behavior:
  - `src-tauri/src/shortcut.rs`
  - `src-tauri/src/lib.rs`
  - 可能新增 Rust 模块承载快捷键模型、注册管理和窗口动作。
- Tauri permissions:
  - 继续使用已有 `tauri-plugin-global-shortcut` 能力和 capability 权限；如新增前端可调用命令，需要保持 payload 字段为 `snake_case`。
- Frontend UI:
  - 本次不实现 Vue 设置页，不新增用户可见文案，不触碰 Naive UI、UnoCSS、Less 或 i18n 资源。
- Validation:
  - Rust/Tauri 编译检查。
  - 前端构建仅在触碰前端或 Tauri 构建链路需要时运行。
