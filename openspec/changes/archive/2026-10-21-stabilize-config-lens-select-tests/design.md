# Design

## Context

动机见 [proposal.md](proposal.md)。本次保留设计文档，是因为测试需要区分定位前后的两条关闭路径，并明确 Happy DOM 中人工完成动画的边界，避免修复再次依赖机器速度。

当前 `ConfigLensPage` 将 `value` 和 `onChange` 传给真实 Semi Select。`handleLanguage` 收到 Auto 后会同步清空手动语言证据，并通过 `analyze` 调用测试 harness 的同步 `scheduleAnalysis`。现有 `choose` 仅执行打开、查找选项和点击，首次 TOML 选择还使用单独的手写点击。

锁定的 Semi `2.101.1` 在受控单选中通过 `closeCb` 等待 `popoverClose` 后发出 `onChange`。该事件来自 Tooltip 退出动画完成后的 `afterClose`；动画条件是 `motion && isPositionUpdated`。Happy DOM 无实际布局和 CSS 动画播放，Semi 的定位兜底计时器与测试点击的先后顺序因此会影响是否等待动画。依赖源码足以确立异步契约，但此前 CI 失败是否恰好跨过该计时器边界仍是推断，尚无运行时轨迹。

既有 `official-config-lens-plugin` 和 `repository-continuous-integration` 规格已经覆盖应验证的产品与 CI 行为。本次使用 `skip_specs: true`，不创建或同步需求变更。

## Goals / Non-Goals

**Goals:**

- 将一次选择的完成点定义为真实 Select 已提交选择、Page 已收到对应回调，非空输入已生成新版本分析请求。
- 无论弹层定位是否已完成，同一测试交互均能稳定工作；通过明确事件边界证明动画分支确实被覆盖。
- 限定所有模拟到当前测试的目标弹层，并在异常时清理计时器、DOM 和测试替身。

**Non-Goals:**

- 不改变生产组件、`motion` 配置、语言算法、Worker、原生代码或共享组件实现。
- 不替换真实 Select 为简化组件，不直接调用 Page 私有回调或篡改 harness 请求，不升级依赖。
- 不建立通用动画测试框架，不添加全局动画补丁、根脚本、Gate 或真实浏览器验证。

## Decisions

### 1. 在测试交互边界显式完成动画

在 `ConfigLensPage.test.tsx` 内统一打开选项、选择和完成关闭的 helper，所有语言选择调用点都使用它，包括首次 TOML、切回 Auto、过期转换结果测试和生命周期测试。

通过真实 combobox 的 `aria-controls` 定位当前 listbox，在其内部按完整名称查找选项；从 listbox 找到最近的 `role="dialog"` 包装节点，捕获该弹层及动画节点的身份。锁定版本的 Semi 将动画事件绑定在这个包装节点。点击前要求作用域结构存在且唯一；点击后，仅对同一弹层仍处于退出状态的动画节点派发 `animationend`，让 Semi 自己执行 `afterClose → popoverClose → onChange`。无动画路径允许弹层已经正常移除，不应为了派发事件而重新创建节点；动画路径缺少预期节点必须失败。不要向整个 document 的全部动画元素广播事件，也不要用只检查元素存在的宽泛选择器绕过弹层归属。

完成后等待 combobox 显示预期标签和弹层关闭。各业务用例仍断言分析请求的 selection、source 和版本；有内容时要求新请求数量及 `selectionVersion` 正确递增，防止旧请求恰好具有相同值而误通过。空输入遵循既有不派发分析的契约，不强制等待不存在的新请求。

替代方案：仅增加 `waitFor` 不会产生 Happy DOM 缺少的动画事件；固定 sleep 会保留时序依赖；关闭生产动画违背范围。测试 mock 包装真实 Select 并设置 `motion=false` 虽可隔离动画，但绕过本次暴露的关闭契约，因此不采用。

### 2. 使用局部受控计时器覆盖两条路径

