## Context

lensX 当前已经实现 Host-owned Launcher Action Core：Action 描述符是可序列化数据，执行器只存在于可信 Host Registry 中，`action_id` 与 `owner_id` 具有稳定命名关系。但是仓库还没有插件作者 Manifest、Page 模型或插件到 Action Core 的投影契约。现有架构文档只规定了外部 UI 应运行在隔离 iframe 中，不能直接访问 React、Tauri 或 Rust 内部对象。

本 change 先建立能够被 Schema、TypeScript 和 Rust 一致验证的外部插件作者契约。它只定义静态 Manifest 以及规范化/兼容性结果，不让插件代码运行，也不把插件 Action 注册到现有 Action Registry。

## Goals / Non-Goals

**Goals:**

- 以 `manifest_version: "1.0.0-dev"` 定义严格、版本化、可演进的作者输入格式。
- 明确 Plugin、Page、Action、Permission 和 Runtime 的所有权与引用关系。
- 支持一个插件贡献多个 Page 和多个 Action，并让每个 Action 只打开一个已声明 Page。
- 让 Action 标题和 `default_keywords` 成为未来 Launcher 搜索的主要语义，Plugin 只提供展示名称和来源信息。
- 将作者输入、规范化 Manifest、兼容性状态和未来 Host 注册状态分层。
- 用共享样例约束 Schema、TypeScript 和 Rust 的结构、语义、规范化及诊断一致性。

**Non-Goals:**

- 不实现插件发现、安装、包解压、启停、卸载、签名、更新或商店。
- 不创建 iframe、不加载插件资源，也不实现 postMessage、JSON-RPC、Plugin SDK 或 Host API。
- 不定义 Command Target、外部 URL Target、Native Runtime、Sidecar、后台进程或插件间通信。
- 不授予或持久化权限，也不在本 change 中定义完整 Host 权限目录。
- 不实现 Page 导航 UI、Plugin Manager、Launcher 搜索、排序、结果展示或历史/固定。
- 不修改现有 Launcher Action Registry 的行为，也不在本 change 中实现插件 Action 投影。

## Decisions

### 1. JSON Schema 是作者输入 wire format 的唯一结构来源

项目新增 Draft 2020-12 Schema 作为外部作者 Manifest 的结构真源，并保持 `additionalProperties: false`。Schema 负责字段、类型、必填项、枚举和基础格式；TypeScript 与 Rust 负责跨字段引用、图关系、权限子集、兼容区间和路径语义。

Schema 驱动生成 TypeScript 作者输入类型。Rust 模型保持显式定义，并通过相同共享样例验证一致性，避免把不稳定的生成器引入 Rust 公共边界。

替代方案是分别手写 TypeScript 和 Rust 类型。该方案容易产生字段可选性、默认值和未知字段策略漂移，因此不采用。

### 2. Manifest 使用固定顶层结构

作者输入的完整逻辑结构为：

