## ADDED Requirements

### Requirement: Dispatcher authority MUST derive only from the current Child WebView Session
Production dispatch MUST accept a request only after native source binding and RPC validation identify the current Child WebView Session. Dispatcher MUST continue to derive plugin/Page/capability/storage namespace from trusted Session facts and MUST receive no plugin-provided WebView label, native handle, origin token, bridge object or Tauri command.

#### Scenario: Current WebView calls a supported method
- **WHEN** a validated bridge request reaches Dispatcher from the current ready Session
- **THEN** existing Host API semantics execute for that Session only

#### Scenario: Old WebView calls a valid method
- **WHEN** a replaced or destroyed source sends an otherwise valid request
- **THEN** request is rejected before provider invocation with zero side effect
