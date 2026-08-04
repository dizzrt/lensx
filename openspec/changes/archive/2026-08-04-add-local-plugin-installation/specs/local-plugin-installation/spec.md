## ADDED Requirements

### Requirement: 用户必须通过受信任的本地安装入口选择 `.lxp`

系统 MUST 在 lensX 设置界面提供一个 Host-owned 从本地文件安装插件的入口，并 MUST 使用原生单文件选择流程接收 `.lxp`。界面 MUST 将“本地”表达为安装来源而不是插件类别。选择和文件读取 MUST 由受信任 Rust Host 拥有；请求和响应 MUST NOT 向 React、公共插件 package 或插件 Runtime 暴露源文件绝对路径、文件句柄或包字节。文件扩展名 MUST 只作为选择过滤，最终接受 MUST 取决于包内容协议。

#### Scenario: 用户选择一个本地包

- **WHEN** 用户从设置页触发本地安装并在原生对话框选择一个 `.lxp`
- **THEN** Rust Host 读取并检查所选包
- **THEN** 前端不接收所选文件的绝对路径、句柄或内容

#### Scenario: 用户取消选择

- **WHEN** 用户关闭原生文件对话框而未选择文件
- **THEN** 安装请求返回严格的 `cancelled` 结果而不是错误
- **THEN** 系统不创建 staging、正式 payload、Plugin Manager record、revision 或 changed event

#### Scenario: 文件名正确但内容错误

- **WHEN** 用户选择扩展名为 `.lxp` 但内容不符合当前 package protocol 的文件
- **THEN** 系统按内容将其拒绝为无效包
- **THEN** `.lxp` 后缀不触发格式猜测、回退或安装

### Requirement: 安装必须消费同一份受限且完整验证的包字节

Rust Host MUST 在读取前后执行压缩包大小上限，并 MUST 让 package inspection 与受控提取消费同一份不可变字节。系统 MUST 复用当前 Zstandard/TAR、checksum、Manifest、资源、路径和硬上限规则；MUST NOT 在检查后重新打开源路径，MUST NOT 使用允许链接、扩展 entry、路径穿越或隐式路径归一化的宽松解包行为。只有 `compatible` 结果可以进入 staging 写入。

#### Scenario: 有效且兼容的包通过安装检查

- **WHEN** 同一份包字节满足全部 package protocol、Manifest、资源、checksum、大小和当前 Host 兼容性要求
- **THEN** 系统取得 normalized Manifest、逐文件事实和完整包 SHA-256，并允许受控 staging 提取
- **THEN** 提取再次核对 canonical entry、路径、大小和文件 SHA-256

#### Scenario: 包在选择后增长超过上限

- **WHEN** 所选文件 metadata 未超限但实际受限读取超过当前 64 MiB 压缩包上限
- **THEN** Host 停止读取并返回安全的 size-limit 错误
- **THEN** 系统不检查或提交截断的前缀，也不创建安装事实

#### Scenario: 包含危险或非 canonical entry

- **WHEN** 包包含路径穿越、绝对路径、链接、特殊 entry、重复路径、大小写冲突、扩展 header、compression bomb 或超过硬上限的内容
- **THEN** 现有 package rules 使整个安装失败关闭
- **THEN** 没有 entry 能写出 installer-owned staging 根或成为正式 payload

#### Scenario: 包有效但与当前 Host 不兼容

- **WHEN** 包结构、checksum、Manifest 和资源有效，但 lensX 或 Host API range 不包含当前版本
- **THEN** 安装返回独立的 incompatible 错误和安全兼容性结论
- **THEN** 系统不创建 staging、正式 payload 或 Plugin Manager record

### Requirement: Host 必须拥有单 registration 的 digest 安装布局

系统 MUST 从 Tauri `app_local_data_dir` 推导 Host-owned `plugins` 根，并 MUST 将正式 payload 存储为 `packages/<plugin-key>/<package-sha256>`。`plugin-key` MUST 由 normalized `plugin_id` 确定性编码为平台安全身份；`package-sha256` MUST 是完整 `.lxp` 字节的 64 位小写十六进制 SHA-256。安装布局 MUST NOT 创建 `versions` 或持久化 `transactions` 目录。每个 `plugin_id` MUST 最多有一个当前健康 registration，Plugin Manager record 中的 installation path MUST 是唯一 active payload 指针。

