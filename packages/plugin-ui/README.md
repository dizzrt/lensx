# @lensx/plugin-ui

Optional React and Semi Design UI foundations for lensX plugins. The package
exports `PluginUiProvider`, `PluginPage`, `PluginFeedback`, and their public
types from the root entry. Import `@lensx/plugin-ui/styles.css` once in the
plugin document.

React, React DOM, and `@lensx/plugin-sdk` are peer dependencies owned by the
plugin project. This package does not provide an iframe Runtime, Host API,
navigation, Tauri access, or Host-private React context and styles.
