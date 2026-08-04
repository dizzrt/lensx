export const PLUGIN_RUNTIME_IFRAME_SANDBOX = 'allow-scripts allow-same-origin' as const;
export const PLUGIN_RUNTIME_REFERRER_POLICY = 'no-referrer' as const;
export const PLUGIN_RUNTIME_PERMISSIONS_POLICY =
  "camera 'none'; microphone 'none'; geolocation 'none'; fullscreen 'none'; clipboard-read 'none'; clipboard-write 'none'; display-capture 'none'; payment 'none'; usb 'none'; serial 'none'; hid 'none'; bluetooth 'none'; screen-wake-lock 'none'" as const;

export const isExactPluginRuntimeIframePolicy = (policy: {
  readonly sandbox: string;
  readonly referrerPolicy: string;
  readonly allow: string;
}): boolean =>
  policy.sandbox === PLUGIN_RUNTIME_IFRAME_SANDBOX &&
  policy.referrerPolicy === PLUGIN_RUNTIME_REFERRER_POLICY &&
  policy.allow === PLUGIN_RUNTIME_PERMISSIONS_POLICY;
