/// <reference types="@rsbuild/core/types" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  // biome-ignore lint/complexity/noBannedTypes: no need
  // biome-ignore lint/suspicious/noExplicitAny: no need
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