专门回归用例使用 Rstest 的局部 fake timers，并通过 `act` 推进已核对的 Semi 定位兜底任务。当前锁定实现的兜底为 50ms；推进虚拟计时器是驱动已知任务，不是等待真实时间。测试必须再确认目标弹层已经进入已定位的动画状态，不能仅以“已推进 50ms”作为路径覆盖证据。

| 路径 | 驱动方式 | 必须观察的结果 |
| --- | --- | --- |
| 定位尚未完成 | 打开后不推进定位计时器，再选择 | 选择正常提交；关闭 helper 兼容无需退出动画的路径 |
| 定位已完成 | 推进定位任务，确认当前弹层状态并完成必要的入场事件，再选择 | 退出结束前仍保留旧选择、旧版本和请求数；目标弹层收到退出结束后才提交一次新选择和新请求 |
| TOML 返回 Auto | 使用同一交互贯穿编辑、清空、重填和 Auto 选择 | 手动锁定期间不改变语言；返回 Auto 后 `previousAutoLanguage` 为 `undefined`，旧 XML 结果仍不能覆盖新选择 |

延迟路径回归必须与修复的 helper 相连，不能只在独立测试里手工完成全部正确流程而让原 helper 继续依赖快路径。保留原业务断言，覆盖英文/简体中文与明暗主题的相关组合，确保 helper 不依赖固定英文标签。

fake timers 只用于这些分支用例，使用可等待的 `act` 协调 React 更新；分支用例通过显式推进和同步状态断言证明先后关系，不依赖 `waitFor` 或 `findByRole` 的轮询来推进定位。清理时先卸载，再有界清理剩余计时器并恢复真实计时器和局部替身。避免无界 `runAllTimers`，不推进无关 Worker、Monaco 或其他测试的定时任务；不将 fake timers 扩展到共享 setup。普通业务用例仍可在完成目标动画后使用条件等待，但不能将尚未推进的虚拟计时器交给普通等待函数。

### 3. 保持验证入口和文档归属

测试仍由 `plugins/config-lens/rstest.config.ts` 的现有 discovery 发现。完整验证复用 `pnpm run gate -- ci-plugins`，由该 Gate 准备公共依赖并运行所有直接插件的 `typecheck`、`test`、`check`、`build` 和声明的纯 Node `test:e2e`，不修改编排或用文件级测试替代 Gate。

在现有 `docs/en/development/config-lens.md` 及 `docs/zh/development/config-lens.md` 说明：测试使用真实 Select 和显式动画完成事件验证 Page 编排，这不证明浏览器动画渲染或操作系统交互。文档路径与导航保持不变。

适用的最终前端验证保留根 `test`、`typecheck`、`check`、`build`。Rust、Host 与 vendor 未受影响，在任务证据中明确记录 Rust 格式、测试、静态检查和构建不适用的原因。若实施中出现需要修改生产代码的情况，应停止扩展并报告与本次范围的冲突。

## Risks / Trade-offs

- [依赖内部弹层包装或类名可能随版本变化] → 将依赖选择器局限在一个 helper 中并解释用途；以作用域节点、阶段变化和实际业务结果共同断言，结构不匹配时明确失败。
- [只跑到无动画快路径造成假通过] → 动画路径先证明退出结束前未提交，再证明完成事件后恰好一次提交，不把多次偶然通过视为回归覆盖。
- [计时器和 portal 泄漏污染其他用例] → 局部控制、失败也清理、恢复真实计时器，并运行整个测试文件和完整插件 Gate。
- [人工事件被误当成浏览器验证] → 文档和验证记录明确 Happy DOM 建模范围，不报告真实动画或平台验收。
- [当前机器无法复现远端失败] → 用确定性分支驱动验证机制；单独记录远端原始失败与修复后的本地结果，不声称已重新通过 GitHub Actions。

## Migration Plan

无需产品或数据迁移。先建立可确定性暴露旧 helper 假设的回归，再统一交互并保留现有断言，随后同步文档并完成验证。回滚只涉及本次测试与文档；没有依赖、配置或产物协议迁移。同步和归档阶段记录本次无 delta specs，仍执行规定的同步检查与范围审计，不因跳过 specs 而跳过归档准备。
