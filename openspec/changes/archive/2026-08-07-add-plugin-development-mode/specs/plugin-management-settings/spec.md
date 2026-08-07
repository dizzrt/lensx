## ADDED Requirements

### Requirement: Plugin settings MUST gate and explain Development Mode explicitly

Plugins settings MUST 只在 frontend compile-time capability 与 native capability 同时可用时显示 Development Mode section。当前 process 开关关闭时，页面 MUST 说明开发目录内容为 Unpacked/Unsigned、不会获得 official/trust/permission 例外、且开关/注册不跨重启；只有显式 enable control 可以开启。关闭操作 MUST 在 Host 确认 development entries 已 quiesce/remove 后更新 UI，MUST NOT 仅隐藏 controls 或提前声称关闭成功。

#### Scenario: Development capability is absent

- **WHEN** 当前 frontend 或 native build 不包含 Development Mode capability
- **THEN** Plugins settings 不显示 enable、register、reload 或 remove development controls
- **THEN** 普通 installation、replacement、lifecycle、permission 和 diagnostic UI 保持现有行为

#### Scenario: User enables Development Mode

- **WHEN** 支持该能力的构建中，用户阅读风险说明并显式开启当前 process 开关
- **THEN** 页面显示 Register development directory 操作和明确的 active-mode 状态
- **THEN** 页面不声称已安装、已验证、已签名、已授权或已启动任何插件

#### Scenario: User disables Development Mode

- **WHEN** 用户在存在 development entries 时确认关闭模式
- **THEN** UI 保持 pending/duplicate protection，直到 Host 返回完整 quiescence 或 bounded partial/convergence failure
- **THEN** 成功后开发 controls/entries 消失且焦点返回稳定 settings control；失败时仍显示真实剩余状态

### Requirement: Development registrations MUST be visually and semantically distinct

每个 `source=development` healthy entry MUST 在 list 和 detail 中使用本地化文本清楚显示 Development、Unpacked 和 Unsigned。页面 MUST 将 publisher author text、Host source、requested permissions、grants 和 effective capabilities 分开呈现，并 MUST NOT 使用“Official”“Verified”“Installed”或等价 trust 文案描述 development entry。状态 MUST 使用文本与语义，不得只依赖颜色或 icon。

#### Scenario: View a development entry

- **WHEN** Registration Contract `0.2.0` snapshot/detail 包含 `source=development`
- **THEN** list/detail 显示真实 Manifest name/version/compatibility 和 Development、Unpacked、Unsigned labels
- **THEN** source directory、snapshot path/identity、raw diagnostic、operation token 和 internal feature facts 不显示

#### Scenario: Development publisher claims official identity

- **WHEN** development Manifest publisher 文本声称 lensX 或其他受信任组织
- **THEN** 页面继续将其显示为 unverified author text 和 Development/Unsigned source
- **THEN** permission/grant/effective capability 与 source/trust label 保持独立

### Requirement: Development register, reload, and remove MUST use typed current operations

management UI MUST 只通过 typed Host-private Development service 执行 register、reload 和 remove。register MUST 使用 pathless native folder picker；reload/remove MUST 使用 opaque current entry identity 和 expected revision。只有 current `source=development` entry 可以显示 reload/remove；builtin、external 和 quarantine entries MUST NOT 获得这些操作。pending request MUST 禁止 duplicate submission，并在 cancel、success、invalid、incompatible、source changed、conflict、cleanup pending 或 convergence failure 后重新读取完整 current snapshot/detail。

#### Scenario: Register a compatible development directory

- **WHEN** 用户触发 register、选择有效兼容 `dist/` 且 Host 原子提交 development entry
- **THEN** 页面刷新到包含该 entry 的 current Registration revision，选择它并宣布安全成功状态
- **THEN** 页面不接收或缓存所选绝对路径，也不把操作称为正式 package installation

#### Scenario: Reload fails validation

- **WHEN** selected development entry 的 reload 返回 invalid、incompatible、source changed 或 unsafe diagnostic
- **THEN** 页面显示 bounded localized failure 并继续呈现旧 current version/generation 的 registration facts
- **THEN** UI 不清空旧 entry、不声称 reload 成功，也不展示原始 path/error

#### Scenario: Reload or remove becomes stale

- **WHEN** operation 因 revision、entry identity、enabled/grant 或另一 mutation 变化而 conflict
- **THEN** 页面丢弃 stale transient state、重新读取 current snapshot/detail 并提示重试
- **THEN** stale result 不覆盖新 selection、permission state 或当前 operation availability

#### Scenario: Remove a development entry

- **WHEN** 用户确认 remove 当前 development entry 且 Host 成功提交
- **THEN** 页面从 current list 移除该 entry，将焦点移动到相邻有效 entry 或 Register development directory control
- **THEN** 文案明确 plugin data 和 Launcher collections 未被删除，且不声称执行正式 uninstall

### Requirement: Development controls MUST preserve localization, themes, keyboard access, and focus

Development Mode 的所有 visible copy MUST 使用 English canonical i18n 并提供语义一致的 Simplified Chinese。controls、labels、diagnostics、confirmation 和 live feedback MUST 使用 Semi Design 支持的 light/dark theme，固定 `650×600` viewport MUST 可滚动且无关键截断。enable/disable、register、reload、remove、confirm/cancel MUST 可仅用键盘操作，具有 accessible name、visible focus、deterministic initial focus 与 operation 后恢复；Modal MUST 具有可访问 title/description 和 pending close protection。

#### Scenario: Keyboard user reloads a development entry

- **WHEN** 键盘用户聚焦一个 development entry 并触发 Reload
- **THEN** pending/status 通过可访问 live semantics 呈现，duplicate controls disabled，成功或失败后焦点返回仍 current 的 Reload control
- **THEN** selection、scroll context 和当前 locale/theme 保持稳定

#### Scenario: Switch locale and theme with development state visible

- **WHEN** 页面在 Development Mode active、development labels 或 diagnostic 可见时切换 `en-US`/`zh-CN` 与 light/dark
- **THEN** 所有开发文案、accessible names、tags、warnings、dialogs 和 feedback 使用当前 locale 与支持的 theme tokens
- **THEN** fixed viewport 不出现关键截断、重叠、丢失对比度或仅颜色传达状态
