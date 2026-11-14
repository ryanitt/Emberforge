import { defineConfig } from 'vite';

declare const process: { env: Record<string, string | undefined> };

// The cloud preview proxies to this dev server with its own Host header, so the
// exact preview hostname is allowed via PREVIEW_HOST at startup instead of being
// written into the repository.
const previewHost = process.env.PREVIEW_HOST;

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: ['localhost', '127.0.0.1', ...(previewHost ? [previewHost] : [])],
  },
  build: { target: 'es2022' },
});
