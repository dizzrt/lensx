## ADDED Requirements

### Requirement: Plugin storage MUST derive one private namespace from trusted current identity

系统 MUST 只从 authenticated Runtime Session 的 Host-owned identity 派生插件存储 namespace，并在每次 Host-private storage operation 中重新验证当前 Plugin Manager record。公共 request、插件代码、Manifest、SDK 或 wire payload 不得选择或覆盖 plugin ID、plugin key、namespace、真实路径、Registration、provider 或 Tauri command。

Rust 必须使用与 Installer 相同的 canonical v1 plugin-key 派生规则，把 namespace 限制在 `app_local_data_dir()/plugins/data/<plugin-key>` 的真实、非符号链接子树内。Host application preferences、program payload、cleanup evidence、其他插件 namespace 和浏览器 origin storage 必须保持不可读写。

#### Scenario: 两个插件写入相同 key

- **WHEN** 当前插件 A 与插件 B 分别调用 `storage.set` 写入相同 key 但不同 value
- **THEN** 每个调用只修改由各自可信 Session identity 派生的 namespace
- **THEN** 后续 `storage.get` 只返回调用插件自己的 value，且响应不暴露另一个 namespace 是否存在相同 key

#### Scenario: 插件尝试选择其他 namespace

- **WHEN** request、private frame 或调用参数加入 plugin ID、namespace、path、entry ID、Registration revision、provider 或 Host object
- **THEN** exact Contract 或 Host-private boundary 以稳定 `invalid_params` 或受控边界错误拒绝该值
- **THEN** Rust 不解析、创建、读取、修改或删除所选目标

#### Scenario: Session identity 不再可用

- **WHEN** storage operation 进入 Rust serialization boundary 时，live Manager record 已不存在、已禁用、identity 不匹配或被 lifecycle cleanup 阻塞
- **THEN** operation 返回稳定 `unavailable`，且不创建或修改 data subtree
- **THEN** 旧 Session 不能在 disable、uninstall 或 identity replacement 后恢复写权限

### Requirement: Storage methods MUST implement the existing Host API 0.1.0 semantics

系统 MUST 在不改变公共 Host API `0.1.0` payload 的前提下实现 `storage.get`、`storage.set`、`storage.delete`、`storage.list` 和 `storage.get_quota`。输入和值必须先通过现有 Contract validation；Rust 必须再次拒绝未知字段、非法 key、非 JSON value 和不符合 Host-private contract version 的 payload。

`storage.get` 必须区分 `{ found: false }` 与 `{ found: true, value }`；`storage.set` 成功必须返回 `{ stored: true }`；`storage.delete` 必须准确返回现有 key 是否被删除。返回的 JSON value 必须是当前 persisted value 的独立 Contract-valid 副本，不得携带 Rust、Tauri、DOM 或 Host object。

#### Scenario: JSON value 跨重启读写

- **WHEN** 当前插件成功 `storage.set` 一个 Contract-valid JSON value，Host 完整退出并从同一 application data root 重启，然后同 identity 插件调用 `storage.get`
- **THEN** `set` 返回 `{ stored: true }`，重启后的 `get` 返回 `{ found: true, value }`
- **THEN** 返回值与已提交 JSON 语义相等，且不包含 namespace、路径、内部 revision 或 envelope metadata

#### Scenario: 读取和删除不存在的 key

- **WHEN** 当前 namespace 不存在或目标 key 不存在，并依次调用 `storage.get` 与 `storage.delete`
- **THEN** Host 分别返回 `{ found: false }` 与 `{ deleted: false }`
- **THEN** read/delete 不创建空 data subtree，也不查询或泄露其他 namespace

#### Scenario: 删除现有 key

- **WHEN** 当前 namespace 已提交目标 key，当前 Session 调用 `storage.delete`
- **THEN** Host 原子提交不含该 key 的新 store 并返回 `{ deleted: true }`
- **THEN** 后续 `storage.get` 返回 `{ found: false }`，其他 key 保持不变

