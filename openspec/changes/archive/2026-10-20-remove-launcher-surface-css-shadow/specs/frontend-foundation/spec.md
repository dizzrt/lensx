# Spec Delta

## ADDED Requirements

### Requirement: Launcher 外层表面必须统一圆角与投影表现

Launcher 共享外层表面 MUST 在 Home、Search、Host Page 和插件 Page 中保留现有圆角轮廓、内容裁剪与主题背景。前端 MUST NOT 在该外层表面叠加 CSS 投影；macOS 桌面窗口 MUST 保留现有原生窗口投影，以避免前端投影在透明圆角与窗口边界处形成额外残边。

该表现 MUST 在 `en-US`、`zh-CN` 以及浅色、深色主题下保持一致。投影调整 MUST NOT 改变窗口逻辑尺寸、内容布局、拖动、键盘导航、焦点恢复或插件 Page 的原生缩放权限，也 MUST NOT 改变内层控件与浮层自身的投影。

#### Scenario: 展示首页与搜索表面

- **WHEN** Launcher 展示 Home 或 Search，包括集合为空或搜索无结果的状态
- **THEN** 共享外层表面保留圆角、裁剪和当前主题背景，且不绘制 CSS 投影
- **THEN** macOS 原生窗口投影保持启用，原有窗口尺寸和输入交互保持不变

#### Scenario: 进入或退出页面

- **WHEN** 用户打开 Host Page 或插件 Page，或关闭页面回到 Home
- **THEN** 共享外层继续使用相同圆角与投影策略，不因页面来源而增加外层 CSS 投影
- **THEN** 页面布局、关闭操作、焦点恢复及插件 Page 的既有缩放权限保持不变

#### Scenario: 页面内容失败后返回首页

- **WHEN** 当前页面显示既有失败反馈，随后用户关闭页面回到 Home
- **THEN** 页面失败状态及恢复后的 Home 均保留共享外层圆角与当前主题背景，不叠加 CSS 投影
- **THEN** 失败反馈、页面上下文、关闭控件和焦点恢复仍遵循既有契约

#### Scenario: 切换语言与主题

- **WHEN** Launcher 使用或切换 `en-US`、`zh-CN` 及浅色、深色主题
- **THEN** 外层表面均不绘制 CSS 投影，圆角与主题背景保持有效
- **THEN** macOS 原生投影不被禁用，也不引入额外产品文案、焦点目标或边框替代物
