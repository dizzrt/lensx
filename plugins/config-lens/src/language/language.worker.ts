import { executeLanguageRequest } from './engine.js';

// biome-ignore lint/style/useConst: Rspack requires assignment to this injected runtime variable.
declare let __webpack_public_path__: string;

// Rspack's document-relative `./` asset prefix is correct for the plugin Page,
// but a Worker resolves it from its own nested chunk URL. Reset only the
// language-Worker runtime to the package root before it dynamically imports an
// adapter chunk.
__webpack_public_path__ = new URL('../../../', globalThis.location.href).href;

globalThis.addEventListener('message', (event: MessageEvent<unknown>) => {
  void executeLanguageRequest(event.data).then((result) => globalThis.postMessage(result));
});
