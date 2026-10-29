// Bundles the main process into dist/main.cjs (Electron loads it; electron itself stays external).
import { build } from 'esbuild'

await build({ entryPoints: ['src/main.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node24', external: ['electron'], outfile: 'dist/main.cjs', logLevel: 'warning' })
