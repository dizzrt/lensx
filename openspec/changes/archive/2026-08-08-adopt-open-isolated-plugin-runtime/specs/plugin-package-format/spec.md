## MODIFIED Requirements

### Requirement: The package format must not declare Host source, signature, permission, or lifecycle facts

`.lxp` Manifest、checksums 与 payload MUST NOT 声明 Host source、installed path、digest、enabled state、legacy permission/grant fields、signature、lifecycle、Runtime Session 或 native authority。Package inspection MUST 只产生 content facts，且 official/development/external 来源结论一致。

#### Scenario: valid package 被检查
- **WHEN** `.lxp` 通过 canonical format 与 resource inspection
- **THEN** 不创建 installation、Manager、Runtime、Host API、grant、signature 或 trust 结论

