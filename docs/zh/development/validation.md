# 验证

## 原则

验证属于实现的一部分，不是后续补充。每个 OpenSpec task 列表都必须以明确的最终验证任务结束，
每个已经完成的变更都必须为受影响的前端和 Rust 层提供可复现证据。

修复此次变更引入的 warning 和 error。修复后，先重新执行失败命令，再重新执行完整的最终验证集合。

## 前端验证

执行单元测试和组件测试：

```bash
pnpm run test
```

对源码和测试执行 TypeScript 静态检查：

```bash
pnpm run typecheck
```

执行 Biome 格式和 lint 检查：

```bash
pnpm run check
```

构建前端生产产物：

```bash
pnpm run build
```

这四个标准命令会验证根应用和每个实际 workspace 成员。成员缺少对应 lifecycle script
或返回非零状态时，根命令会失败。修改聚合或依赖规则时，直接运行 workspace 专项回归：

```bash
pnpm run test:workspace-lifecycle
pnpm run test:workspace-boundaries
pnpm run check:workspace-boundaries
```

`pnpm run test:watch` 只用于开发过程。最终证据必须使用非 watch 命令。

## Plugin Contract 验证

修改 `@lensx/plugin-contract`、其 Schema、Host 消费方或 Rust 模型时，必须运行：

```bash
pnpm run check:plugin-contract
```

该门禁验证生成类型 drift、package tests、Host 边界、TypeScript/Rust 共享 fixtures、打包文件
清单与 exports，以及从真实 tarball 安装的隔离外部消费者。tarball smoke test 是必需项，因为
workspace link 可能掩盖缺失的声明、Schema 文件、export 目标或 runtime 依赖。

## Rust 验证

检查 Rust 格式：

```bash
pnpm run src-tauri:format:check
```

执行 Rust 测试：

```bash
pnpm run src-tauri:test
```

执行 Rust 静态编译检查：

```bash
pnpm run src-tauri:check
```

变更引入 Clippy 等更严格 Rust 工具时，在 OpenSpec task 列表中记录并执行准确命令。

## 文档验证

对于文档变更：

- 比较 `docs/en/` 和 `docs/zh/` 的相对 Markdown 路径；
- 确认两个语言索引都链接到每个持续维护的主题；
- 确认相对 Markdown 链接能够解析；
- 确认英文和简体中文标题及语义一致；
- 确认两个 README 包含一致的接入内容；
- 确认正式产物没有引用或依赖临时材料；
- 确认规划中的功能没有被描述为已经实现。

## 范围规则

- 仅前端变更仍需执行前端测试、typecheck、check 和 build 集合。
- 仅 Rust 变更仍需执行 Rust format、test 和 check。
- 跨边界或仓库级变更执行两侧完整集合。
- 每个 OpenSpec task 列表都要记录前端和 Rust 验证。一侧确实不受影响时，记录理由而不是省略。
- 仅文档变更必须执行文档验证，以及格式化或生成文件影响的仓库检查。

## 最终检查清单

- [ ] 变更行为具有有效测试。
- [ ] 前端验证通过，或已经记录不受影响的理由。
- [ ] Rust 验证通过，或已经记录不受影响的理由。
- [ ] 英文文档和简体中文镜像一致。
- [ ] OpenSpec 产物和稳定 spec 保持一致。
- [ ] 没有此次变更引入的 warning 或 error。
- [ ] 已重新执行失败命令和完整最终验证集合。
- [ ] 已报告剩余限制和未验证假设。
