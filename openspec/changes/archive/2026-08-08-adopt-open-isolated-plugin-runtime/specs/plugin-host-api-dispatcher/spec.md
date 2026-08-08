## MODIFIED Requirements

### Requirement: Production Host MUST route requests through a closed Dispatcher bound to a trusted Session

生产 Host MUST 通过绑定当前 trusted Runtime Session identity 的 closed Dispatcher 路由 Host API `0.2.0` request。Dispatcher MUST 只组合 base navigation/context、plugin-scoped storage 与其他当前非特权 provider，MUST NOT 组合 permission service、grant source、native clipboard provider、任意 Tauri command 或普通 Web network/Worker mediation。每个 request 仍 MUST 经过 strict Contract validation、identity/currentness、cancellation、deadline 与 bounded response validation。

#### Scenario: 当前 Session 调用非特权方法
- **WHEN** 当前插件调用 catalog 中实际 composed 的 navigation、context、storage 或 close 方法
- **THEN** Dispatcher 根据 Session identity 与 Host facts 执行且返回 Contract-valid result
- **THEN** plugin-provided identity、source 或 Web 行为不能改变 Host target

#### Scenario: 插件调用已移除或私有方法
- **WHEN** 插件调用 clipboard、permission mutation、Tauri、unknown 或 Host-private method
- **THEN** Dispatcher 在 native effect 前返回稳定 closed-contract failure
- **THEN** 安装、official source、network 或 Worker 上下文不形成 bypass

### Requirement: Runtime Context MUST derive from current Host facts and real provider availability

Dispatcher MUST 从当前 Host API `0.2.0` catalog、Session identity、locale/theme source 和实际 composed 非特权 provider 生成完整 Context。它 MUST NOT 读取 Manifest permission requests、persisted grants、permission catalog 或 clipboard availability，也 MUST NOT 把普通 Web capabilities 列入 Host API method capabilities。

#### Scenario: 只有基础和 storage provider 可用
- **WHEN** 当前 Session 绑定 base 与 scoped-storage provider
- **THEN** Context 只列出对应 `0.2.0` methods，排序且唯一
- **THEN** clipboard、permission、network 和 Worker 不出现在 method list

#### Scenario: 旧权限事实仍存在于隔离记录
- **WHEN** recovery 遇到旧 record 或 stale frontend payload 中的 permission/grant 字段
- **THEN** Dispatcher 忽略其 authority 并拒绝不兼容 boundary data
- **THEN** Context 不投影旧 clipboard capability

### Requirement: Delivery MUST prove real production wiring without absorbing later capabilities
Production delivery MUST 覆盖 Host API `0.2.0` Context、Page close、same-plugin Action、五个 storage methods、SDK/Port round-trip、currentness/cancellation/cleanup 与 WKWebView evidence，并证明 clipboard、permission mutation 与 arbitrary Tauri methods unavailable。

#### Scenario: production Dispatcher loops pass
- **WHEN** external plugin 通过 real Session 调用全部 current methods
- **THEN** current providers 成功且 removed native/permission methods fail closed

