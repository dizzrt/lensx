# Proposal

## Why

Plugins CI 在提交 `2787a7152c2f3824a2f8e49666c4e9b100b7770e` 的 ConfigLens 测试中，切回 Auto 后仍读到手动 TOML 请求。现有测试只等待选项出现，却没有完成受控 Semi Select 关闭弹层后才提交选择的生命周期；Happy DOM 不自动播放 CSS 动画，使结果可能依赖执行速度。

## What Changes

- 统一 ConfigLens 组件测试的语言选择交互，在真实 Semi Select 上完成目标弹层的退出动画，并等待选中值及分析请求更新后断言。
- 覆盖弹层尚未完成定位的无动画路径和已完成定位的动画路径，保留手动锁定、清空、切回 Auto 清除手动证据以及过期结果失效的现有断言。
- 同步更新 ConfigLens 英文开发文档及简体中文镜像，说明测试所建模的动画事件边界。
- 复用现有 `ci-plugins` Gate，实施后重跑失败测试、相关测试文件及完整 Gate；保留适用的全量前端验证与归档前审计任务。
- 目标是让测试稳定验证既有行为。用户可见交互、生产代码、依赖版本、工作流、Gate 定义和根脚本均保持不变；不新增浏览器、WebView、GUI 或截图验证，不以重试或固定等待掩盖竞态。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

无。`official-config-lens-plugin` 已规定手动语言锁定、显式返回 Auto 及过期结果隔离；`repository-continuous-integration` 已规定插件验证阶段和失败后的完整入口复验。本次仅修复这些既有要求的测试实现，不改变规格级行为，因此在 `.openspec.yaml` 中声明 `skip_specs: true`，不创建 delta specs。

## Impact

- 主要实现范围：`plugins/config-lens/tests/ConfigLensPage.test.tsx` 中的选择 helper、现有调用点和针对动画分支的回归用例。测试辅助逻辑优先保持在该文件内，避免影响其他测试套件。
- 文档范围：`docs/en/development/config-lens.md` 与对应的 `docs/zh/development/config-lens.md`，只补充确定性测试说明，不新增文档或调整导航。
- 不修改 `plugins/config-lens/src/`、Host、Rust、公共插件包生产代码、样式、Manifest、锁文件及运行时依赖；没有 API、数据迁移或发布行为变化。
- 本提案依据 [失败的 GitHub Actions 作业](https://github.com/dizzrt/lensx/actions/runs/39575500470/job/119139890400) 和已检查的锁定依赖源码。此前本地重复测试和插件全套测试通过仅说明当前失败具有时序敏感性，不作为修复后的验证结果，也不证明已动态复现 CI 的具体动画分支。
