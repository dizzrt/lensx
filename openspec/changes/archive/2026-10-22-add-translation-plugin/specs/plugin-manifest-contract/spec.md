# Spec Delta

## MODIFIED Requirements

### Requirement: Compatibility status must be separate from Manifest validity

当前 LensX 版本 MUST 为 `0.1.0`，当前 Host API 协议 MUST 为 `0.3.0`。两种兼容范围 MUST 分别包含有效 SemVer `min_version` 与 `max_version_exclusive`，且 minimum MUST 小于 exclusive maximum。当 `min_version <= current_version < max_version_exclusive` 时，该维度才兼容。结构和语义有效、但任一范围不包含当前版本的 Manifest MUST 返回 `incompatible` 而非 `invalid`。

兼容性 MUST 只由声明范围与当前 LensX `0.1.0`、Host API `0.3.0` 判断。Host MUST NOT 静默协商旧协议目录、转换旧包、重写范围或使用来源/官方身份绕过范围。既有 `max_version_exclusive: "0.3.0"` 包 MUST 在新 Host 明确不兼容，作者需要更新 SDK、声明与重新打包。维护的 templates 与 ConfigLens MUST 将兼容上限更新为 `0.4.0`；Translation 使用新 HTTP 方法，MUST 将最低 Host API 版本声明为 `0.3.0`。

#### Scenario: Initial current versions are within both ranges
- **WHEN** 当前 LensX `0.1.0` 与 Host API `0.3.0` 均在声明的半开范围内
- **THEN** 系统将有效 Manifest 分类为 `compatible`

#### Scenario: A current version is outside its range
- **WHEN** 当前 LensX `0.1.0` 或 Host API `0.3.0` 不在其声明范围内
- **THEN** 系统将有效 Manifest 分类为 `incompatible`
- **THEN** 不使用 alias、migration rule 或隐式目录协商满足范围

#### Scenario: A current version equals its exclusive upper bound
- **WHEN** 当前 LensX 或 Host API 版本等于对应 `max_version_exclusive`
- **THEN** 系统将有效 Manifest 分类为 `incompatible`
- **THEN** 不将其错误描述为 Manifest 结构损坏

#### Scenario: A compatibility range is empty or inverted
- **WHEN** 任一范围满足 `min_version >= max_version_exclusive`
- **THEN** 系统将 Manifest 分类为 `invalid`
- **THEN** diagnostic 指向无效兼容范围
