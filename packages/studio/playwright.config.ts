import { defineConfig, devices } from '@playwright/test'
// End-to-end tests against a real server on a throw-away copy of the test curriculum, with the demo AI
// engine (no Claude needed). Build first: npm run build -w @mdlearn/studio
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4799', trace: 'retain-on-failure' },
  webServer: { command: 'node e2e/serve.mjs', url: 'http://localhost:4799/api/session', reuseExistingServer: false, timeout: 30_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /reader|study|layout|games|graph/ },
  ],
})
