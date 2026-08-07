# 工具与安装

## 前置条件

使用 Node `>=24 <25`、pnpm `>=11 <12`、能够产出真实公共 package tarball 的 lensX build，
以及受支持的 macOS Host。公共 package 尚未发布到 npm。仓库 gate 中的 tarball override
只证明隔离消费，不是公共下载或 registry 承诺。

插件必须位于独立项目。lockfile 和 resolved module 不得指向 lensX checkout、根模块、
workspace protocol 或本地源码 link。

## CLI 工作流

`lensx-plugin create` 写入一个受维护模板，但不安装依赖。`build` 只运行声明的项目 build。
`validate` 读取现有项目和 `dist/`，不会构建或写 artifact。`pack` 组合 build、validation、
canonical packaging 和 self-inspection；`--no-build` 只跳过 build。`inspect` 对现有 `.lxp`
分类，但不安装。

```sh verify=command id=cli-lifecycle
lensx-plugin --help
lensx-plugin create ./my-plugin --template framework-neutral --plugin-id com.example.my-plugin --name MyPlugin
pnpm install
pnpm run test
pnpm run typecheck
pnpm run build
lensx-plugin validate --project ./my-plugin
lensx-plugin pack --project ./my-plugin
lensx-plugin inspect ./my-plugin/artifacts/com.example.my-plugin-0.1.0.lxp
```

`valid`、`incompatible` 与 `invalid` 是不同结论。CLI compatible 只证明公共 payload
acceptance。Host 会在安装前重新检查所选字节，并继续拥有 source、compatibility、
registration、grant 和 Runtime state 的 authority。

## Development Mode

Development Mode 需要专用 build 与显式进程 opt-in。从用于构建 Host 的 lensX checkout 运行：

```sh verify=command id=development-host
pnpm run dev:plugin-development-mode
```

构建插件后，在 Settings 注册其自包含 `dist/`。原生目录选择不会把路径暴露给插件代码。
Host 校验后复制一个 immutable process-local generation。重新构建后选择手动 reload。
即使字节未变化，reload 也会创建 fresh generation 和 Runtime attempt；reload 失败则保留
之前的 current generation。

这里没有 watch、HMR、自动 reload、持久 development registration 或更宽松权限模式。
移除 development registration 不会卸载正式 package，也不会清除插件数据。

## 本地安装

使用 `pack` 生成 canonical `.lxp` 并 inspect，然后在 Settings 选择 **从文件安装**。
Host prepare 精确的已选字节，展示未验证 publisher 和 requested permissions，接受显式用户决定，
并只提交该 prepared candidate。安装以空 grant 开始；随后才通过 Host permission service 应用
用户选择的敏感权限。

commit 前取消不会创建 registration。commit 后的权限应用失败可能保留已安装 package 与更窄的
实际 grant 集合；UI 会报告 partial result，而不会伪装 rollback 或 replay。

## 边界对比

| 属性 | Development Mode | 本地 `.lxp` 安装 |
| --- | --- | --- |
| 输入 | 自包含 `dist/` 目录 | Canonical package 字节 |
| Source | `development` | `external` |
| 生命周期 | Process-local | 持久化且可管理 |
| 刷新 | 显式手动 reload | 显式 replacement 工作流 |
| 是否安装 package | 否 | 是 |
| Grant | Process-local current facts | 持久 Host grant snapshot |
| Runtime 安全 | 与 production 相同 | 与 production 相同 |

生命周期和权限细节见 [Runtime、权限与安全](runtime-permissions-security.md)，分类失败见
[兼容与错误](compatibility-and-errors.md)。

