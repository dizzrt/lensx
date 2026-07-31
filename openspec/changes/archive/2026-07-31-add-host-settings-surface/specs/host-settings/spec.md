## ADDED Requirements

### Requirement: 设置必须作为 Host 自有能力提供

应用 MUST 将设置实现为 owner 为 `lensx.core`、页面 ID 为 `settings` 的
Host 页面。设置 MUST 在现有 Tauri 主窗口的公共内容区域中呈现，MUST NOT
创建独立的 Tauri 设置窗口，也 MUST NOT 将设置注册、标记或执行为插件。

#### Scenario: 打开设置页面

- **WHEN** `lensx.core.open_settings` Action 成功打开设置
- **THEN** 现有主窗口的公共内容区域显示 Host 设置页面
- **THEN** 活动页面身份的 `owner_id` 为 `lensx.core`
- **THEN** 活动页面身份的 `page_id` 为 `settings`
- **THEN** 主窗口使用 `page` 固定呈现高度，页面上下文头部与设置内容区均可见
- **THEN** 应用没有创建第二个 Tauri 窗口

#### Scenario: 检查设置的运行时归属

- **WHEN** Host 注册设置 Action 和设置页面
- **THEN** 设置不依赖插件清单、插件生命周期或插件运行时
- **THEN** 设置页面提供者与执行入口保持在受信任的 Host 边界内

### Requirement: 设置第一版必须包含偏好与插件两个部分

设置页面 MUST 提供本地化、可访问的“偏好”和“插件”两个一级部分。“偏好”
MUST 包含颜色主题与语言设置。“插件”MUST 只显示本地化空占位，并且 MUST
NOT 显示虚构插件数据或提供安装、启用、禁用、卸载、权限或市场操作。

#### Scenario: 查看偏好部分

- **WHEN** 用户打开设置页面并进入“偏好”
- **THEN** 页面显示颜色主题设置
- **THEN** 页面显示语言设置
- **THEN** 每个设置项及其控件都具有本地化标签和可访问名称

#### Scenario: 查看插件部分

- **WHEN** 用户进入设置页面的“插件”部分
- **THEN** 页面显示当前没有可管理内容的本地化空占位
- **THEN** 页面不显示插件列表、插件状态或插件管理操作

### Requirement: 偏好必须使用受支持的主题和语言值

颜色主题设置 MUST 只接受 `light` 或 `dark`，语言设置 MUST 只接受 `en-US`
或 `zh-CN`。偏好页面 MUST 复用根级主题与国际化 Provider，MUST NOT 创建
页面私有的全局主题或语言来源。

#### Scenario: 切换颜色主题

- **WHEN** 用户从设置中选择与当前值不同的受支持颜色主题
- **THEN** 应用请求持久化包含新主题的完整偏好快照
- **THEN** 持久化成功后根级主题 Provider 切换到所选主题
- **THEN** 设置页面、App Shell 与 Semi Design 内容使用一致的主题

#### Scenario: 切换应用语言

- **WHEN** 用户从设置中选择与当前值不同的受支持语言
- **THEN** 应用请求持久化包含新语言的完整偏好快照
- **THEN** 持久化成功后根级国际化 Provider、Semi Design locale 和文档语言同步切换
- **THEN** 设置页面和页面上下文头部使用新语言的产品文案

#### Scenario: 提交不受支持的偏好值

- **WHEN** 前端或持久化边界收到受支持枚举之外的主题或语言值
- **THEN** 系统拒绝该值并返回可诊断错误
- **THEN** 根级 Provider 保持最后一次确认成功的值

### Requirement: 应用偏好必须通过 Rust/Tauri 边界持久化

Rust MUST 持有可序列化的 `AppPreferences`，其中包含 `theme_mode` 和
`locale`。应用 MUST 通过类型化 Tauri 命令读取和写入完整偏好。偏好文件
缺失时 MUST 使用 `light` 与 `en-US` 默认值；读取和写入 MUST 验证枚举值，
写入 MUST 避免留下部分文件。

#### Scenario: 首次启动且偏好文件不存在

- **WHEN** 应用启动时找不到偏好文件
- **THEN** Rust 返回 `theme_mode = light` 和 `locale = en-US`
- **THEN** AppProviders 使用这些默认值完成初始产品渲染

#### Scenario: 启动时恢复已保存偏好

- **WHEN** 应用启动时读取到有效的已保存偏好
- **THEN** AppProviders 在产品 App 初始渲染时使用已保存主题和语言
- **THEN** 用户不需要重新选择上次确认保存的偏好

#### Scenario: 成功保存偏好

- **WHEN** Rust 收到有效的完整偏好快照并成功完成原子写入
- **THEN** 命令返回已确认保存的偏好
- **THEN** 后续读取返回相同主题和语言

#### Scenario: 启动读取偏好失败

- **WHEN** 偏好文件不可读、格式无效或包含无效枚举
- **THEN** Rust 返回包含稳定错误码和安全消息的可序列化错误
- **THEN** 前端使用默认主题与语言继续启动
- **THEN** 前端保留错误用于本地化、可诊断反馈

#### Scenario: 保存偏好失败

- **WHEN** Rust 无法验证或原子写入新偏好
- **THEN** Rust 返回包含稳定错误码和安全消息的可序列化错误
- **THEN** 前端不更新根级 Provider
- **THEN** 设置控件保持或恢复最后一次确认保存的值
- **THEN** 页面显示本地化失败反馈且不宣称保存成功