### Requirement: Storage limits MUST be concrete, deterministic and enforced in Rust

v1 storage MUST 执行以下固定限制：Contract-valid key 为 1–256 Unicode code points 且不含 C0/DEL 控制字符；JSON 根值深度为 0、最大嵌套深度为 32；单 value 的 deterministic compact JSON UTF-8 表示不得超过 262144 bytes；每 namespace 不得超过 1024 entries；每 namespace logical usage 不得超过 1048576 bytes。

logical usage 必须等于全部 key UTF-8 bytes 与对应 compact JSON value bytes 之和。Rust 必须从 validated candidate state 自行计算 depth 和 bytes；不得信任插件、SDK 或 TypeScript 报告的 size。替换现有 key 时必须先移除旧 entry usage 再判断候选总量，失败不得改变旧值。

shape、key 或 cursor 格式失败必须映射为 `invalid_params`；depth、单值、entry count 或 namespace usage 超限必须映射为 `limit_exceeded`。错误不得回显 key、value、usage 明细、路径或 raw payload。

#### Scenario: 写入处于限制内

- **WHEN** candidate value、depth、entry count 和替换后的 namespace logical usage 均处于 v1 限制内
- **THEN** `storage.set` 原子提交 candidate 并返回 `{ stored: true }`
- **THEN** `storage.get_quota.usedBytes` 按同一 logical usage 定义更新

#### Scenario: 单值或深度超限

- **WHEN** Contract-valid JSON value 的 compact UTF-8 表示超过 262144 bytes，或嵌套深度超过 32
- **THEN** Host 返回稳定 `limit_exceeded`，不提交临时或 canonical file
- **THEN** 原 key、namespace usage 和其他插件数据保持不变

#### Scenario: 替换值导致总容量超限

- **WHEN** 替换现有 key 后的 candidate namespace logical usage 超过 1048576 bytes
- **THEN** Host 返回稳定 `limit_exceeded`
- **THEN** 旧 value 仍可读取，失败写入不消耗 quota

### Requirement: Quota and listing MUST expose only bounded logical namespace facts

`storage.get_quota` MUST 为当前 trusted namespace 返回 `{ usedBytes, limitBytes }`，其中空 namespace 的 `usedBytes` 为 `0`，`limitBytes` 固定为 `1048576`。结果不得包含 physical file size、filesystem capacity、其他插件或 application preferences usage。

`storage.list` 必须只返回 key，按 Unicode code-point 顺序稳定且唯一排序。省略 limit 时必须使用 100；显式 limit 必须在 1–1000 内。超过一页时 Host 必须返回长度不超过 1024 的 opaque continuation cursor；cursor 必须绑定当前 namespace revision 和下一页位置并通过 Host-private 完整性校验。

#### Scenario: 列出空 namespace

- **WHEN** 当前 namespace 不存在或没有 entries，并调用 `storage.list` 与 `storage.get_quota`
- **THEN** list 返回 `{ keys: [] }` 且没有 `nextCursor`，quota 返回 `{ usedBytes: 0, limitBytes: 1048576 }`
- **THEN** 两个 read operation 均不创建 data subtree

#### Scenario: 稳定分页列出 keys

- **WHEN** 当前 namespace 的有序 key 数量超过 requested 或默认 page limit
- **THEN** 每页只返回稳定有序、无重复的 keys，并在还有数据时返回 opaque `nextCursor`
- **THEN** cursor 只能继续同一 namespace revision，响应不批量返回 values 或内部 metadata

#### Scenario: 分页期间 namespace 被修改

- **WHEN** caller 获得 cursor 后发生成功 set/delete，再提交旧 cursor
- **THEN** Host 返回稳定 `conflict`，不返回可能重复或遗漏的混合 snapshot
- **THEN** caller 可以从第一页重新开始而不修改 namespace

#### Scenario: cursor 被伪造或越界

- **WHEN** cursor version、完整性、namespace binding、position 或长度非法
- **THEN** Host 返回稳定 `invalid_params`
- **THEN** Host 不把 cursor 内容解释为路径、key、plugin identity 或另一个 namespace

