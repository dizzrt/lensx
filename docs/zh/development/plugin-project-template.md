# 插件项目模板

## 用途与模板选择

仓库将两个可运行的插件起步项目作为 pnpm 直接 workspace member 维护。它们是项目自有的 canonical
source，并用于 `@lensx/plugin-cli` 中对应的 `lensx-plugin create` 模板：

- `examples/plugins/framework-neutral` 使用 TypeScript 和浏览器 DOM API。插件不需要 React 或
  Semi Design 时，应选择这个最小模板。
- `examples/plugins/react-semi` 在自己的 Child WebView document 中持有 React、React DOM、Semi Design
  和 `@lensx/plugin-ui`。需要组件化 UI、共享插件语义 token 与 Semi 控件时，应选择它。

两个模板与外部插件使用相同的公共 Contract 和 SDK 边界。它们位于 workspace 中只会改变本地
依赖 linking，不会获得官方来源身份、Host 信任、Tauri 访问权、权限或私有 import。

## 项目结构

每个模板都包含 `package.json`、`manifest.json`、`index.html`、Rsbuild/Rstest 配置、`src/`、
`tests/` 和 package-local metadata check。普通构建会在 `dist/` 下生成自包含插件 document：

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
@lensx/plugin-sdk/webview
@lensx/plugin-testkit        # 仅测试
@lensx/plugin-ui             # 仅 React 模板
@lensx/plugin-ui/styles.css  # 仅 React 模板
```

插件不得 import `src/app/**`、`src-tauri/**`、`tools/**`、Tauri API、package source directory 或
未声明的 deep path。CLI 的 package-format modules 同样属于 internal，不是插件 Runtime API。项目可在
authoring workflow 中调用 `lensx-plugin` bin，但不得从 `src/**` import `@lensx/plugin-cli`。

## Manifest、Page 与 Action

每个模板都有独立 plugin ID，以及包含一个 WebView Runtime entry、一个 Page 和一个指向该 Page 的
Action 的 Contract-valid Manifest `0.4.0`。两者都不请求权限。Host 会把 Action 投影到共享 Launcher
Action Registry；激活 Action 会打开已投影 Page。随后 Host 会解析当前 registration entry 和
resource generation。React 只使用该安全 identity 请求一个 native Child WebView presentation，native
code 会独立解析 current document target。

canonical 模板及其 CLI 打包快照使用以下目的地名称作为入口 Action 的 `title`：

| 模板 | `en-US` | `zh-CN` |
| --- | --- | --- |
| `framework-neutral` | `Framework-neutral starter` | `无框架起步模板` |
| `react-semi` | `React and Semi starter` | `React 与 Semi 起步模板` |

既有 Action/Page ID、target、默认入口和功能关键词保持不变，不添加旧完整标题或打开前缀
兼容关键词。调整起步模板时遵循统一的
[Action 命名指南](../plugin-development/public-packages.md#action-display-names)：
多个入口使用可区分的目的地名称，真正的操作保留有意义的动词。

template Page 省略 `presentation`，因此规范化为固定 `650×600`。作者可为 Page 声明有界
初始逻辑尺寸并允许用户调整：

```json
"presentation": {
  "initial_size": { "width": 800, "height": 600 },
  "resizable": true
}
```

这是声明式元数据，不是 Runtime resize API。Host 会按当前 work area 拟合；hide/restore 保留
当前 same-attempt size，真实 close/reopen 则重置为声明的初始尺寸。第一版不持久化用户尺寸。

调整模板时，应保持 Page/Action ID 一致、确保 Action target 有效，并在 `dist/` 中包含每项 Manifest
resource。增加权限属于独立的产品与安全决策；这些起步模板不是权限教程。

## Runtime 生命周期

插件使用 `createPluginWebviewTransport()` 创建显式 SDK client。初始化从 loading 状态开始，只有在
Host 安装的 closed bridge handshake 和 `runtime.get_context` response 完成后才进入 ready。context-change
event 会替换完整 locale/theme/capability snapshot。

初始化失败或断开会产生有界 error。retry 必须由用户显式触发，并创建全新的 transport 与 SDK client；
被替换 attempt 的迟到回调会被忽略。close、retry、unmount 和 document teardown 共用一条幂等 cleanup
路径。React 模板把当前 context 传给 `PluginUiProvider`；framework-neutral 模板则直接把 locale/theme
应用到自己的 document。

## 命令

使用以下命令创建独立项目；该过程不访问网络、不安装依赖、不初始化 Git，也不执行项目代码：

```bash
lensx-plugin create ./my-plugin \
  --template framework-neutral \
  --plugin-id com.example.my-plugin \
  --name "My Plugin"
```

React/Semi 起步项目使用 `react-semi`。生成项目声明 `pnpm@11`、普通公共 dependency range，以及与
canonical example 相同的 lifecycle scripts。对任一模板，上述示例都会把两种语言的 Action 标题
设为 `My Plugin`。`create` 原样使用通过校验的 `--name`：`Open Studio` 仍为 `Open Studio`，
不添加或删除打开词语，也不生成旧标题关键词。构建、验证、打包与 inspection 详见
[Plugin Developer CLI](plugin-developer-cli.md)。

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
```

使用以下命令运行模板边界的完整维护门禁：

```bash
pnpm run gate -- plugin-project-template
```

## 隔离与打包验证

聚合门禁先运行 member checks，再把两个模板复制到系统临时 consumer。它会打包真实 Contract、SDK、
Testkit 与 UI package，使用 consumer 自有 overrides，从机器配置的全局 pnpm store 离线且不运行
lifecycle scripts 地安装依赖，并审计 resolved links、源码 imports、bundle module graph 和输出文件。

package gate 会用 CLI-internal canonical packer 对每个 `dist/` 打包两次，验证 byte
reproducibility、checksum coverage 和一致的 TypeScript/Rust inspection facts，再让受控 Rust installer
preparation boundary 消费相同的临时 `.lxp` bytes。缺失 resource、非法 target、non-canonical bytes、
权限与 Host-owned facts 等负例都会在 Runtime 启动前停止。

production-component smoke 会让打包后的 Manifest 依次经过当前 Registration、Page/Action projection、
resource resolution、Runtime resolver、公共 WebView transport、closed Child WebView bridge 与 Host dispatcher。
它不是完整桌面 GUI E2E。Rstest 会另外检查英语/简体中文、light/dark semantic token、长文本、
焦点、loading、error、ready、retry、keyboard 与 accessibility 行为。

## 当前限制

公共 CLI 与 `create` 命令已可从 workspace build 和真实 package tarball 使用，但本仓库尚未将其发布到 npm。
Development Mode、watch/reload、插件安装、权限授予、签名/provenance 与远程发布仍是独立能力。生成模板与
CLI validation 不会替代 Host 独立的 native package 和 source 检查。

## 激活协议迁移

两类 canonical template 和 CLI 快照均使用 Contract `0.4.0`、SDK `0.5.0` 与
Host API `>=0.4.0 <0.5.0`，Manifest 保持 `0.4.0`。
Runtime factory 在初始化前接受可选快捷键回调，并随 SDK dispose 清理。
默认入口省略回调，重复激活保留业务状态。已有插件必须升级依赖和范围后重新打包；
回调可选不代表旧 SDK 兼容。参见[公共回调契约](../plugin-development/public-packages.md#可选快捷键回调)。
