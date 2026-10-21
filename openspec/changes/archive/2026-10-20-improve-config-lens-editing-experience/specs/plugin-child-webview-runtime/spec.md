# Spec Delta

## ADDED Requirements

### Requirement: Child WebView MUST deliver editing shortcuts according to native focus

macOS 上当前有效、可见且拥有原生文本焦点的插件 Child WebView MUST 接收其普通 Web 编辑快捷键，使页面已有的全选、查找、剪切、复制、粘贴、撤销、重做和编辑操作能够按页面规则处理。此行为 MUST 对官方、外部及 Development Mode 插件一致，不依据插件身份、Publisher、仓库位置、Monaco 使用情况或插件自报焦点选择特例。

交付 MUST 保持原生事件、修饰键和单次处理语义。未聚焦、隐藏、脱离窗口、已销毁或被替换的 Child MUST 不接管事件、不取回焦点、不重新显示，并不得影响 Host 输入或另一原生视图。未处理的事件 MUST 保留原生传播语义；非 Child 原有行为保持。

Host 保留的应用级 `Cmd+W/Q` MUST 继续遵循 `launcher-window-lifecycle`：仅前台 lensX 处理，分别进入可恢复 Hide 与完整 Quit，每次按键各执行一次，不注册为全局快捷键，不由插件覆盖。编辑快捷键修复 MUST NOT 新增 Host API、SDK 方法、插件权限、通用 Tauri 能力、可控原生句柄或通过脚本合成按键的通道。

#### Scenario: Current focused plugin receives editing shortcuts

- **WHEN** 当前可见 Child 的文本输入拥有原生焦点，用户发送编辑快捷键
- **THEN** 事件及其修饰键交给该原生 Web 编辑目标一次，由该页面处理命令
- **THEN** 外部、开发和官方插件使用相同规则，Host 不创建插件专属快捷键映射

#### Scenario: Host or another native input owns focus

- **WHEN** Host 搜索框、另一原生视图或窗口外目标拥有焦点
- **THEN** 未聚焦 Child 不接管或重复分发事件
- **THEN** 原焦点和对应输入行为保留

#### Scenario: Hidden or replaced plugin cannot consume late input

- **WHEN** Child 被隐藏、脱离窗口、销毁或替换，或无法确认其原生焦点归属
- **THEN** 晚到事件不能执行旧页面编辑命令、恢复旧焦点或显示旧 Child
- **THEN** 新页面或 Host 的输入状态不受影响

#### Scenario: Native handled result is preserved

- **WHEN** 有效目标的原生处理返回已处理或未处理
- **THEN** 返回结果保持，不再次向页面或菜单合成同一事件
- **THEN** 未处理事件继续遵循原生传播规则

#### Scenario: Application close and quit keep their reserved meaning

- **WHEN** lensX 位于前台且当前插件正在编辑，用户按 `Cmd+W` 或 `Cmd+Q`
- **THEN** 分别只触发一次既有 Hide 或 Quit，并执行相应 Child 生命周期处理
- **THEN** 其他应用位于前台时，lensX 不消费其对应组合键

## MODIFIED Requirements

### Requirement: Child WebView delivery MUST pass deterministic security and lifecycle validation

交付 MUST 综合 Rust 单元和集成测试、TypeScript 控制器和状态测试、React 可访问／本地化／主题测试、规范正常与恶意包、公开包边界检查、构建和确定性产物检查。覆盖范围 MUST 包括创建意图、导航策略、bridge／SDK ready 状态、尺寸、焦点意图、隐藏／恢复复用、关闭、替换、禁用、卸载、失败、销毁、迟到事件失效，以及通用 Tauri 权限命中为零。

编辑快捷键验证 MUST 覆盖生产路由策略的原生焦点归属、有效性、原事件与修饰键保留、委托次数、已处理／未处理结果和 Host 保留命令，并验证生产适配接线及实际构建的依赖路径。只检查若干源码字符串不得替代生产策略的行为测试。检查 MUST 不启动真实 WebView、GUI、原生交互 harness 或浏览器，也不得宣称真实交互、真实 teardown 或目标性能证据。

#### Scenario: Deterministic Child WebView matrix passes

- **WHEN** 维护中的 Rust、TypeScript、React、包和恶意样例检查执行
- **THEN** 生命周期、来源权限、清理、快捷键焦点策略、单次交付和公开／私有边界通过
- **THEN** 所有插件共享规定 Runtime 路径，结果明确限于确定性证据

#### Scenario: Keyboard policy is exercised without native interaction

- **WHEN** 通过 fake 原生响应器对生产路由策略测试聚焦、隐藏、替换、无目标和 Host 保留命令
- **THEN** 可验证决策、调用次数和结果传播，编译及接线检查确认生产路径使用该策略
- **THEN** 不把建模结果描述为真实 macOS 按键事件实测

#### Scenario: Environment-only validation remains

- **WHEN** 维护中的 Gate 或脚本启动真实 Child WebView、驱动原生交互、测量目标延迟或读写环境验收产物
- **THEN** 验证治理失败
- **THEN** 删除该入口及资产，不保留可选、手动或兼容验证路径
