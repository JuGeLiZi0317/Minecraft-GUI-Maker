import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.ts', fullyParallel: false, workers: 1, timeout: 60_000,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4173', channel: process.env.GUI_BROWSER_CHANNEL || undefined, viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium-dpr1', use: { browserName: 'chromium', deviceScaleFactor: 1 } },
    { name: 'chromium-dpr2', use: { browserName: 'chromium', deviceScaleFactor: 2 } },
  ],
  webServer: { command: `${process.platform === 'win32' ? 'npm.cmd' : 'npm'} run dev -- --port 4173 --strictPort`, url: 'http://127.0.0.1:4173', reuseExistingServer: false },
});
