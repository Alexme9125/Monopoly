import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { host: '0.0.0.0', proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } } },
  test: { environment: 'node' },
});