```json
{
  "manifest_version": "1.0.0-dev",
  "plugin_id": "com.acme.workspace",
  "version": "1.2.0",
  "display": {
    "name": {
      "en-US": "Workspace Tools",
      "zh-CN": "工作区工具"
    },
    "description": {
      "en-US": "Open and manage local workspaces.",
      "zh-CN": "打开和管理本地工作区。"
    },
    "icon": {
      "kind": "asset",
      "path": "assets/plugin-icon.svg"
    }
  },
  "publisher": {
    "author": "Acme",
    "homepage": "https://example.com/workspace-tools",
    "repository": "https://github.com/acme/workspace-tools"
  },
  "compatibility": {
    "lensx": {
      "min_version": "0.1.0",
      "max_version_exclusive": "0.2.0"
    },
    "host_api": {
      "min_version": "1.0.0-dev",
      "max_version_exclusive": "2.0.0"
    }
  },
  "runtime": {
    "kind": "iframe",
    "entry": "dist/plugin.html"
  },
  "requested_permissions": [
    {
      "permission_id": "lensx.filesystem.read_selected",
      "reason": {
        "en-US": "Read folders selected by the user.",
        "zh-CN": "读取用户主动选择的目录。"
      }
    }
  ],
  "contributes": {
    "pages": [
      {
        "id": "home",
        "title": {
          "en-US": "Workspace Tools",
          "zh-CN": "工作区工具"
        },
        "route": "/",
        "icon": {
          "kind": "asset",
          "path": "assets/home.svg"
        },
        "required_permissions": []
      },
      {
        "id": "open_project",
        "title": {
          "en-US": "Open Project",
          "zh-CN": "打开项目"
        },
        "route": "/open-project",
        "parent_page_id": "home",
        "required_permissions": [
          "lensx.filesystem.read_selected"
        ]
      }
    ],
    "actions": [
      {
        "id": "open_project",
        "title": {
          "en-US": "Open Project",
          "zh-CN": "打开项目"
        },
        "description": {
          "en-US": "Open the project selection page.",
          "zh-CN": "打开项目选择页面。"
        },
        "default_keywords": {
          "en-US": [
            "open workspace",
            "open folder"
          ],
          "zh-CN": [
            "打开工作区",
            "打开文件夹"
          ]
        },
        "target": {
          "kind": "page",
          "page_id": "open_project"
        }
      }
    ],
    "launcher": {
      "default_action_id": "open_project"
    }
  }
}
```

必填顶层字段为 `manifest_version`、`plugin_id`、`version`、`display`、`publisher`、`compatibility`、`runtime` 和 `contributes`。`requested_permissions`、`contributes.actions`、`contributes.launcher` 以及各可选展示字段可以省略。首版外部插件必须至少贡献一个 Page，因为 iframe 只有在 Page 打开时才有可达运行入口。

缺失的可选集合规范化为空数组或空 locale map；显式 `null` 始终无效。字符串在语义校验前进行首尾空白规范化，规范化后为空的必填值无效。

### 3. 身份使用插件命名空间与本地贡献 ID

`plugin_id` 使用至少两个点分段的稳定命名空间。每个分段以及 Page/Action 本地 ID 必须以 ASCII 小写字母开头，并且只包含 ASCII 小写字母、数字、下划线或连字符。单段最长 64 个字符，完整全局 ID 最长 255 个字符。

Manifest 内 Page 和 Action 只声明一个本地段：

```text
plugin_id:       com.acme.workspace
local action id: open_project
global action:   com.acme.workspace.open_project
```

Host 未来投影 Action 时使用 `plugin_id` 作为 `owner_id`，并以 `<plugin_id>.<local_action_id>` 生成 `action_id`。插件版本不进入任何稳定资源 ID。Page 与 Action 是独立命名空间，因此可以使用相同本地 ID。

替代方案是在每个贡献项中重复完整 `plugin_id` 或全局 ID。该方案会产生所有权不一致输入，因此不采用。

### 4. 本地化与搜索语义归 Action 所有

Plugin、Page 和 Action 的用户可见文本使用 `en-US` 为必填规范语言，`zh-CN` 可选并回退到英文。未知 locale 字段在首版严格拒绝，避免未定义的回退行为。

Plugin 只声明 `display.name`，不声明 `aliases` 或 `default_aliases`。未来 Launcher 可以把插件名称作为低权重来源字段参与匹配，但搜索结果和持久化身份仍是 Action。

Action 使用：

- `title` 作为主要展示名称和主要搜索字段；
- 可选 `description` 补充语义；
- locale-keyed `default_keywords` 表达同义词、俗称、缩写和自然语言输入；
- 可选 `icon` 覆盖 Plugin 默认图标。

不同时保留 `aliases` 与 `default_keywords`，避免两个含义重叠的搜索字段产生排序歧义。

