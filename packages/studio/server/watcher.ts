// Live reload: watch an open folder and tell browsers what changed (debounced), including edits made by
// other programs — an editor, the CLI, or an AI job writing lessons.
import { watch, type FSWatcher } from 'chokidar'
import { relative, sep } from 'node:path'
import { IGNORED_DIRS, isStudyFile } from '@mdlearn/core/node'
import type { EventBus } from './bus.js'
import type { Handle } from './workspaces.js'
import type { ServerEvent } from '../shared/types.js'

type Change = Extract<ServerEvent, { type: 'fs.changed' }>['paths'][number]
const kindOf = (rel: string): Change['kind'] =>
  rel.endsWith('.learn.md') ? 'lesson' : /\.(md|markdown)$/i.test(rel) ? 'doc' : /\.tex$/i.test(rel) ? 'latex' : /\.(png|jpe?g|gif|webp|svg)$/i.test(rel) ? 'asset' : 'other'

export function watchWorkspace(h: Handle, bus: EventBus, debounceMs = 150): FSWatcher {
  const progressFile = ['learn', '.mdlearn', 'progress.json'].join(sep)
  const ignored = (p: string) => {
    const rel = relative(h.root, p)
    if (!rel || rel === progressFile || rel === ['learn', '.mdlearn'].join(sep) || rel === 'learn') return false
    return rel.split(sep).some((seg, i, all) => (seg.startsWith('.') && !(all[0] === 'learn' && seg === '.mdlearn')) || (IGNORED_DIRS.has(seg) && !(i === 0 && seg === 'learn')))
  }
  const pending = new Map<string, Change>()
  let progress = false, structure = false
  let timer: NodeJS.Timeout | undefined
  const flush = () => {
    timer = undefined
    if (pending.size) bus.publish({ type: 'fs.changed', ws: h.id, paths: [...pending.values()] })
    if (structure) bus.publish({ type: 'tree.changed', ws: h.id })
    if (progress) bus.publish({ type: 'progress.changed', ws: h.id })
    pending.clear(); progress = false; structure = false
  }
  const on = (change: Change['change']) => (abs: string) => {
    const rel = relative(h.root, abs)
    if (rel === progressFile) progress = true
    else {
      const kind = kindOf(rel)
      if (kind === 'other') return
      pending.set(rel, { path: rel.split(sep).join('/'), kind, change })
      if (change !== 'change' || kind === 'lesson' || (kind === 'doc' && isStudyFile(abs))) structure = true // titles, cards and diagnostics live in the tree
    }
    clearTimeout(timer)
    timer = setTimeout(flush, debounceMs)
  }
  const w = watch(h.root, { ignored, ignoreInitial: true, atomic: true, depth: 12 })
  w.on('add', on('add')).on('change', on('change')).on('unlink', on('unlink'))
  w.on('error', () => { /* e.g. inotify limit reached: live reload stops, the app keeps working */ })
  return w
}
