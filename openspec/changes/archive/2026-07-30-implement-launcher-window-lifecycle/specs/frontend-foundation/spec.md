## MODIFIED Requirements

### Requirement: The application must provide a product-owned React root interface

前端应用 MUST 渲染产品自有、语义化且可访问的最小 launcher App Shell。它 MUST NOT 继续展示构建工具欢迎文案、示例交互或表现层 mock 功能。App Shell MUST 展示当前 locale 下的 lensX 产品身份和说明，并 MUST 提供一个本地受控、可输入但尚不产生搜索结果的 launcher 输入。App Shell MUST NOT 暗示尚未实现的 action 搜索、执行、设置或插件能力已经可用。

#### Scenario: 启动应用

- **WHEN** React 应用完成根渲染
- **THEN** 页面包含可访问的 main 内容区域
- **THEN** 页面以当前 locale 展示 lensX 产品身份和产品说明
- **THEN** 页面展示具有可访问名称和本地化 placeholder 的 launcher 输入
- **THEN** 页面不展示 Rsbuild 欢迎文案或示例交互

#### Scenario: 在最小 launcher 输入中编辑文本

- **WHEN** 用户在 launcher 输入中输入或删除文本
- **THEN** 输入以 React 本地状态反映当前文本
- **THEN** 页面不生成模拟搜索结果或模拟 action

#### Scenario: 检查不可用能力

- **WHEN** 用户查看最小 launcher App Shell
- **THEN** 页面不展示搜索结果列表、设置入口、模拟 action 或插件入口
- **THEN** 页面不把计划中的能力描述为已实现
