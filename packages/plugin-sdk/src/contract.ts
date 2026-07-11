export type LensxId = string;

export type PluginSource = 'builtin' | 'external';

export type PluginDisplayNames = {
  en: string;
  locales?: Record<string, string>;
};

export type PluginLifecycle = {
  uninstallable: boolean;
  disableable: boolean;
};

export type PluginRuntime =
  | {
      ui: 'vue_module';
      module: string;
    }
  | {
      ui: 'iframe';
      entry: string;
      sandbox?: string[];
    };

export type PluginSidecar = {
  enabled: boolean;
  command?: string;
  args?: string[];
};

export type PluginPermission = {
  id: LensxId;
  plugin_id: LensxId;
  title: string;
  description?: string;
};

export type PluginPage = {
  id: LensxId;
  plugin_id: LensxId;
  title: string;
  entry: string;
  parent_page_id?: LensxId;
  required_permissions?: LensxId[];
};

export type PluginAction = {
  id: LensxId;
  plugin_id: LensxId;
  title: string;
  target_page_id: LensxId;
  required_permissions?: LensxId[];
};

export type PluginManifest = {
  id: LensxId;
  display_names: PluginDisplayNames;
  default_aliases: string[];
  version: string;
  source: PluginSource;
  lifecycle: PluginLifecycle;
  runtime: PluginRuntime;
  pages: PluginPage[];
  actions: PluginAction[];
  permissions: PluginPermission[];
  sdk?: {
    min_version?: string;
  };
  host_api?: {
    min_version?: string;
  };
  sidecar?: PluginSidecar;
};

export type PluginRegistrySnapshot = {
  plugins: PluginManifest[];
  pages: PluginPage[];
  actions: PluginAction[];
  permissions: PluginPermission[];
};

export type PermissionState = Record<LensxId, boolean>;

export type PluginRuntimeContext = {
  plugin_id: LensxId;
  host_version: string;
  locale: string;
  theme: 'light' | 'dark';
  permissions: PermissionState;
};

export type HostApiMethodDefinition = {
  id: LensxId;
  permission?: LensxId;
  params_schema?: unknown;
  result_schema?: unknown;
};