### Requirement: Durable mutations MUST use bounded canonical data and atomic replacement

每个 namespace MUST 使用一个严格 version-1 canonical store，包含单调 namespace revision 和按规范顺序排列的 entries。读取必须拒绝未知字段、重复 key、非 canonical 顺序、非法 value、错误 usage、unsupported version 和超过物理读取上限的内容。

成功 mutation 必须在同一 canonical data subtree 中以 create-new 临时文件、bounded write、file flush、`sync_all`、atomic rename 和 parent-directory sync 完成。Rust atomic rename 必须是唯一 durable commit point。commit 前的任何验证、配额、写入或同步失败不得改变旧 canonical store；commit 后不得通过删除新 store 伪造回滚。

#### Scenario: 写入在 commit 前失败

- **WHEN** 临时文件创建、bounded serialization、write、flush 或 pre-rename sync 失败
- **THEN** Host 返回受控 `unavailable` 或 `internal_error`，旧 canonical store 保持 byte-for-byte 可用
- **THEN** operation 清理自己可证明拥有的临时文件，且不删除未知文件或其他 namespace

#### Scenario: commit 成功但 response 变晚

- **WHEN** atomic rename 已完成，但 Session 随后取消、断开或被替换，导致 response 不能交付
- **THEN** Host 保留 durable commit 并丢弃 late response，不尝试删除新 store
- **THEN** 同 identity 的后续 current Session 可以通过 `storage.get` 对账

#### Scenario: Host 在 mutation 中途退出

- **WHEN** 进程在 canonical rename 前或后退出并从同一 root 重启
- **THEN** recovery 只接受完整 canonical version-1 store，且不得把半写入临时文件当成 committed data
- **THEN** namespace 呈现旧状态或完整新状态，不呈现部分 candidate

### Requirement: Storage and plugin lifecycle MUST share one data ownership boundary

storage read/write、installation、replacement、uninstall、cleanup recovery 和同 identity reinstall MUST 共享 Host-private data coordinator 与现有跨进程 install serialization boundary，或提供经过证明的等价单序列化语义。storage operation 在该边界内必须验证 live Manager identity；lifecycle cleanup 必须继续只删除可证明属于目标 plugin key 的 canonical data subtree。

升级或 compatible same-identity replacement 必须保留 storage store 不变。禁用必须终止 current Runtime access但保留数据。卸载 `retain_data` 必须保留 store 且在无 Registration 时不可调用；同 identity 成功重装且 cleanup 无冲突后必须重新可见。卸载 `delete_data` 必须持久化既有 cleanup intent 并最终删除整个 canonical data subtree，逻辑卸载后的 storage call 不得重建它。

#### Scenario: 插件升级后读取原数据

- **WHEN** compatible replacement 为同一 plugin identity 提交新 package generation，并创建新的 current Session
- **THEN** replacement 不修改独立 storage store，新 Session 可以读取升级前已提交 value
- **THEN** 旧 Session 不能借 storage operation 操作其他 identity 或恢复旧 Runtime authority

#### Scenario: 禁用后再启用

- **WHEN** 插件被禁用、其 Session 终止，然后在不清除数据的情况下重新启用
- **THEN** 禁用期间没有 storage call 可执行，data subtree 保持不变
- **THEN** 新 current Session 可以读取禁用前的 committed value

#### Scenario: retain-data 卸载与重装

- **WHEN** uninstall 以 `retain_data` 完成，随后同 identity 成功重装
- **THEN** 无 Registration 期间 storage provider 返回 `unavailable` 且不修改 retained store
- **THEN** 重装不恢复旧 grants 或 Manager facts，但新 current Session 可以读取 retained plugin data

#### Scenario: delete-data 卸载与并发写入

- **WHEN** `storage.set` 与 `delete_data` uninstall 竞争同一 plugin identity
- **THEN** shared coordinator 使二者按安全顺序完成：写入先提交后被 cleanup 删除，或逻辑卸载先完成并拒绝写入
- **THEN** cleanup 完成后 canonical data subtree 不被 late storage call 重建

