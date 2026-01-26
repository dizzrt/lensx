import { defineConfig, presetWind3 } from 'unocss';

export default defineConfig({
  content: {
    filesystem: ['./src/**/*.{html,vue,js,ts,jsx,tsx}'],
  },
  presets: [presetWind3()],
  shortcuts: {
    'wh-full': 'w-full h-full',
  },
});
