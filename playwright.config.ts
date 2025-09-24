import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  reporter: 'line',
  use: { baseURL: 'http://localhost:8888', trace: 'on-first-retry' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npx http-server public -p 8888 --silent',
    port: 8888,
    reuseExistingServer: true,
  },
});
