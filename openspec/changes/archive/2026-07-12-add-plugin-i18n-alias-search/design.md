## Context

当前插件 contract 使用 `PluginManifest.name` 表达插件名称，内建设置插件 manifest 中写死为 `"Settings"`。Launcher 顶部插件打开态和插件 action 搜索都直接读取该字段。与此同时，前端基座已经具备应用级 i18n 和 locale 状态，设置插件已经通过 Rust/Tauri 偏好边界持久化主题偏好。

本变更跨越插件 contract、偏好持久化、设置 UI 和 Launcher 搜索。设计目标是让插件 manifest 继续作为不可变元数据来源，同时把用户可编辑别名放入应用偏好覆盖层，避免设置页修改 manifest 或产生重复别名状态。

## Goals / Non-Goals

**Goals:**

- 为插件提供本地化展示名 contract，英文名必填，当前语言名称缺失时回退英文名。
- 为插件提供不可变默认别名，并允许别名作为中英文混写搜索词数组。
- 通过应用偏好保存用户别名覆盖层，支持添加、删除、重新启用默认别名。
- 保证单插件有效别名大小写不敏感去重，归一化规则为 `trim + locale lowercase`。
- 让 Launcher 搜索匹配插件英文名、当前语言名和所有有效别名。
- 设置页使用现有 Naive UI Provider、应用 i18n、明暗主题和 UnoCSS/Less 样式体系。

**Non-Goals:**

- 不引入全文索引、拼音搜索、模糊排序、搜索历史或跨数据源搜索。
- 不把别名设计为多语言结构；别名只是搜索词数组。
- 不允许设置页直接修改 manifest 默认别名。
- 不改变插件 ID 三段式规则、页面 ID、action ID、权限模型或外部插件 iframe 安全边界。
- 不新增 Tauri 窗口、托盘、快捷键或 sidecar 行为。
- 不修改项目稳定文档镜像；本阶段只生成 OpenSpec 变更 artifact。

## Decisions

### Decision 1: 用 `display_names` 替代单一 `name`

插件 manifest 使用明确的本地化名称结构：

```ts
type PluginDisplayNames = {
  en: string;
  locales?: Record<string, string>;
};

type PluginManifest = {
  id: LensxId;
  display_names: PluginDisplayNames;
  default_aliases: string[];
};
```

Rust 侧使用等价结构并通过 `serde` 输出 `snake_case` 字段。`display_names.en` 必填且非空；`display_names.locales` 可选。显示插件名称时读取当前应用 locale 对应名称，缺失时回退英文名。

替代方案是保留 `name` 并额外增加 `localized_names`。这会让名称事实源变成两个字段，容易出现顶部标题、搜索和 registry 展示读取不同字段的问题。因此本变更把旧 `name` 视为被替代字段，并在任务中处理代码迁移。

### Decision 2: 默认别名属于 manifest，用户修改属于偏好覆盖层

manifest 提供 `default_aliases: string[]`，表示插件作者声明的默认搜索词。该字段不可由设置页修改。用户可编辑状态写入应用偏好：

```ts
type PluginAliasOverride = {
  added_aliases: string[];
  disabled_default_aliases: string[];
};

type AppPreferences = {
  theme_mode: ThemeMode;
  plugin_alias_overrides: Record<LensxId, PluginAliasOverride>;
};
```

合成有效别名时：

```text
effective_aliases =
  default_aliases
    - disabled_default_aliases
    + added_aliases
```

删除默认别名时写入 `disabled_default_aliases`；删除自定义别名时从 `added_aliases` 移除。用户重新添加一个已禁用默认别名时，从 `disabled_default_aliases` 移除，不写入 `added_aliases`。

替代方案是把用户删除后的列表存成完整覆盖数组。完整覆盖数组更直观，但无法区分 manifest 后续新增默认别名和用户主动删除别名，也不符合 manifest 不可变的边界。

### Decision 3: 别名归一化由共享纯函数承担

别名唯一性和搜索匹配使用同一归一化规则：

```text
normalize_alias(alias) = alias.trim().toLocaleLowerCase()
```

