## Why

当前 Host 已能通过 Plugin Registration Contract 读取注册插件及其规范化 Manifest，但这些插件贡献的 Action 尚未进入 Launcher；现有 Registry 也只有一次性注册能力，无法随插件 registration revision 安全替换或注销 provider Action。Task 2.3 需要补齐这层受信任投影，同时保持搜索、Dispatcher 和插件信任边界不分叉。

## What Changes

- 新增 Host 私有的 Plugin Action provider adapter，订阅现有 Plugin Registration adapter，并从同一 revision 的 snapshot/detail 投影合格插件的 Manifest Action。
- 以 `plugin_id` 作为 `owner_id`，以 `<plugin_id>.<local_action_id>` 作为全局 `action_id`，原样保留规范化的本地化标题、描述和 Action 自有关键词。
- 只为 enabled、双维度 compatible、未 quarantine 的健康插件发布 `enabled: true` Action；插件失效、消失或投影失败时 fail closed，原子注销该插件的整批 Action，且不影响其他插件或 `lensx.core` Action。
- 扩展现有 Host Action Registry，使受信任 provider 可以按 owner 原子替换或注销自己的完整 Action 批次，并拒绝跨 owner 覆盖、重复 ID 和部分提交。
- 由 Host 为 Page-only target 合成 executor，使所有投影 Action 继续通过现有 Dispatcher；插件 Manifest、Registry snapshot 和搜索结果均不暴露 executor 或 Page target。
- 保持一个统一 Launcher 搜索路径，不增加插件专用搜索、排序、分区、推荐或 `default_action_id` 加权逻辑；recent/pinned 继续只持久化 Action ID 并自然隐藏暂时缺失的 Action。
- 首版不把 Manifest package-local asset path 转换为 Launcher Host icon；投影 descriptor 省略该 icon 并使用现有稳定 fallback，安全插件资源 icon 留给后续资源服务能力。
- Task 2.3 交付可注入、可独立验证的 Page 打开边界；在 Task 2.4 建立 Plugin Page Registry 与导航前，生产组合不发布必然无法导航的插件 Action。
- 本 change 不安装、启用、禁用、卸载或执行插件，不建立 Plugin Page Registry、iframe Runtime、权限决策、插件管理 UI 或安全资源服务。

## Capabilities

### New Capabilities

- `plugin-action-projection`: 定义 Registration snapshot/detail 到统一 Launcher Action 的资格过滤、确定性映射、revision 收敛、fail-closed 生命周期、Host executor 和明确非目标。

### Modified Capabilities

- `launcher-action-core`: 为唯一 Host Registry 增加按 provider owner 原子替换与注销完整 Action 批次的要求，同时保护其他 owner 和现有内建 Action。

## Impact

- 主要影响 `src/app/plugins/registration/` 与 `src/app/launcher/actions/` 之间的新 Host 私有投影层、默认 Action service 的可注入组合边界，以及相应 Rstest 测试。
- 复用现有 `@lensx/plugin-contract` 规范化 Manifest 类型、Plugin Registration Desktop Adapter、Launcher Registry、搜索、Dispatcher 和 Action collections；不改变公共 Plugin Contract、SDK、Tauri Registration wire contract 或 Rust Plugin Manager Store format。
- 更新 `docs/en/architecture/overview.md`、`docs/en/architecture/extension-platform.md` 及其 `docs/zh/` 镜像，明确已交付投影核心与仍待 Task 2.4/4.1 完成的导航和资源边界。
- 不新增 Runtime dependency、组件库、用户可见文案或 UI surface；Task 2.4 接通生产导航前，用户界面保持现状。
