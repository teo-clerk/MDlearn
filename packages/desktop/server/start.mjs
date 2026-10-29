// MDlearn Studio for the desktop app, run by Electron's own Node (ELECTRON_RUN_AS_NODE=1). It prints its address
// on one line ("MDLEARN_READY <token> <url>", with the token the app gave it) for the window to load, and stops
// when the app closes its stdin.
import { startStudio } from '@mdlearn/studio/server'

const port = Number(process.env.MDLEARN_PORT || 4757)
const token = process.env.MDLEARN_READY_TOKEN ?? ''
// the programs Studio starts (Claude Code, Ollama, TeX…) get neither: Electron-based ones would run as Node
for (const name of ['ELECTRON_RUN_AS_NODE', 'MDLEARN_PORT', 'MDLEARN_READY_TOKEN']) delete process.env[name]
const studio = await startStudio({ port, open: false })
process.stdout.write(`MDLEARN_READY ${token} ${studio.url}\n`)

let stopping = false
const stop = async () => {
  if (stopping) return
  stopping = true
  await studio.close().catch(() => {})
  process.exit(0)
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
process.stdin.on('end', stop) // the app quit, or crashed
process.stdin.resume()
