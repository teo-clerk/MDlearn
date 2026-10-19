// Child process for the concurrency test: appends N events to a shared progress file.
import { workspace, appendProgress } from '../../src/node'
const [root, tag, n] = process.argv.slice(2)
const ws = workspace(root)
for (let i = 0; i < Number(n); i++) {
  appendProgress(ws, { reviews: [{ id: `${tag}-${i}`, t: Date.now(), key: `l/${tag}`, rating: 3 }] })
}
