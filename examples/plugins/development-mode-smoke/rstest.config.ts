import { withRsbuildConfig } from '@rstest/adapter-rsbuild';
import { defineConfig } from '@rstest/core';

export default defineConfig({
  extends: withRsbuildConfig(),
  include: ['tests/**/*.test.ts'],
  testEnvironment: 'node',
});
