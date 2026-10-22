import { withRsbuildConfig } from '@rstest/adapter-rsbuild';
import { defineConfig } from '@rstest/core';

export default defineConfig({
  extends: withRsbuildConfig(),
  include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
  setupFiles: ['./tests/rstest.setup.ts'],
  testEnvironment: 'happy-dom',
});
