# Spec Delta

## MODIFIED Requirements

### Requirement: Launcher outer surfaces must use consistent rounded corners and shadows

Launcher 外表面 MUST 保持统一圆角裁剪、主题背景和 macOS 原生阴影，MUST NOT 添加前端 CSS 外阴影。macOS 上的裁剪 MUST 覆盖 Host 与插件的完整原生内容合成结果，保持现有 18 个逻辑像素的四角外轮廓；布局、交互、resize 权限及内部控件阴影 MUST 保持原有语义。

#### Scenario: Display Home and Search surfaces

- **WHEN** the Launcher displays Home or Search, including empty collections or
  a search with no results
- **THEN** the shared outer surface retains its rounded corners, clipping, and
  current theme background without drawing a CSS shadow
- **THEN** the macOS native window shadow remains enabled, and existing window
  dimensions and input interactions remain unchanged

#### Scenario: Enter or leave a page

- **WHEN** the user opens a Host Page or plugin Page, or closes a page to return
  to Home
- **THEN** the shared outer surface continues to use the same rounded-corner
  and shadow policy without adding an outer CSS shadow based on page origin
- **THEN** page layout, close behavior, focus restoration, and existing native
  resize permissions for plugin Pages remain unchanged

#### Scenario: Return Home after page content fails

- **WHEN** the current page displays its existing failure feedback and the
  user subsequently closes it to return to Home
- **THEN** both the failed page and the restored Home retain the shared outer
  rounded corners and current theme background without adding a CSS shadow
- **THEN** failure feedback, page context, close controls, and focus restoration
  continue to follow their existing contracts

#### Scenario: Switch locale and theme

- **WHEN** the Launcher uses or switches between `en-US`, `zh-CN`, and light
  and dark themes
- **THEN** the outer surface draws no CSS shadow while its rounded corners and
  theme background remain effective
- **THEN** the macOS native shadow is not disabled, and no additional product
  copy, focus target, or substitute border is introduced

#### Scenario: Render a rounded Launcher surface with native shadow

- **WHEN** Home, Search, a Host page, or a plugin page uses the shared outer surface
- **THEN** The shared Launcher outer surface MUST preserve its existing rounded outline,
  content clipping, and theme background across Home, Search, Host Pages, and
  plugin Pages. The frontend MUST NOT add a CSS shadow to this outer surface.
  The macOS desktop window MUST retain its existing native window shadow so
  frontend shadows do not add edge artifacts at transparent rounded corners and
  window boundaries.

#### Scenario: Switch presentation without changing layout or interaction

- **WHEN** outer-surface shadow policy is applied in any supported locale, theme, or page transition
- **THEN** This policy MUST remain consistent in `en-US`, `zh-CN`, and light and dark
  themes. Shadow changes MUST NOT alter logical window dimensions, content
  layout, dragging, keyboard navigation, focus restoration, or native resize
  permissions for plugin Pages. They MUST NOT alter shadows belonging to inner
  controls or overlays.

#### Scenario: Clip opaque plugin content at the native outer corners

- **WHEN** macOS Launcher 中的插件内容以不透明背景铺到 slot 左右和底部边缘
- **THEN** Host 和插件的最终内容 MUST 共同受完整窗口四角外轮廓裁剪，左右下角 MUST 与首页保持相同的逻辑半径
- **THEN** 外轮廓之外 MUST 保持透明，MUST NOT 由插件背景、主题色遮片或新增外边框填充
- **THEN** 该行为 MUST 不依赖插件使用透明背景、添加圆角 CSS 或适配特定 SDK

#### Scenario: Preserve the outline while native size or scale changes

- **WHEN** macOS Launcher 在固定 surface 尺寸切换、允许的用户 resize、显示器工作区适配或 backing scale 变化后呈现内容
- **THEN** 裁剪 MUST 对应当前完整内容边界，半径 MUST 保持 18 个逻辑像素，不得因物理像素倍率变化而变大或变小
- **THEN** 原有窗口尺寸、resize 约束、原生边缘拖动以及内容 slot 几何 MUST 保持既有语义

#### Scenario: Retain the outline throughout presentation lifecycle

- **WHEN** macOS Launcher 首次呈现，或在 Home、Search、Host Page、插件加载/就绪/失败/重试状态间转换，或隐藏后恢复
- **THEN** 每个被呈现的内容状态 MUST 已受统一外轮廓裁剪，不得先暴露矩形插件再补上圆角
- **THEN** 裁剪 MUST NOT 创建额外焦点目标、重新加载文档、重建 Session 或改变当前文本编辑目标
- **THEN** 关闭旧 Page、异步销毁和旧 attempt 的延迟完成 MUST NOT 移除当前窗口的裁剪
