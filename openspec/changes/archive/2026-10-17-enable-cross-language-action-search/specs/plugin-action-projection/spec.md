# Spec Delta

## MODIFIED Requirements

### Requirement: Projected Actions must reuse search and collections without provider-specific behavior

成功投影的插件 Action MUST 仅通过统一 Launcher Registry 快照进入搜索、执行和集合解析。Host 与插件 Action MUST 对全部已支持语言的 Action 标题及关键词应用相同匹配、去重计分、排序、可用过滤和上限；描述 MUST NOT 参与匹配或计分。语言回退 MUST 只服务展示，界面语言 MUST NOT 影响匹配及排序。搜索 MUST NOT 创建插件分区、来源加权、推荐或市场结果。Recent/Pinned MUST 继续只持久化稳定全局 Action ID，提供者暂时撤销时隐藏 Action 但保留其持久化 ID。

#### Scenario: One query matches a Host Action and a Plugin Action

- **WHEN** 同一查询分别匹配当前快照中 Host Action 的中文标题及插件 Action 的英文关键词
- **THEN** 二者使用相同计分规则和 `action_id` 同分排序，返回统一结果集
- **THEN** 切换界面语言不改变身份、分数及顺序，结果也不暴露私有 Manifest、执行器或注册详情

#### Scenario: A pinned Plugin Action is temporarily removed and later restored

- **WHEN** 已固定插件 Action 因提供者暂时不可用而撤销，随后以相同全局 Action ID 恢复
- **THEN** Home 在不可用期间隐藏它并保留持久化 ID
- **THEN** 重新投影后，既有集合解析可再次展示该 Action

#### Scenario: Projection preserves descriptions without making them searchable

- **WHEN** 插件 Action 的多语言标题、描述及关键词原样投影到描述符，而查询只存在于描述中
- **THEN** 搜索不返回该 Action，描述仍保留为展示元数据
- **THEN** 修改插件名称、插件整体描述、Page 标题或默认 Action 声明不会自动扩展搜索文本

#### Scenario: An invalidated provider does not remain in cross-language results

- **WHEN** 一个此前可跨语言搜索的插件变为禁用、不兼容或不在当前有效注册集中
- **THEN** 该插件撤销的 Action 不出现在任一界面语言下的结果中
- **THEN** 其他插件及 Host Action 继续使用统一搜索，且持久化收藏 ID 不被删除
