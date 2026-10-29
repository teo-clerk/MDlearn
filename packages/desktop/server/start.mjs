// MDlearn Studio for the desktop app, run by Electron's own Node (ELECTRON_RUN_AS_NODE=1). It prints its address
// on one line ("MDLEARN_READY <url>") for the window to load, and stops when the app closes its stdin.
import { startStudio } from '@mdlearn/studio/server'

const port = Number(process.env.MDLEARN_PORT || 4757)
const studio = await startStudio({ port, open: false })
process.stdout.write(`MDLEARN_READY ${studio.url}\n`)

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
