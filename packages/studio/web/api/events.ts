// One EventSource per tab: file changes refresh what is on screen; a gap in the stream refreshes everything.
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { keys } from './queries'
import { useStream } from '../state/stream'
import type { ServerEvent } from '../../shared/types'

export function useLiveEvents(ws: string | undefined): void {
  const qc = useQueryClient()
  useEffect(() => {
    const src = new EventSource(`/api/events${ws ? `?ws=${ws}` : ''}`)
    src.onmessage = (m) => {
      let e: ServerEvent
      try { e = JSON.parse(m.data) as ServerEvent } catch { return }
      switch (e.type) {
        case 'fs.changed':
          for (const p of e.paths) {
            if (p.kind === 'doc') {
              qc.invalidateQueries({ queryKey: keys.doc(e.ws, p.path) })
              for (const k of ['formulas', 'glossary', 'glossary-compact', 'links', 'knowledge-map', 'doc-summary']) qc.invalidateQueries({ queryKey: [k, e.ws] })
            }
            if (p.kind === 'lesson') qc.invalidateQueries({ queryKey: keys.lesson(e.ws, p.path) })
          }
          break
        case 'tree.changed': qc.invalidateQueries({ queryKey: keys.tree(e.ws) }); break
        case 'progress.changed': qc.invalidateQueries({ queryKey: keys.today(e.ws) }); qc.invalidateQueries({ queryKey: keys.report(e.ws) }); qc.invalidateQueries({ queryKey: ['map', e.ws] }); qc.invalidateQueries({ queryKey: keys.tree(e.ws) }); break
        case 'notes.changed': qc.invalidateQueries({ queryKey: keys.notes(e.ws, e.doc) }); break
        case 'ai.delta': useStream.getState().append(e.messageId, e.text); break
        case 'ai.done': useStream.getState().finish(e.messageId); qc.invalidateQueries({ queryKey: keys.notes(e.ws, e.doc) }); if (e.noteId === 'ask') qc.invalidateQueries({ queryKey: ['ask-history', e.ws] }); break
        case 'job':
          qc.invalidateQueries({ queryKey: keys.jobs(e.ws) })
          qc.setQueryData(keys.job(e.ws, e.job.id), (old: unknown) => (old ? { ...(old as object), ...e.job } : old))
          if (e.job.status !== 'running' && e.job.status !== 'queued') qc.invalidateQueries({ queryKey: keys.job(e.ws, e.job.id) })
          break
        case 'job.event':
          qc.setQueryData(keys.job(e.ws, e.jobId), (old: { events: unknown[] } | undefined) => (old ? { ...old, events: [...old.events, e.event] } : old))
          break
        case 'resync': qc.invalidateQueries(); break
      }
    }
    return () => src.close()
  }, [ws, qc])
}
