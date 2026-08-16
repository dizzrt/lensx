# @lensx/plugin-ui

Optional React and Semi Design UI foundations for lensX plugins. The package
exports `PluginUiProvider`, `PluginPage`, `PluginFeedback`, and their public
types from the root entry. Import `@lensx/plugin-ui/styles.css` once in the
plugin document.

React, React DOM, and `@lensx/plugin-sdk` are peer dependencies owned by the
plugin project. This package is document-local: it does not create or control a
Child WebView, configure the private bridge, provide Host API transport,
navigation, Tauri access, or Host-private React context and styles.