### 5. Publisher 是必填但不可信的作者声明

`publisher` 必须包含：

- `author`：非空作者、团队或组织名称；
- `homepage`：绝对 HTTPS URL；
- `repository`：绝对 HTTPS 仓库 URL。

这些字段用于展示、问题追踪和来源说明，不构成签名、所有权或安全验证。Host 不得仅凭 Publisher 字段授予权限或建立信任。

替代方案是把作者、主页和仓库拆为顶层字段。聚合到 `publisher` 可以保留清晰语义并为未来可信发布者元数据留出独立 Host 层。

### 6. 首版 Runtime 只允许隔离 iframe

`runtime.kind` 只能是 `iframe`，`entry` 必须是插件包内相对 HTML 路径。作者不能声明 Host module、React/Vue module、Native library、Tauri Command、Sidecar、后台进程、任意外部 URL 或 iframe sandbox 放宽项。

Runtime entry 和所有 asset path 必须：

- 是规范的正斜杠相对路径；
- 不以 `/` 开头；
- 不含反斜杠、空段、`.` 或 `..` 段；
- 不含 URL scheme、query 或 fragment；
- 在安装/加载阶段解析后仍位于插件包根目录内。

Schema/纯 Manifest 校验负责路径语法；未来包安装或加载边界负责文件存在性、真实路径和符号链接逃逸检查。

### 7. Page 是首版唯一可打开的插件表面

每个 Page 包含本地 `id`、本地化 `title`、插件内部 `route`，以及可选 `parent_page_id`、`icon` 和 `required_permissions`。Route 必须以单个 `/` 开头，不得是外部 URL，也不得包含反斜杠、父级遍历、query 或 fragment。

同一插件内 Page ID 必须唯一。`parent_page_id` 必须引用同一插件的 Page，不能引用自身，整个父子关系不能成环。Page 图只描述导航层次，不触发 iframe 创建；未来只有实际打开 Page 时才加载 Runtime。

首版要求至少一个 Page。Action 可以为空，因此插件可以只通过未来 Plugin Manager 或其他 Host 导航入口暴露 Page，而不必自动出现在 Launcher 中。

### 8. Action Target 只允许 Page

每个 Action 包含本地 `id`、本地化 `title`、可选 `description`、可选 `default_keywords`、可选 `icon`，以及必填的 tagged target：

```json
{
  "target": {
    "kind": "page",
    "page_id": "open_project"
  }
}
```

`target.kind` 在首版只有 `page` 一个合法值，但仍保留 tagged object，方便未来通过独立 change 增加新 Target，而不改变现有字段形状。`page_id` 必须引用同一插件声明的 Page。

Manifest Action 不包含 executor、函数、route、URL 或 `enabled`。未来 provider adapter 投影时，由 Host 根据目标 Page 生成受控的“打开 Page”执行器，并根据兼容性、插件生命周期、Runtime 与权限状态计算 Action 可用性。

`contributes.launcher.default_action_id` 可选；存在时必须引用同一 Manifest 中的 Action。未来插件名称产生来源匹配时，搜索服务可以提升这个 Action，但该字段本身不定义排序算法。

### 9. 权限只描述请求与 Page 依赖

`requested_permissions` 声明插件希望使用的 Host 权限 ID 和本地化原因。每个权限 ID 在插件内必须唯一。Page 的 `required_permissions` 必须是顶层请求集合的子集，并且不得重复。

本 change 只验证 Manifest 内部权限引用，不定义具体权限目录、授权交互或持久化授予状态。未来权限能力负责判断权限 ID 是否被当前 Host 支持以及用户是否已授予。

Action 不重复声明权限；其可用性从目标 Page 的权限依赖派生，避免 Action 和 Page 声明冲突。

### 10. 兼容性与结构有效性分离

`manifest_version` 必须是 Host 支持的协议版本。插件 `version` 以及 LensX/Host API 的 `min_version` 和 `max_version_exclusive` 都使用 SemVer。每个范围必须满足 `min_version < max_version_exclusive`。