空别名无效。单个插件内 `default_aliases`、`added_aliases` 和有效别名集合均按归一化结果大小写不敏感去重。实现上应提供可复用 helper，例如：

- `normalizePluginAlias`
- `resolvePluginAliases`
- `addPluginAliasOverride`
- `removePluginAliasOverride`

这些 helper 应由设置页和搜索 helper 共享，避免 UI 与搜索各自实现一套别名规则。

### Decision 4: Rust 偏好边界继续作为事实源

应用偏好仍由 Rust/Tauri 侧读写。新增 `plugin_alias_overrides` 字段的默认值为空 map。读取旧偏好文件时，如果该字段缺失，系统使用空覆盖层继续运行并在下一次写入时补齐。偏好 payload 继续使用跨前后端 `snake_case` 字段。

设置页通过现有 `get_app_preferences` / `update_app_preferences` typed command 读写覆盖层，不引入 localStorage 或前端单独持久化。

### Decision 5: Launcher 搜索消费合成后的搜索词

搜索 helper 不直接理解设置 UI 交互细节，只消费：

- 插件英文名 `display_names.en`
- 当前 locale 名称，缺失时回退英文名
- 合成后的有效别名
- 现有 action title、action id、plugin id

插件别名命中时仍返回该插件暴露的可执行 actions，并复用现有 action dispatcher 打开目标页面。第一阶段不改变 action 级搜索结果模型。

### Decision 6: 设置页增加“插件别名”菜单项

设置插件现有侧边导航增加一个插件别名页面。该页面列出 registry 中的插件，展示当前有效别名，并提供添加和删除操作。删除默认别名和删除自定义别名在 UI 体验上保持一致，内部根据别名来源写入不同覆盖层字段。

UI 使用 Naive UI 表单、列表、标签、按钮和错误提示；所有用户可见文案进入应用 i18n message。静态布局继续使用 UnoCSS，较复杂的页面样式使用 Less，并保持 light/dark 主题可读。

## Risks / Trade-offs

- [Risk] `name` 到 `display_names` 是 breaking contract，外部插件示例或既有 manifest 会失效。→ Mitigation: 同步更新 Rust、SDK、schema、示例和校验错误；该项目仍处早期 scaffold，可以接受 contract 收敛。
- [Risk] 用户覆盖层引用已卸载插件 ID 后会留下孤儿偏好。→ Mitigation: 读取时允许保留，设置页只展示当前 registry 中的插件；后续可增加清理入口。
- [Risk] 默认别名和用户自定义别名的来源差异可能让 UI 行为复杂。→ Mitigation: UI 只展示有效别名和统一删除动作，来源差异封装在 helper 内。
- [Risk] locale lowercase 对部分语言存在边界差异。→ Mitigation: 第一阶段只要求大小写不敏感，使用运行时 locale lowercase；后续如需更严格折叠再扩展归一化策略。
- [Risk] 搜索匹配字段增加后可能导致结果变多。→ Mitigation: 保持现有 action 级结果和简单排序，别名只扩展命中范围，不引入额外分组。

## Migration Plan

1. 更新 Rust 和 TypeScript 插件 contract：`name` 迁移为 `display_names`，新增 `default_aliases`。
2. 更新内建设置插件 manifest、manifest 校验、默认 registry 测试和前端 registry 校验。
3. 扩展 Rust 和前端应用偏好类型，新增 `plugin_alias_overrides` 默认空 map，并保持旧偏好文件缺字段可读。
4. 实现别名归一化和覆盖层合成 helper，并补充 focused 测试。
5. 更新 Launcher 顶部插件名显示和搜索 helper，使其使用本地化插件名与有效别名。
6. 在设置插件中新增插件别名页面和 i18n 文案。
7. 运行 Rust/Tauri 与前端构建、检查和相关单元测试。

回滚策略：如果实现中发现别名覆盖层影响偏好稳定性，可以先保留 `display_names` contract 与搜索英文/当前语言名能力，延后设置页别名管理；但归档前必须确保 specs 与实际实现一致。

## Open Questions

无。已确认别名不需要 i18n，大小写不敏感，并采用默认别名禁用/隐藏加重新启用的覆盖层方案。
