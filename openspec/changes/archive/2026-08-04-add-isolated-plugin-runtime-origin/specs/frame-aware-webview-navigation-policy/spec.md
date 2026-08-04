## MODIFIED Requirements

### Requirement: Descendant navigation MUST match one canonical document target exactly

policy MUST对isolated-origin native custom-protocol URL与项目支持的平台translated URL进行结构化规范化，精确比较scheme class、origin scope、path scope、plugin key、version、resource path与Host-derived fragment。origin scope与path scope MUST相等；supported translated form MUST保留同一origin key而不能折叠为shared host。policy MUST拒绝旧shared `lensx-plugin://localhost`/`lensx-plugin.localhost` target、query、userinfo、port、不同/额外fragment、root-relative/absolute escape、backslash、percent/double encoding ambiguity、Unicode/punycode/uppercase scope、不同origin/scope/plugin/version/generation、Host/external origin，以及`file:`、`javascript:`、`data:`、`blob:`或外部应用scheme。normalization MUST NOT把rejected input修复、重写或fallback成allowed target。

若WKWebView对`file:`、no-op `javascript:`或same-document `blob:`在进入`WKNavigationDelegate`前阻止其形成document navigation，real evidence MAY记录有限`blocked_by_webview`，但 MUST同时证明original document保留、没有new-window/download/external handoff且navigation callback count未伪造增加。该结果 MUST NOT记录为policy `deny`；policy normalization仍 MUST在平台未来报告这些target时拒绝。

#### Scenario: Allow the exact active plugin document

- **WHEN**descendant frame请求active lease中的exact current isolated-origin entry document与exact Host-derived fragment
- **THEN**policy允许document navigation
- **THEN**decision不授予其他document、origin、scope、generation、fragment或browser capability

#### Scenario: Reject a cross-plugin or stale target

- **WHEN**descendant请求another plugin、another origin/scope/version/generation、old lease或replacement前entry document
- **THEN**policy在commit前拒绝navigation
- **THEN**Resource Service URL即使曾有效或path看似匹配也不能成为current Page document

#### Scenario: Reject a shared-host target

- **WHEN**descendant请求旧shared native/translated host，或translated adapter丢失isolated origin key
- **THEN**normalization返回deny且不回退到path-only comparison
- **THEN**downstream Runtime不能在shared browser origin上激活`allow-same-origin`

#### Scenario: Reject an encoded navigation bypass

- **WHEN**target使用query、userinfo、default/explicit port、backslash、percent/double encoding、case collision、Unicode/punycode scope、额外fragment或dangerous scheme伪装成current entry
- **THEN**normalization返回deny而不是decode、repair或拼接为allowed target
- **THEN**bounded diagnostic不回显raw target、origin或scope

#### Scenario: Load package subresources through the existing service

- **WHEN**allowed plugin document请求current isolated origin/scope中的CSS、JavaScript、image、font、JSON或Wasm普通resource
- **THEN**navigation policy不把subresource当作新document authorization
- **THEN**Plugin Resource Service继续独立验证origin/scope、generation、path、MIME、payload ownership与lifecycle，且本capability不放宽resource contract或CORS
