## 1. 统一 Node 开发启动器

- [x] 1.1 建立可测试的统一 launcher core、类型声明与普通/`plugin-development` mode 配置，保留插件模式默认 `plugins/`、单个 `--plugins-root <path>`、frontend capability、Rust feature 和 Host-private startup root，并让未知、重复或缺值参数在任何进程启动前失败。
- [x] 1.2 使用现有 Rsbuild JavaScript API 先创建并监听唯一开发服务器，读取且校验其实际 loopback 端口，再构造只存在于内存中的 Tauri `--config` merge：精确覆盖 `build.devUrl` 并禁用重复 `beforeDevCommand`；覆盖首选 `40755` 可用和被占用后端口递增的确定性 fake-server 测试。
- [x] 1.3 实现单调、幂等的 server/Tauri child 生命周期，覆盖 server 失败不 spawn、child spawn 失败、零/非零 exit、`SIGINT`/`SIGTERM` 至多转发一次、late event、重复 cleanup、主要退出结果保留和安全有界诊断，且不使用临时端口/配置文件或先探测后释放 socket。
- [x] 1.4 将 `pnpm run app:dev` 登记为普通桌面 operational lifecycle，让稳定 `dev:plugin-development-mode` 委托同一启动器并保留现有 CLI；保持 `pnpm run dev` 为独立前端入口，更新 `ROOT_SCRIPT_POLICY` 与 source-policy 测试而不新增 `test:*`、`check:*` 或 Change 专用 alias。

## 2. Rust 可信开发 Origin 与插件 CSP

- [x] 2.1 从 Tauri runtime config 建立 Host-private 可信 App target 解析/校验，开发态只接受精确 `http://localhost:<port>/`，拒绝缺失端口、非 HTTP/localhost、credentials、非根 path、query、fragment 和不规范输入，并让主窗口导航策略继续消费该单一事实源。
- [x] 2.2 将开发态插件 Runtime CSP 改为从可信 App target 构造不可变 owned policy，仅替换生产 profile 的精确 `frame-ancestors`；让 Plugin Resource Service 安全持有 owned CSP，禁止 Manifest、请求、header、前端消息或独立端口环境变量影响策略。
- [x] 2.3 增加 Rust 单元与漂移测试，覆盖多个动态端口、无效 origin fail-closed、导航 target/CSP ancestor 一致、所有其他 CSP directive 不变、GET/HEAD 资源响应使用当前 owned policy，以及发布构建继续使用 `tauri://localhost` 且不创建 HTTP listener。

## 3. 确定性契约与 Gate 治理

- [x] 3.1 扩展 Rstest launcher 覆盖 ordinary/plugin mode 隔离、环境设置时序、实际端口到 Tauri JSON 的精确传播、server-before-child 顺序、spawn/exit/signal 竞态、幂等 cleanup、安全诊断和插件开发现有 startup root 行为；所有 server/child 均使用 fake，不执行真实 listen 或 GUI。
- [x] 3.2 在 typed Gate registry 中显式注册 read-only `development-launcher` Gate，组合 launcher Rstest、Rust origin/CSP 测试和静态/文档检查，并依赖适用的 `frame-aware-webview-navigation-policy`、`plugin-development-mode` 与 `plugin-child-webview-runtime` 能力；更新 registry/governance 测试，禁止 legacy baseline、root 转发 alias、`tauri dev`、Rsbuild listener、浏览器、真实 WebView、GUI、native harness、截图、视觉基线和环境性能步骤。
- [x] 3.3 运行 `pnpm run gate -- development-launcher`、`pnpm run gate -- frame-aware-webview-navigation-policy`、`pnpm run gate -- plugin-development-mode` 与 `pnpm run gate -- plugin-child-webview-runtime`，修复所有失败并逐项记录对应实现/测试证据后再勾选本节。

## 4. 双语文档与维护入口

- [x] 4.1 更新 canonical English `docs/en/development/getting-started.md`、`docs/en/development/validation.md` 和相关架构说明，描述 `app:dev`、前端独立 `dev`、插件开发复用、动态实际 origin、发布 `tauri://localhost`、故障恢复与确定性 Gate；同步相同路径的 `docs/zh/` 简体中文镜像并保持索引/链接语义一致。
- [x] 4.2 更新维护的配置/文档漂移断言，确保完整桌面开发不再指导直接 `tauri dev`，开发插件 CSP 不再硬编码 `40755`，`development-launcher` Gate 可解析，且 README、AGENTS、公开 package、插件 Runtime 与 CI 中没有泄漏 Host-private launcher 或端口 authority。

## 5. 最终验证

- [x] 5.1 运行完整 frontend/workspace 验证：`pnpm run test`、`pnpm run typecheck`、`pnpm run check`、`pnpm run build`；修复本 Change 引入的每个 warning/error，重跑失败命令后再重跑本组全部命令。
- [x] 5.2 运行完整 Rust 验证：`pnpm run src-tauri:format:check`、`pnpm run src-tauri:test`、`pnpm run src-tauri:check`、`pnpm run src-tauri:build`；修复本 Change 引入的每个 warning/error，重跑失败命令后再重跑本组全部命令。
- [x] 5.3 运行 `pnpm run gate -- ci-lensx` 与 `pnpm run gate -- ci-plugins` 的本地确定性 Gate；不得增加或执行浏览器、真实 WebView、GUI、Launch Services、native harness、截图、视觉基线、云端或 target-environment 性能验证。
- [x] 5.4 运行 `openspec validate add-unified-development-launcher --strict`、`openspec validate --all --strict` 与 `git diff --check`；扫描 root manifest、CI、维护文档、稳定规格和 active source，确认没有 Change ID alias、移除入口、直接 Rstest 文件列表 root script、递归 check chain、旧 `40755` CSP、stale dispatcher 或 retired environment-validation 引用，再确认所有任务均有证据。
