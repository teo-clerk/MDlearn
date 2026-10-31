import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { defineConfig } from 'vitest/config'

// the app works on real paths, and macOS keeps its temp folder behind a link
process.env.TMPDIR = realpathSync(tmpdir())
export default defineConfig({ test: { include: ['packages/*/test/**/*.test.ts'] } })
