import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: { timeout: 12000 },
  workers: 1,
  use: {
    channel: 'chrome',
    headless: true,
    baseURL: process.env.PREVIEW_URL ?? 'http://127.0.0.1:4187',
    viewport: { width: 1512, height: 982 },
    launchOptions: { args: ['--enable-unsafe-webgpu'] },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:4187',
    reuseExistingServer: true,
    timeout: 15000,
  },
});
