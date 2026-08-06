# 插件项目模板

## 用途与模板选择

仓库将两个可运行的插件起步项目作为 pnpm 直接 workspace member 维护。它们是项目自有示例，
不是生成产物，也不是已发布的脚手架命令：

- `examples/plugins/framework-neutral` 使用 TypeScript 和浏览器 DOM API。插件不需要 React 或
  Semi Design 时，应选择这个最小模板。
- `examples/plugins/react-semi` 在自己的 iframe document 中持有 React、React DOM、Semi Design
  和 `@lensx/plugin-ui`。需要组件化 UI、共享插件语义 token 与 Semi 控件时，应选择它。

两个模板与外部插件使用相同的公共 Contract 和 SDK 边界。它们位于 workspace 中只会改变本地
依赖 linking，不会获得官方来源身份、Host 信任、Tauri 访问权、权限或私有 import。

## 项目结构

每个模板都包含 `package.json`、`manifest.json`、`index.html`、Rsbuild/Rstest 配置、`src/`、
`tests/` 和 package-local metadata check。React 模板还包含 `visual/`、已提交的截图基线和
visual verification script。普通构建会在 `dist/` 下生成自包含插件 document：

```text
dist/
  manifest.json
  index.html
  static/css/*
  static/js/*
```

framework-neutral bundle 不包含 React、React DOM、Semi Design 或 Plugin UI Runtime。React bundle
自行持有这四者；Host 不注入 framework global、import map、React Context 或私有 stylesheet。

## 公共依赖

模板 metadata 对 lensX 公共 package 使用普通 `^0.1.0` range，绝不使用 `workspace:`、`file:` 或
`link:` protocol。仓库为本地开发启用 matching-version workspace linking；外部 consumer 会让
相同 range 解析到打包后的公共 tarball。

插件仅可使用已声明的公共 export：

```text
@lensx/plugin-contract
@lensx/plugin-sdk
@lensx/plugin-sdk/iframe
@lensx/plugin-testkit        # 仅测试
@lensx/plugin-ui             # 仅 React 模板
@lensx/plugin-ui/styles.css  # 仅 React 模板
```

插件不得 import `src/app/**`、`src-tauri/**`、`tools/**`、Tauri API、package source directory 或
未声明的 deep path。尤其是 `tools/plugin-package-format` 属于 Host-private validation tool，
不是模板依赖或公共 packaging API。

## Manifest、Page 与 Action

每个模板都有独立 plugin ID，以及包含一个 iframe Runtime entry、一个 Page 和一个指向该 Page 的
Action 的 Contract-valid Manifest。两者都不请求权限。Host 会把 Action 投影到共享 Launcher Action
Registry；激活 Action 会打开已投影 Page。随后 Host 会先解析当前 registration entry 和 resource
generation，再构造隔离的 custom-protocol iframe URL。

调整模板时，应保持 Page/Action ID 一致、确保 Action target 有效，并在 `dist/` 中包含每项 Manifest
resource。增加权限属于独立的产品与安全决策；这些起步模板不是权限教程。

## Runtime 生命周期

插件使用 `createPluginIframeTransport()` 创建显式 SDK client。初始化从 loading 状态开始，只有在
Host 私有 Session handshake 和 `runtime.get_context` response 完成后才进入 ready。context-change
event 会替换完整 locale/theme/capability snapshot。

初始化失败或断开会产生有界 error。retry 必须由用户显式触发，并创建全新的 transport 与 SDK client；
被替换 attempt 的迟到回调会被忽略。close、retry、unmount 和 document teardown 共用一条幂等 cleanup
路径。React 模板把当前 context 传给 `PluginUiProvider`；framework-neutral 模板则直接把 locale/theme
应用到自己的 document。

## 命令

使用模板自己的 package scripts 运行局部验证：

```bash
pnpm --dir examples/plugins/framework-neutral run test
pnpm --dir examples/plugins/framework-neutral run typecheck
pnpm --dir examples/plugins/framework-neutral run build
pnpm --dir examples/plugins/framework-neutral run check

pnpm --dir examples/plugins/react-semi run test
pnpm --dir examples/plugins/react-semi run typecheck
pnpm --dir examples/plugins/react-semi run build
pnpm --dir examples/plugins/react-semi run check
pnpm --dir examples/plugins/react-semi run visual
```

使用以下命令运行模板边界的完整维护门禁：

```bash
pnpm run check:plugin-project-template
```

## 隔离与打包证据

聚合门禁先运行 member checks，再把两个模板复制到系统临时 consumer。它会打包真实 Contract、SDK、
Testkit 与 UI package，使用 consumer 自有 overrides，从机器配置的全局 pnpm store 离线且不运行
lifecycle scripts 地安装依赖，并审计 resolved links、源码 imports、bundle module graph 和输出文件。

仅根级可用的 package gate 会用 Host-private reference packer 对每个 `dist/` 打包两次，验证 byte
reproducibility、checksum coverage 和一致的 TypeScript/Rust inspection facts，再让受控 Rust installer
preparation boundary 消费相同的临时 `.lxp` bytes。缺失 resource、非法 target、non-canonical bytes、
权限与 Host-owned facts 等负例都会在 Runtime 启动前停止。

production-component smoke 会让打包后的 Manifest 依次经过当前 Registration、Page/Action projection、
resource resolution、Runtime resolver、Session、公共 iframe transport、RPC adapter 与 Dispatcher。
它不是完整桌面 GUI E2E。React visual gate 会另外检查英语/简体中文、light/dark、长文本、焦点、语义状态、
公共 token computed styles 和固定视口截图。

## 当前限制

当前没有公共插件 CLI、`create` 命令或 Development Mode。复制仓库维护的模板属于仓库工作流，不是已安装
lensX 功能。模板不会发布 package、提交 `.lxp` 输出、自动安装、授予权限或替代 native desktop acceptance。
未来 CLI 或 Development Mode 工作仍必须保留相同的公共 package 与 Host 安全边界。
