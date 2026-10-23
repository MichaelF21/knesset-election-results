import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const MOCK = process.env.MOCK === '1';
const MOCK_DIR = join(__dirname, 'mock-data');

// With MOCK=1 the dev server serves site/mock-data/ on top of public/data/ (synthetic 2026 results
// from scripts/mock_k26.py). Mock data is never part of a build.
function mockOverlay(): Plugin {
  return {
    name: 'mock-overlay',
    apply: 'serve',
    configureServer(server) {
      if (!MOCK) return;
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/^\/data\/([^?]+)/);
        if (!m) return next();
        const file = normalize(join(MOCK_DIR, decodeURIComponent(m[1])));
        if (!file.startsWith(MOCK_DIR) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig(({ command }) => {
  if (command === 'build' && MOCK) {
    throw new Error('MOCK=1 builds are not allowed: mock data must never be deployed');
  }
  return {
    // Relative base so the build works on GitHub Pages sub-paths as well as at a domain root.
    base: './',
    plugins: [react(), mockOverlay()],
    build: {
      chunkSizeWarningLimit: 900, // maplibre-gl alone is ~800 kB minified (~220 kB gzipped)
      rollupOptions: { output: { manualChunks: { maplibre: ['maplibre-gl'] } } },
    },
    test: {
      include: ['src/**/*.test.ts'],
    },
  };
});
