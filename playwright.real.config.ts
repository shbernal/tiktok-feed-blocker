import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/real',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 90_000,
  expect: {
    timeout: 30_000,
  },
  use: {
    ...devices['Desktop Chrome'],
    headless: false,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'real-tiktok-chromium-extension',
      use: {
        browserName: 'chromium',
      },
    },
  ],
})
