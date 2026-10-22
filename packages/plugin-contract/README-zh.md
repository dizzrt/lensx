# @lensx/plugin-contract

公共 lensX 插件 Manifest 与 Host API 语义 Schema、生成输入类型、版本常量、不可变目录、
诊断及确定性纯 validator。

包只校验静态作者输入，不发现、安装、注册、授权、渲染、分发或执行插件。Host API
capability 检查是能力发现分支，不证明 transport 或 handler 已存在：

```ts
import { validatePluginRuntimeContext } from '@lensx/plugin-contract';

declare const unknownContext: unknown;
const result = validatePluginRuntimeContext(unknownContext);
if (result.status === 'valid' && result.value.capabilities.includes('storage.get')) {
  // The typed SDK may call storage.get while this current Context declares it.
}
```

声明的 Schema entry 为 `/schema`、`/manifest.schema.json`、`/host-api-schema` 和
`/host-api.schema.json`，其他 deep import 均为私有。

Contract `0.3.0` 拥有 Manifest `0.4.0` 与 Host API `0.3.0`，包含有界的
`http.request` 语义契约，自身不执行网络 I/O。插件调用真实 Host provider 前，仍需当前
capability 快照及兼容的 SDK/Manifest。