#### Scenario: 首次安装创建正式 payload

- **WHEN** 一个此前不存在的兼容 plugin 成功提交
- **THEN** 其普通文件位于该 plugin key 和完整 package digest 唯一确定的正式目录
- **THEN** Plugin Manager record 的绝对 installation path 指向该目录并保存相同 algorithm-labelled digest

#### Scenario: 相同语义版本对应不同包内容

- **WHEN** 两个 `.lxp` 声明相同 `plugin_id` 和 Manifest version 但完整包字节不同
- **THEN** 它们具有不同 digest 路径身份
- **THEN** 首次安装能力不会因版本字符串相同而覆盖当前 payload

#### Scenario: 检查安装根的能力边界

- **WHEN** 调用方检查应用 bundle、安装根和未来插件数据边界
- **THEN** 可变 payload 位于 app-local data 而不位于 signed application bundle
- **THEN** 本能力不创建插件私有数据目录，也不声称直接删除应用 bundle 会触发 Application Support 清理

### Requirement: 首次安装必须使用明确的 Host registration facts

兼容包首次注册时，Host MUST 使用 inspector 返回的 normalized Manifest 与 package digest，MUST 注入正式绝对安装路径、`source=external`、`enabled=true` 和空 granted-permission snapshot，并 MUST 让 Runtime 保持 `inactive`。Manifest publisher 或请求权限 MUST NOT 改变 source、enabled、grant、signature、provenance 或 trust 结论。

#### Scenario: 安装请求权限的兼容插件

- **WHEN** 一个兼容包的 Manifest 声明一个或多个 requested permissions 并完成首次安装
- **THEN** Plugin Manager record 保存空 grant snapshot，插件处于 enabled intent 且 Runtime 为 `inactive`
- **THEN** 安装不会把 requested permissions 转换为 grants 或执行插件代码

#### Scenario: Publisher 声称官方身份

- **WHEN** 本地包的 publisher 文本声称由 lensX 官方发布
- **THEN** Host 仍将首次本地安装记录为 `external`
- **THEN** 安装不会生成 verified、signed、official 或额外权限事实

### Requirement: payload 提交与 registration 发布必须可恢复地保持一致

系统 MUST 串行化跨线程和跨进程的安装提交。它 MUST 在唯一 `.staging/<random-id>` 中完整写入、核对并 flush payload，然后 MUST 在同一 Host-owned 文件系统内将其原子移动到 digest 正式目录。只有正式 payload 存在后，系统才可以持久化并发布 Plugin Manager record；只有 record persistence 与内存发布成功后，系统才可以返回 `installed`。系统 MUST NOT 发布指向 staging 或不存在路径的 registration。

#### Scenario: 安装完整成功

- **WHEN** staging 写入、核对、flush、正式 rename 和 Plugin Manager register 全部成功
- **THEN** Host 发布一个新的 registration revision，并发送既有 registration changed invalidation event
- **THEN** 现有 registration consumer 无需重启即可在完整刷新后观察该插件

#### Scenario: staging 阶段失败

- **WHEN** staging 创建、文件写入、checksum 核对或 flush 失败
- **THEN** 安装返回稳定安全错误并尝试删除该请求的 staging
- **THEN** 正式 payload、Plugin Manager state、revision 和 event 保持不变

#### Scenario: Plugin Manager persistence 失败

- **WHEN** payload 已原子移动到正式 digest 目录，但 Plugin Manager record 无法持久化
- **THEN** 安装不发布内存 registration 或成功结果，并立即尝试删除该 payload
- **THEN** 未能即时删除的目录不被视为安装成功，并在后续安全 recovery 中作为 orphan 候选

#### Scenario: changed event 发送失败

- **WHEN** Plugin Manager record、内存 registration 和 revision 已成功发布，但 changed event 无法发送
- **THEN** 已提交安装保持成功且不回滚
- **THEN** Registration Contract 的 listener recovery 或 Launcher activation 完整刷新能够收敛到当前 record

#### Scenario: 另一个安装提交正在进行

