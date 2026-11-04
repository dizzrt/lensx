/** Host-private presentation ownership. This is never plugin authority. */
export interface PluginChildWebviewOwner {
  readonly windowLabel: string;
  readonly ownershipRevision: bigint;
}

export const MAIN_PLUGIN_CHILD_WEBVIEW_OWNER: PluginChildWebviewOwner = Object.freeze({
  windowLabel: 'main',
  ownershipRevision: 1n,
});

const WINDOW_PATTERN = /^(?:main|plugin-window-(?!0000000000000000)[0-9a-f]{16})$/u;
const MAX_REVISION = 18_446_744_073_709_551_615n;

export const serializePluginChildWebviewOwner = (owner: PluginChildWebviewOwner) => {
  if (
    !WINDOW_PATTERN.test(owner.windowLabel) ||
    typeof owner.ownershipRevision !== 'bigint' ||
    owner.ownershipRevision <= 0n ||
    owner.ownershipRevision > MAX_REVISION
  ) {
    throw new TypeError('Plugin Child WebView ownership is invalid.');
  }
  return { window_label: owner.windowLabel, ownership_revision: owner.ownershipRevision.toString() };
};

export const parsePluginChildWebviewOwner = (
  windowLabel: unknown,
  ownershipRevision: unknown,
): PluginChildWebviewOwner => {
  if (
    typeof windowLabel !== 'string' ||
    typeof ownershipRevision !== 'string' ||
    !/^[1-9][0-9]{0,19}$/u.test(ownershipRevision)
  ) {
    throw new TypeError('Plugin Child WebView ownership is invalid.');
  }
  const owner = { windowLabel, ownershipRevision: BigInt(ownershipRevision) };
  serializePluginChildWebviewOwner(owner);
  return Object.freeze(owner);
};
