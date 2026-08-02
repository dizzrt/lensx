import { pluginReact } from '@rsbuild/plugin-react';
import { defineConfig } from '@rstest/core';

export default defineConfig({
  include: ['tests/**/*.test.{ts,tsx}'],
  plugins: [pluginReact()],
  setupFiles: ['./tests/rstest.setup.ts'],
  testEnvironment: 'happy-dom',
});
