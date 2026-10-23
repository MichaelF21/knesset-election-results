import { defineConfig } from '@playwright/test';

// Two dev servers: the real data (2026 not yet published) and MOCK=1 (synthetic 2026 results from
// scripts/mock_k26.py; run `MOCK=1 python scripts/mock_k26.py` first).
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    viewport: { width: 1400, height: 900 },
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [
    { name: 'real', testMatch: /real\.spec\.ts/, use: { baseURL: 'http://localhost:5180' } },
    { name: 'mock', testMatch: /mock\.spec\.ts/, use: { baseURL: 'http://localhost:5179' } },
  ],
  webServer: [
    { command: 'npx vite --port 5180 --strictPort', port: 5180, reuseExistingServer: true },
    { command: 'npx vite --port 5179 --strictPort', port: 5179, reuseExistingServer: true, env: { MOCK: '1' } },
  ],
});
