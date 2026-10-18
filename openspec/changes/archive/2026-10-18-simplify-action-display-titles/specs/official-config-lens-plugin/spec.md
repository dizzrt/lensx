# Spec Delta

## MODIFIED Requirements

### Requirement: ConfigLens MUST be a normal public-boundary official plugin

系统 MUST 以 `plugins/config-lens` 为 canonical 源位置，提供独立包 `@lensx/official-config-lens`、插件身份 `dev.lensx.config-lens`，产品在 `en-US` 和 `zh-CN` 中均名为 `ConfigLens`。Manifest MUST 使用 Contract `0.4.0`，贡献恰好一个 WebView Page 和一个指向该 Page 的 Launcher Action，且 Page 声明 `initial_size: 800×600` 逻辑像素、`resizable: true`。声明 MUST 使用与外部插件相同的公开 Page presentation 契约，MUST NOT 请求 Host 权限、Runtime 原生 setter 或未发布能力。插件 MUST 只消费公开插件包导出和普通浏览器依赖，Host MUST NOT 导入插件源码或因官方仓库位置授予权限。

该 Action 的 `title.en-US` 和 `title.zh-CN` MUST 均为 `ConfigLens`。标题调整 MUST 保留 `dev.lensx.config-lens.open` 的执行身份、`main` Page 目标和既有功能关键词，MUST NOT 将 `Open ConfigLens`、`打开 ConfigLens` 或用于兼容的打开前缀追加为搜索关键词。

#### Scenario: User opens ConfigLens from the Launcher

- **WHEN** 已安装 ConfigLens Action 被找到并激活，当前工作区能够容纳其声明尺寸
- **THEN** Launcher 入口标题在两种语言下均为 `ConfigLens`，Host 经普通 Registration、Resource、隔离 Child WebView Runtime 和 Session 路径，在 `800×600` 逻辑像素、可调整大小的窗口中打开其 Page
- **THEN** Host Page chrome 显示品牌 `ConfigLens`，插件工作区不重复显示主标题或副标题
- **THEN** Child WebView 保留可访问的工作区名称，不获得 Tauri、原生 Window setter、Host DOM、文件系统、原生剪贴板或其他插件状态

#### Scenario: User resizes, hides, closes, and reopens ConfigLens

- **WHEN** 用户调整当前 ConfigLens Page 大小、隐藏/恢复、关闭回到 Home 后再次打开
- **THEN** 隐藏/恢复保留当前 attempt 和用户尺寸，关闭恢复不可调整大小的 `650×320` Home，再次打开从有效 `800×600` 开始
- **THEN** 用户调整的尺寸不会写入 ConfigLens、Host 偏好、浏览器存储、插件存储、包元数据或验证产物

#### Scenario: Official source attempts to bypass the public boundary

- **WHEN** `plugins/config-lens` 声明或导入 Host-private 源码、Tauri、未发布 Host API、仅 workspace 可用的深层路径、其他插件源码或 Runtime Window 方法
- **THEN** workspace 和官方交付边界验证 MUST 拒绝该成员
- **THEN** 不得新增官方专属的导入、Runtime、CSP、权限、安装、presentation 或 resize 例外

#### Scenario: Legacy nested path remains

- **WHEN** ConfigLens 源码仍位于旧 `plugins/official/config-lens` 路径
- **THEN** workspace、官方交付及聚焦 ConfigLens 检查 MUST 报告路径漂移
- **THEN** 系统 MUST NOT 同时接受旧路径和 `plugins/config-lens` 作为产品成员

#### Scenario: Discover ConfigLens after the title change

- **WHEN** 在任一界面语言下按 `ConfigLens` 或既有 `JSON`、`format`、`格式化` 等关键词搜索可用入口
- **THEN** 搜索继续按同一规则返回身份为 `dev.lensx.config-lens.open`、展示名称为 `ConfigLens` 的 Action
- **THEN** 其关键词仍为既有功能关键词集合，不含本次标题变更新增的兼容别名
