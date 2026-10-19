// For an explanation card: ask the local model which key ideas your answer covered. A suggestion only —
// you still rate yourself (and it never sees the answer before you have written yours).
import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { studyApi, useEngines, type JudgeResult } from '../api/queries'
import { Button } from '../ui/primitives'

const WORD = { covered: 'covered', partly: 'partly', missing: 'missing' } as const
export function Judge({ ws, widgetId, text, suggest }: { ws: string; widgetId: string; text: string; suggest(how: 'all' | 'partly' | 'missed'): void }) {
  const engines = useEngines()
  const [r, setR] = useState<JudgeResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!engines.data?.local.available || !text.trim()) return null
  const run = async () => {
    setBusy(true); setError(null)
    try { setR(await studyApi.judge(ws, widgetId, text)) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  if (!r) return (
    <div className="mt-4">
      <Button size="sm" variant="ghost" icon={Sparkles} busy={busy} onClick={run}>Get feedback from the local AI</Button>
      {error && <p className="mt-1 text-[12.5px] text-bad" role="alert">{error}</p>}
    </div>
  )
  const covered = r.ideas.filter((i) => i.verdict === 'covered').length
  const how = covered === r.ideas.length && r.ideas.length ? 'all' : covered || r.ideas.some((i) => i.verdict === 'partly') ? 'partly' : 'missed'
  return (
    <div className="mt-4 rounded-[8px] border border-border p-3 text-[13.5px]" role="status">
      <p className="text-[12px] font-medium text-muted">Local AI feedback · a suggestion, you decide</p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {r.ideas.map((i) => <li key={i.index}><span className="tabular text-muted">Idea {i.index}:</span> <span className="font-medium">{WORD[i.verdict]}</span>{i.evidence ? <span className="text-muted"> — “{i.evidence}”</span> : null}</li>)}
      </ul>
      {r.feedback && <p className="mt-2">{r.feedback}</p>}
      <button onClick={() => suggest(how)} className="mt-2 text-[12.5px] underline underline-offset-2 hover:text-text text-muted cursor-pointer">Use this: “{how === 'all' ? 'Got all of it' : how === 'partly' ? 'Partly' : 'Missed it'}”</button>
    </div>
  )
}
