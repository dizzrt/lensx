## ADDED Requirements

### Requirement: 设置插件必须支持管理任意插件别名

设置插件 MUST 提供插件别名管理页面，允许用户为当前 registry 中的任意插件查看、添加和删除有效别名。别名管理页面 MUST 使用应用偏好作为用户别名覆盖层事实源，并 MUST NOT 修改插件 manifest 中的默认别名。别名管理页面的用户可见文案 MUST 来自应用 i18n message，UI MUST 使用 Naive UI 组件并兼容 light 和 dark 主题。

#### Scenario: 展示插件有效别名

- **WHEN** 用户打开插件别名管理页面
- **THEN** 页面展示当前 registry 中的插件列表
- **THEN** 页面展示每个插件由默认别名和用户自定义别名合成后的有效别名

#### Scenario: 为插件添加新别名

- **WHEN** 用户为某个插件输入一个当前有效别名中不存在的新别名
- **THEN** 系统将该别名写入该插件的用户自定义别名覆盖层
- **THEN** 页面展示更新后的有效别名

#### Scenario: 删除自定义别名

- **WHEN** 用户删除某个来自用户自定义覆盖层的别名
- **THEN** 系统从该插件的 `added_aliases` 中移除该别名
- **THEN** 页面不再展示该别名

#### Scenario: 删除默认别名

- **WHEN** 用户删除某个来自 manifest 默认别名的别名
- **THEN** 系统将该别名写入该插件的 `disabled_default_aliases`
- **THEN** 页面不再展示该别名
- **THEN** 系统 MUST NOT 修改插件 manifest

#### Scenario: 默认别名和自定义别名删除体验一致

- **WHEN** 用户在插件别名管理页面删除任意有效别名
- **THEN** 页面使用同一种删除交互
- **THEN** 页面 MUST NOT 要求用户理解该别名来自 manifest 默认别名还是用户自定义别名

### Requirement: 插件别名覆盖层必须保持大小写不敏感唯一性

系统 MUST 使用 `trim + locale lowercase` 归一化别名，并 MUST 保证单个插件的有效别名集合大小写不敏感唯一。添加别名时，如果输入别名与已禁用的默认别名归一化后相同，系统 MUST 重新启用该默认别名而不是新增自定义别名。如果输入别名与当前有效别名归一化后相同，系统 MUST 拒绝重复添加或提示已存在。

#### Scenario: 重新添加已禁用默认别名

- **WHEN** 插件默认别名包含 `settings`
- **AND** 用户此前删除了 `settings`
- **AND** 用户重新添加 `Settings`
- **THEN** 系统从 `disabled_default_aliases` 中移除对应默认别名
- **THEN** 系统 MUST NOT 向 `added_aliases` 新增重复别名
- **THEN** 页面重新展示该默认别名

#### Scenario: 拒绝重复有效别名

- **WHEN** 插件当前有效别名包含 `settings`
- **AND** 用户尝试添加 `Settings`
- **THEN** 系统按归一化结果识别重复别名
- **THEN** 系统拒绝新增重复别名或展示已存在提示

#### Scenario: 忽略别名首尾空白

- **WHEN** 用户输入别名 `  settings  `
- **THEN** 系统保存和比较别名时使用去除首尾空白后的值
- **THEN** 系统 MUST NOT 创建只因首尾空白不同而重复的别名

### Requirement: 插件别名偏好必须通过正式偏好边界持久化

插件别名覆盖层 MUST 作为应用偏好的一部分由 Rust/Tauri 侧持久化。偏好 payload 字段 MUST 使用 `snake_case`，至少包含每个插件的 `added_aliases` 和 `disabled_default_aliases`。系统读取缺少插件别名覆盖层的旧偏好文件时 MUST 使用空覆盖层默认值继续运行。

#### Scenario: 读取旧偏好文件

- **WHEN** 偏好文件只包含既有 `theme_mode`
- **THEN** 系统读取偏好成功
- **THEN** 系统将插件别名覆盖层视为空

#### Scenario: 持久化别名覆盖层

- **WHEN** 用户添加、删除或重新启用插件别名
- **THEN** 前端通过正式偏好更新边界提交插件别名覆盖层
- **THEN** Rust/Tauri 侧持久化更新后的应用偏好

#### Scenario: 别名偏好写入失败

- **WHEN** 用户修改插件别名但持久化失败
- **THEN** 系统显示可诊断错误
- **THEN** 系统 MUST NOT 让用户误以为别名已经保存成功