### Requirement: Corruption MUST degrade only the affected namespace

Host MUST NOT 因任一 plugin store 缺失、oversized、malformed、non-canonical、unsupported、symlinked 或 unreadable 而启动失败。storage service 必须延迟到 namespace access 时执行 bounded metadata/read 和严格验证，并把已证明损坏或异常的 namespace 标记为 degraded；不得扫描 value 进入日志，也不得猜测、覆盖或清空 canonical evidence。

degraded namespace 的 storage methods 必须返回稳定 `unavailable`，且其 capabilities 必须在 Host 确认该状态后从该 identity 的后续 Context snapshot 中移除。Host、application preferences、Registration、其他插件 namespace 和非 storage Host API 必须继续工作。只有既有 `delete_data` lifecycle cleanup 在证明 subtree ownership 后可以删除损坏 evidence。

#### Scenario: 一个插件 store 损坏

- **WHEN** 插件 A 的 canonical store 无法通过 version、shape、order、size 或 value validation，而插件 B 的 store 有效
- **THEN** 插件 A 的 storage call 返回稳定 `unavailable` 并产生不含 payload/path 的 bounded Host diagnostic
- **THEN** Host 与插件 B 正常启动和读写，插件 A 的非 storage capability 不被该损坏修改

#### Scenario: data subtree 含符号链接或异常类型

- **WHEN** namespace path、canonical file 或其 parent evidence 是 symlink、非普通文件或超出 canonical root
- **THEN** Host 保留 evidence、拒绝 storage access 且不跟随链接
- **THEN** 诊断不得包含解析后的外部路径，其他 namespace 不受影响

#### Scenario: 安全的遗留临时文件

- **WHEN** Host 发现符合当前 process-owned temp profile、位于正确 real parent 且 canonical store 仍有效的未提交临时文件
- **THEN** recovery 可以删除该临时文件但不得把它提升为 committed store
- **THEN** 未知、冲突或无法证明所有权的文件被保留并使该 namespace fail closed

### Requirement: Storage delivery MUST preserve public package and documentation boundaries

公共 Contract、SDK 和 Testkit MUST 继续只暴露现有 Host API `0.1.0` semantic methods/types，不得导出 Host-private storage request、cursor codec、data model、path、Tauri command、provider 或 Rust error。官方和第三方插件必须通过相同公共 SDK/Contract 边界调用 storage，官方来源不得获得 namespace 或 limit bypass。

交付必须包含 Rust store/command、TypeScript adapter/provider、Dispatcher/Runtime/MessageChannel、跨插件隔离、restart、fault injection、lifecycle 竞争和独立 public-tarball consumer 证据。English architecture/validation 文档及同路径 Simplified Chinese mirror 必须更新；路线图只能把 Task 5.4 标记完成，不得声称 Task 5.5、Task 5.6 或 Milestone 5 已完成。

本 capability 不新增产品 UI、可见 copy、theme-aware component 或交互 surface，因此不得为满足本 change 创建占位设置页；accessibility、locale 和 theme 的现有产品行为必须无回归。

#### Scenario: 外部插件通过公共 SDK 使用 storage

- **WHEN** isolated consumer 只安装打包后的公共 Contract、SDK 和 Testkit，并通过真实 authenticated Runtime Port 调用五个 storage methods
- **THEN** storage 产生真实 Host-owned 效果和 Contract-valid result/error
- **THEN** consumer 不导入 lensX application source、Tauri adapter、private wire、cursor codec、path 或 executor

#### Scenario: 完成 Task 5.4 后检查交付声明

- **WHEN** focused 与完整验证全部通过并更新文档和路线图
- **THEN** storage provider 被描述为已交付，clipboard、permission management 和 general RPC limits 仍被描述为未交付
- **THEN** Task 5.5、Task 5.6 与 Milestone 5 的 checkbox 保持未完成
