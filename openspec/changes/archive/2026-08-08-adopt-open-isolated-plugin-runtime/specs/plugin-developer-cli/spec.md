## MODIFIED Requirements

### Requirement: Inspect MUST classify an existing package without installation or execution

`inspect` MUST 只返回 package 内容、Manifest `0.2.0`、compatibility 与 bounded diagnostics；它 MUST NOT 安装、注册、执行、创建 Runtime/Session、授予 permission 或生成 Host authority。

#### Scenario: inspect compatible package
- **WHEN** developer inspect 一个 canonical compatible `.lxp`
- **THEN** CLI 返回 safe content facts 且无 installation、grant 或 Runtime state

### Requirement: CLI and Host MUST agree on package-content classification while preserving Host-private authority

CLI 与 Rust inspector MUST 对相同 bytes 的 content semantics 一致；CLI 结果 MUST NOT 声称 installation authorization、source trust、signature 或 native Host authority，Host 仍独立重验 private conditions。

#### Scenario: CLI 接受但 Host private check 失败
- **WHEN** CLI content validation 通过而 Host currentness、Store 或 lifecycle check 失败
- **THEN** Host 可 fail closed，CLI acceptance 不产生 authority

