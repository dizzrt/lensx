import { withRsbuildConfig } from '@rstest/adapter-rsbuild';
import { defineConfig } from '@rstest/core';

export default defineConfig({
  extends: withRsbuildConfig(),
  include: ['tests/**/*.test.ts'],
  setupFiles: ['./tests/rstest.setup.ts'],
  testEnvironment: 'happy-dom',
});