当前版本满足：

```text
min_version <= current_version < max_version_exclusive
```

时对应维度兼容。结构和语义正确但版本超出任一范围的 Manifest 是 `incompatible`，不是 `invalid`。这样 Plugin Manager 将来可以解释不兼容原因，而不是把合法包误报为损坏。

### 11. 诊断稳定且跨语言一致

校验流程按以下阶段执行：

```text
unknown JSON
  -> Schema 结构校验
  -> 规范化
  -> ID、路径、引用、图与权限语义校验
  -> 兼容性判定
  -> valid-compatible | valid-incompatible | invalid
```

所有公开诊断使用：

```ts
interface PluginManifestDiagnostic {
  code: string;
  path: string;
  message: string;
}
```

`path` 使用 JSON Pointer，`code` 稳定且可由调用方判断，`message` 只面向诊断阅读。能够安全聚合的错误一次性返回，并按 `path`、`code` 排序。TypeScript 与 Rust 必须使用同一组有效、无效、规范化和不兼容样例，并对分类、规范化结果和诊断 code/path 保持一致。

### 12. Host 可信状态与作者 Manifest 分离

作者 Manifest 严格拒绝 `source`、`lifecycle`、`enabled`、`disableable`、`uninstallable`、`install_path`、`package_digest`、`signature_status`、`compatibility_status`、`runtime_status`、`granted_permissions`、`last_error` 和更新状态。

本 change 可以定义用于边界说明的规范化 Manifest 和注册元数据类型，但不实现运行中 Plugin Registry。未来注册对象必须组合规范化 Manifest 与 Host 注入状态，而不是把可信字段写回作者输入。

## Risks / Trade-offs

- [首版 Page-only Target 不能表达无 UI Command] → 明确作为范围限制；未来通过独立 Target capability 扩展 tagged union。
- [要求至少一个 Page 会排除纯后台或纯数据插件] → 这些运行形态本就不在首版安全边界内，不为未来能力提前开放入口。
- [严格拒绝未知字段会降低前向兼容性] → 使用显式 `manifest_version`；新字段通过新协议版本或明确的兼容扩展加入。
- [作者填写的 Publisher 信息可能虚假] → UI 和数据模型将其视为未验证元数据；可信发布者和签名状态保留在 Host 层。
- [Schema、TypeScript 与 Rust 可能产生校验漂移] → 以 Schema 和共享样例为门禁，并比较规范化输出与诊断 code/path。
- [预发布 SemVer 与边界比较容易实现不一致] → 两端使用遵循 SemVer 的实现，并用预发布、上下界和空区间样例锁定行为。
- [Manifest 包含未来权限 ID，但当前没有权限目录] → 本 change 只验证内部引用；Host 支持性和授权由后续权限 capability 判定。
- [Manifest Action icon 暂时无法进入现有 Action Descriptor] → 保留为 Manifest 元数据；Action 投影与搜索结果展示时再通过专门 change 决定 Action Core 扩展。

## Migration Plan

1. 新增首版 Schema、共享样例和类型生成/漂移检查，不接入启动或运行路径。
2. 实现 TypeScript 与 Rust 的解析、规范化、语义校验和兼容性判定，并用共享样例验证一致性。
3. 更新扩展架构英文文档和简体中文镜像，明确已实现的是静态契约而非插件运行时。
4. 后续 provider lifecycle、iframe runtime、权限和搜索 change 只消费已验证的规范化 Manifest。

本 change 没有既有持久化插件数据需要迁移。回滚时可以移除未被生产路径消费的新契约模块、Schema、样例和文档，不影响当前 Launcher Action Core。

## Open Questions

无。权限目录、包文件存在性、签名可信度、Page 导航实现、Action 投影和搜索排序均已明确留给后续 change。