- **WHEN** 当前进程或另一个 lensX 进程持有安装独占锁
- **THEN** 并发安装返回稳定的 busy 结果或等待既定的有界串行顺序
- **THEN** 它不得清理、覆盖或注册另一个请求的 staging/payload

### Requirement: 首次安装必须拒绝已有健康或 quarantine 身份

系统 MUST 把任何已有相同 `plugin_id` 的健康 registration 或对应 quarantine record key 视为已有身份，并 MUST 返回稳定的 `already_installed` 或 `identity_quarantined` 错误。首次安装 MUST NOT 根据 Manifest version 猜测升级、降级、重装或 quarantine repair，MUST NOT 覆盖现有 record、payload、grant 或诊断证据。

#### Scenario: 重复选择完全相同的包

- **WHEN** 用户再次选择当前已安装 plugin 的同一 `.lxp`
- **THEN** 安装稳定拒绝重复 identity
- **THEN** 当前 payload、record、revision、grants 和 event 保持不变

#### Scenario: 相同 plugin ID 使用不同版本或 digest

- **WHEN** 用户选择与当前健康 registration 具有相同 `plugin_id` 但 version 或 digest 不同的包
- **THEN** 首次安装稳定拒绝请求而不分类为升级、降级或重装
- **THEN** 当前安装保持完整且不创建 sibling payload

#### Scenario: 相同 identity 处于 quarantine

- **WHEN** package Manifest 的 `plugin_id` 对应一个现有 quarantine record key
- **THEN** 首次安装拒绝静默替换或清除 quarantine
- **THEN** damaged record 与可能关联的 payload 证据被保留

### Requirement: 启动恢复必须清理确定性残留并保守处理不明确所有权

在 Plugin Manager record recovery 完成后，installer MUST 在持有安装独占锁时检查自己的根。它 MUST 清理符合 installer 命名约束的未完成 staging，并 MUST 只把结构合法、位于 packages 根内、未被任何健康 installation path 引用且未被 quarantine plugin key 占有的 digest 目录作为 orphan 删除。恢复 MUST NOT 跟随链接、删除根外路径、删除健康 payload、删除 quarantine subtree 或猜测异常 entry 的所有权。清理失败 MUST NOT 使应用启动 panic，但 MUST 使 installer 暂停接受无法安全提交的新安装并暴露有界安全诊断。

#### Scenario: 上次进程在 staging 中崩溃

- **WHEN** 启动时存在符合 installer 约束的残留 `.staging/<random-id>`，且没有其他进程持有安装锁
- **THEN** recovery 删除该未提交 staging
- **THEN** 不创建 Plugin Manager record、revision 或 event

#### Scenario: 正式 payload 在 record 提交前成为 orphan

- **WHEN** packages 下存在 canonical plugin-key/digest 目录，但没有健康 record 引用且没有对应 quarantine key
- **THEN** recovery 将其作为确定性 orphan 清理
- **THEN** 其他健康或 quarantine plugin subtree 保持不变

#### Scenario: quarantine identity 可能拥有 payload

- **WHEN** Plugin Manager recovery 为某个 record key 创建 quarantine stub，而 packages 下存在相同 plugin key subtree
- **THEN** installer 保留整个 subtree，不以缺少健康 installation path 为由删除
- **THEN** recovery 报告与后续显式修复能力仍可使用该证据

#### Scenario: record 或目录指向安装根之外

- **WHEN** 历史、测试或 damaged record 包含根外 installation path，或者 packages 下出现链接/异常 entry
- **THEN** installer 不跟随、不迁移且不删除根外或归属不明内容
- **THEN** 应用继续启动，并通过不含绝对路径或原始错误的安全诊断报告 installer degraded 状态

### Requirement: 安装命令契约必须严格、私有且最小披露

本地安装命令 MUST 使用独立版本 `0.1.0` 的 Host-private strict contract，并 MUST 让成功、取消和错误 payload 携带该版本。该版本 MUST 独立于 Manifest、package protocol、Registration Contract、Plugin Manager Store 和应用版本。成功结果 MUST 只区分 `cancelled | installed`，其中 `installed` 至少包含 plugin ID、Manifest version 和 registration revision。失败 MUST 使用有限 code、operation 和稳定安全 message，并可复用 package logical diagnostics；所有 Rust 与 TypeScript 边界 MUST 拒绝未知 contract version、未知字段、未知 variant 和无效值。契约 MUST NOT 暴露源/staging/正式绝对路径、package digest、原始异常、stack、环境文本或文件内容，MUST NOT 进入任何公共插件 package。

