# Spec Delta

## MODIFIED Requirements

### Requirement: Translation MUST be a standalone foreground plugin

Translation MUST remain a standalone foreground plugin with its declared identity, resizable initial page, public Host API compatibility, and existing isolation and installation boundaries.

#### Scenario: User opens Translation
- **WHEN** the user executes the currently available `dev.lensx.translation.open` Action
- **THEN** the Host opens the plugin's `main` Page and displays `Translation` or `翻译` according to the current interface language
- **THEN** the plugin uses the same isolation, context, and lifecycle boundaries as other plugins

#### Scenario: Official plugin attempts a private capability
- **WHEN** the plugin implementation or package artifact depends on nonpublic Host, Tauri, native proxy, Node Runtime, or persistent background execution capabilities
- **THEN** the artifact does not satisfy this capability's delivery contract
- **THEN** official provenance cannot justify bypassing public plugin boundaries

#### Scenario: Register and open the Translation package
- **WHEN** the Translation package is inspected, registered, opened, or invokes public HTTP during its foreground Runtime
- **THEN** The system MUST provide a standalone plugin with ID `dev.lensx.translation` and package name `@lensx/official-translation`, contributing one `main` Page and one `open` Action targeting that Page, named `Translation` in English and `翻译` in Simplified Chinese. The Page MUST declare an initial logical size of `800×480` and allow resizing, while its actual presentation MUST follow existing Host workspace constraints. The plugin MUST follow the existing Manifest, isolated Web Runtime, public Host API, and installation lifecycle contracts; official status MUST NOT grant private Host, Tauri, filesystem, process, Node Runtime, or background execution privileges. Translation MUST use the upgraded public SDK and Host API compatibility range `>=0.4.0 <0.5.0`, and MUST invoke public HTTP only when the current Context advertises `http.request`.

#### Scenario: SDK is upgraded without adding a shortcut business callback
- **WHEN** the upgraded Translation plugin is entered initially or again through its dedicated Action shortcut without providing onShortcutActivated
- **THEN** the Page opens or receives focus normally, preserving existing input, settings, requests, and results according to its existing lifecycle
- **THEN** shortcut activation alone does not submit an additional translation, read the clipboard, or reset input; existing input-driven translation behavior is preserved
