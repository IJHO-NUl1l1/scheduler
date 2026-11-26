import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    build: {
      // core는 번들에 포함 (나중에 패키징할 때 workspace 링크가 필요 없게)
      externalizeDeps: { exclude: ['@scheduler/core'] },
    },
  },
  preload: {
    build: {
      // sandbox 프리로드는 CommonJS여야 한다
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
  renderer: {
    resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
    plugins: [react(), tailwindcss()],
  },
});
