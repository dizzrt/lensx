## MODIFIED Requirements

### Requirement: ConfigLens MUST be a normal public-boundary official plugin

系统 MUST 在 `en-US` 和 `zh-CN` 中提供产品名 `ConfigLens`，其独立 package 为 `@lensx/official-config-lens`、规范化源码位置为 `plugins/config-lens`、plugin identity 为 `dev.lensx.config-lens`。其 Manifest MUST 使用 Contract `0.3.0`，贡献恰好一个 WebView Page 和一个指向该 Page 的 Launcher Action，并且不请求 Host permission 或 unpublished native capability。插件 MUST 只消费 public plugin package exports 和 ordinary browser dependencies；Host MUST NOT 导入其源码，也 MUST NOT 根据其官方 repository location 授予 authority。

#### Scenario: User opens ConfigLens from the Launcher

- **WHEN** installed ConfigLens Action 被发现并激活
- **THEN** Host 通过 ordinary Registration、Resource、isolated Child WebView Runtime 和 Session path 打开其 contributed Page
- **THEN** Host Page chrome 在当前 supported locale 中显示 `ConfigLens` brand，而 plugin work area 不重复 visible main title/subtitle
- **THEN** Child WebView 保留 accessible work-area name，但不获得 Tauri、Host DOM、filesystem、native clipboard 或另一个插件的 state

#### Scenario: Official source attempts to bypass the public boundary

- **WHEN** `plugins/config-lens` 声明或导入 Host-private source、Tauri、unpublished Host API、workspace-only deep path 或另一个插件源码
- **THEN** workspace 和 official release boundary validation MUST 拒绝该 member
- **THEN** 不得添加 official-only import、Runtime、CSP、permission 或 installation exception

#### Scenario: Legacy nested path remains

- **WHEN** ConfigLens 源码仍位于旧的 `plugins/official/config-lens`
- **THEN** workspace、official release 和 focused ConfigLens gates MUST 报告 path drift
- **THEN** 系统不得同时接受旧路径和 `plugins/config-lens` 作为两个产品 members