#### Scenario: 前端收到成功结果

- **WHEN** Rust 完成安装并返回 `installed`
- **THEN** TypeScript adapter 从 `unknown` 验证并冻结 contract version、plugin ID、version 和 revision
- **THEN** 结果不包含 path、digest、Manifest payload、grant 或私有 Rust/Tauri 对象

#### Scenario: 前端收到 malformed payload

- **WHEN** Tauri 返回未知 status、未知字段、错误类型或 malformed error
- **THEN** adapter 拒绝整个值并产生稳定的 boundary error
- **THEN** UI 不发布部分成功或显示原始不可信文本

#### Scenario: 低层错误包含敏感信息

- **WHEN** dialog、读取、codec、文件系统或 persistence 错误包含绝对路径、环境文本或原始异常
- **THEN** Rust boundary 将其映射为稳定安全 code、operation 和 message
- **THEN** 敏感内容不进入 Tauri payload、日志断言、UI 或 shared fixtures

### Requirement: 设置页安装入口必须可访问、本地化并兼容主题

Plugins 设置区 MUST 使用现有应用 i18n 和 Semi Design 主题提供安装说明、一个可访问名称明确的安装按钮和异步反馈。安装 pending 时 MUST 防止同一 UI 重入；取消 MUST 恢复 idle 且不显示错误；成功和失败 MUST 通过不只依赖颜色的 live status 或 alert 语义表达。所有产品文案 MUST 具有 canonical English 和语义一致的 Simplified Chinese，并 MUST 在 light/dark 主题下保持可读和可聚焦。

#### Scenario: 用户使用键盘安装

- **WHEN** 键盘用户聚焦并激活本地安装按钮
- **THEN** 原生文件选择器打开，pending 期间按钮不可重复触发
- **THEN** 对话框返回后焦点和状态反馈保持可操作、可感知

#### Scenario: 安装成功

- **WHEN** adapter 返回有效 `installed` 结果
- **THEN** 设置页以当前 locale 宣告包含 plugin ID/version 的成功反馈
- **THEN** 页面不因此展示未在本 change 范围内的插件列表、详情、enable、disable 或 uninstall 控件

#### Scenario: 安装失败

- **WHEN** adapter 返回一个有效安全错误或 boundary validation 失败
- **THEN** 设置页显示对应的本地化失败反馈并允许用户再次选择
- **THEN** UI 不显示源文件路径、Host 安装路径、digest、stack 或原始错误文本

#### Scenario: 切换 locale 和 theme

- **WHEN** 安装入口分别在 `en-US`/`zh-CN` 与 light/dark 组合下渲染
- **THEN** 按钮、说明、pending、success 和 failure 文案与应用 locale 保持一致
- **THEN** 控件使用受支持的 Semi theme/focus 行为且不依赖硬编码颜色表达状态

### Requirement: 本地安装不得提前交付后续插件能力

本能力 MUST 只交付本地兼容 `.lxp` 的首次安装、最小入口、注册通知和恢复清理。它 MUST NOT 下载远程包、接受开发目录、升级、降级、重装、enable、disable、uninstall、删除插件数据、授予权限、验证签名或官方 provenance、提供插件资源、创建 iframe/Runtime session、调用 Host API 或执行插件代码。

#### Scenario: 一个插件安装完成

- **WHEN** 本地 `.lxp` 已成功写入并注册
- **THEN** existing Host metadata projection 可以根据当前 registration 刷新 Action/Page descriptor
- **THEN** 本 change 不读取 Runtime entry、加载资源、创建 iframe、执行代码或授予请求权限

#### Scenario: 用户希望替换或删除已安装插件

- **WHEN** 用户尝试通过本 change 安装不同版本或寻找 disable/uninstall 操作
- **THEN** 不同版本安装被稳定拒绝，设置页不提供后续生命周期控件
- **THEN** 升级/回滚由 Task 3.4、enable/disable/uninstall 由 Task 3.3、完整管理 UI 由 Task 6.1 处理
