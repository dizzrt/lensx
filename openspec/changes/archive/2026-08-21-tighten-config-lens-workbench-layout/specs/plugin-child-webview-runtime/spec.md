## ADDED Requirements

### Requirement: Host MUST provide an edge-to-edge content slot below plugin Page chrome

When a current Page is provided by a plugin, the trusted Host MUST keep Page chrome outside the plugin content rectangle and MUST assign the Child WebView slot all remaining Launcher body space directly below that chrome. The plugin Page body MUST add no Host-owned inline padding, bottom padding, inter-region gap, or inner card radius around the Runtime slot. The outer Launcher surface MAY continue to clip the complete native Window shape. This layout MUST be selected from the trusted Page provider kind and MUST apply identically to official, external, and Development Mode plugins; plugin identity, Publisher, repository location, release metadata, or Runtime content MUST NOT select a special layout path.

React MUST continue to declare and measure only the Host-owned slot. Slot changes caused by Window resize, scale, locale, theme, or Page chrome MUST continue through the current revisioned physical-bounds path and Rust validation without a plugin-supplied bounds input, Runtime reload, Session replacement, new native setter, or public contract change. Home, Search and Host Pages MUST retain their own Host layouts.

#### Scenario: Ordinary plugin Page enters its content slot

- **WHEN** an external or Development Mode plugin Page becomes current below the trusted Host Page chrome
- **THEN** its Host-owned Runtime slot begins directly after the chrome and extends to the remaining inline and bottom edges without Host body inset, inter-region gap or inner card radius
- **THEN** the plugin remains confined to that slot and cannot cover, replace or measure Host chrome through privileged APIs

#### Scenario: Official ConfigLens uses the ordinary slot

- **WHEN** the official ConfigLens Page and an equivalent external plugin Page resolve through the same provider and Runtime path
- **THEN** the Host selects the same edge-to-edge body layout from provider kind rather than official provenance
- **THEN** ConfigLens receives no special Host import, Runtime branch, native authority or bounds input

#### Scenario: Non-plugin surfaces retain their layouts

- **WHEN** the Launcher presents Home, Search or a Host-owned Page
- **THEN** the plugin edge-to-edge body state is absent and those surfaces retain their maintained padding, gap and resizable behavior
- **THEN** no hidden or stale plugin slot affects their layout or focus

#### Scenario: Plugin Page geometry changes

- **WHEN** Window size, scale, locale, theme or Host Page chrome changes the edge-to-edge content rectangle
- **THEN** the trusted Host advances the current slot revision and converges the same modeled Child WebView attempt on the newest valid physical bounds
- **THEN** the change causes no document reload, Session replacement, plugin-supplied geometry, native setter exposure or stale-attempt mutation
