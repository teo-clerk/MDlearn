import { defineConfig } from '@playwright/test'
// The desktop app end to end: launched as built (MDLEARN_DESKTOP_EXE, e.g. release/linux-unpacked/mdlearn) or,
// without it, from this folder with the repo's Studio. Build first: npm run build && npm run build -w @mdlearn/desktop
export default defineConfig({ testDir: './e2e', timeout: 90_000, fullyParallel: false, workers: 1, reporter: [['list']] })
