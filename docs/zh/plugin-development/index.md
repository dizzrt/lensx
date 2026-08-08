# 插件开发

这里是 lensX 当前可验证插件能力面向外部开发者的权威入口。先选择一条完整教程，
需要查询契约细节或恢复方式时再进入参考文档。编写插件无需了解 Host 实现细节。

## 能力状态

状态具有严格含义：

- **已交付**：公共产物或 Host 工作流已经存在，并有 focused gate 覆盖。
- **条件可用**：能力只在显式启用的 Host build、可用 provider 或最新 session
  capability 列表中成立。
- **尚未交付**：不得据此设计发布或工作流。

| 能力 | 状态 | 含义 |
| --- | --- | --- |
| Contract、SDK、Testkit、CLI | 已交付 | 公共 package 边界和真实 tarball 已验证。 |
| 可选 Plugin UI | 已交付 | 插件自行拥有 React、React DOM、Semi Design 和 UI package。 |
| 本地 `.lxp` 安装 | 已交付 | Settings 使用 canonical Host inspection 和 preparation 边界。 |
| 官方 `.lxp` 发布流水线 | 已交付 | 未来官方插件拥有独立 Changesets、candidate、audit record 与 release；当前尚无产品插件。 |
| Development Mode | 条件可用 | 需要专用 build 和显式进程开关。 |
| Host API | 条件可用 | catalog 条目不是 authority；以最新 session capabilities 为准。 |
| npm 发布 | 尚未交付 | 仓库可以产出 tarball，但 package 尚未发布到 npm。 |
| watch/HMR、签名、Marketplace、远程更新 | 尚未交付 | 这些仍是后续独立能力。 |

## 选择教程

- 选择[框架无关教程](tutorial-framework-neutral.md)，使用浏览器 DOM、Contract、SDK
  和 Testkit。
- 选择[React 与 Semi 教程](tutorial-react-semi.md)，让插件自行拥有 React、React DOM、
  Semi Design 和可选 Plugin UI package。

两条路径都从真实 CLI 开始，创建无权限项目，验证自包含 `dist/`，使用
Development Mode 手动 reload，最后得到可通过本地安装 preparation 边界的
canonical `.lxp`。

## 参考路径

按问题选择阅读顺序：

1. [公共 package](public-packages.md)：exports、依赖角色和生命周期所有权。
2. [工具与安装](tooling-and-installation.md)：CLI、Development Mode、打包和 Settings 安装。
3. [Host API](host-api.md)：method、provider、permission、capability 和稳定错误。
4. [Runtime、权限与安全](runtime-permissions-security.md)：初始化、替换、retry、teardown 与隔离。
5. [兼容与错误](compatibility-and-errors.md)：版本维度、校验结论和排障顺序。

## 边界

Manifest 只能请求权限，不能授予权限。CLI validation 证明作者控制的字节满足公共契约，
不会安装插件或建立 Host authority。Development Mode 使用 process-local source 和手动
reload，不安装 `.lxp`。production 与 development source 共享同一 Runtime、session、
capability、permission、deadline 和隔离边界。

仓库会验证公共 package tarball，并已为未来官方 `.lxp` 插件建立 GitHub Release 流水线。
当前尚无产品官方插件，公共 package 仍未进入 npm。不得虚构 package registry 命令、产品下载
URL、自动 reload/update、签名、Marketplace 或 Host trust 能力。
