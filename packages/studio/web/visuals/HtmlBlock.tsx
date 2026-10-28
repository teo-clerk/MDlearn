// An `:::html` block: the author's HTML, CSS and JavaScript (a small game, an interactive diagram) running in
// a sandboxed frame — its own opaque origin, no network, no access to this page, your notes or the API. It
// starts when you press Play (or at once with `{auto}`), gets the Studio's colours as CSS variables, fits its
// height to the content, and is stopped if it stops responding. `mdlearn.done({ score, total })` shows a
// score under it; that score is practice and is never recorded.
import { useEffect, useRef, useState } from 'react'
import { Play, RotateCcw, TriangleAlert } from 'lucide-react'
import type { Visual } from '@mdlearn/core'
import { Frame } from './Plot'
import { t } from '../i18n'

type HtmlVisual = Extract<Visual, { type: 'html' }>
const THEME_VARS = ['--text', '--muted', '--subtle', '--bg', '--panel', '--raised', '--hover', '--active', '--border', '--border-strong',
  '--accent', '--on-accent', '--good', '--good-soft', '--bad', '--bad-soft', '--warn', '--warn-soft', '--font-ui', '--font-read', '--font-mono']
function theme() {
  const s = getComputedStyle(document.documentElement)
  const vars = Object.fromEntries(THEME_VARS.map((k) => [k, s.getPropertyValue(k).trim()]).filter(([, v]) => v))
  const bg = s.getPropertyValue('--bg').trim()
  return { vars, dark: /^#[0-3]/.test(bg) }
}
const cssOf = (t: ReturnType<typeof theme>) => `:root{${Object.entries(t.vars).map(([k, v]) => `${k}:${v}`).join(';')};color-scheme:${t.dark ? 'dark' : 'light'}}`

export function HtmlBlock({ b }: { b: HtmlVisual }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [running, setRunning] = useState(b.auto)
  const [run, setRun] = useState(0)
  const [height, setHeight] = useState(b.height ?? 160)
  const [error, setError] = useState<string | null>(null)
  const [stopped, setStopped] = useState(false)
  const [score, setScore] = useState<{ score: number; total: number | null } | null>(null)
  const seen = useRef(Date.now())
  useEffect(() => {
    if (!running) return
    seen.current = Date.now()
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return
      const m = (e.data ?? {}) as { type?: string; height?: number; message?: string; score?: number; total?: number | null }
      seen.current = Date.now()
      if (m.type === 'loaded') frame.current?.contentWindow?.postMessage({ type: 'init', code: b.code, theme: theme(), reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches }, '*')
      if (m.type === 'size' && b.height === undefined && typeof m.height === 'number') setHeight(Math.max(60, Math.min(900, Math.ceil(m.height))))
      if (m.type === 'error') setError(String(m.message ?? t('Script error')).slice(0, 300))
      if (m.type === 'done' && typeof m.score === 'number') setScore({ score: m.score, total: typeof m.total === 'number' ? m.total : null })
    }
    window.addEventListener('message', onMsg)
    const watchdog = setInterval(() => { if (Date.now() - seen.current > 5000) { setStopped(true); setRunning(false) } }, 1000)
    // follow the Studio's light/dark switch
    const mo = new MutationObserver(() => { const t = theme(); frame.current?.contentWindow?.postMessage({ type: 'theme', theme: t, css: cssOf(t) }, '*') })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
    return () => { window.removeEventListener('message', onMsg); clearInterval(watchdog); mo.disconnect() }
  }, [running, run, b.code, b.height])
  const restart = () => { setError(null); setStopped(false); setScore(null); setRunning(true); setRun((r) => r + 1) }
  return (
    <Frame b={b}>
      {running ? (
        <iframe key={run} ref={frame} src="/sandbox/html.html" sandbox="allow-scripts" title={b.caption ? t('Interactive') : t('Interactive block')}
          className="block w-full rounded-[8px] border-0 bg-transparent" style={{ height }} />
      ) : (
        <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed border-border-strong bg-panel p-4 text-center font-ui">
          {stopped
            ? <><TriangleAlert className="size-5 text-warn" aria-hidden /><p className="max-w-[46ch] text-[13px] text-muted">{t('It stopped responding and was stopped.')}</p></>
            : <p className="max-w-[46ch] text-[13px] text-muted">{t('Interactive · runs in a sandbox with no network and no access to your notes.')}</p>}
          <button type="button" onClick={restart} className="inline-flex h-8 items-center gap-1.5 rounded-[6px] bg-accent px-3 text-[13.5px] font-medium text-on-accent hover:brightness-[1.06] cursor-pointer">
            {stopped ? <RotateCcw className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}{stopped ? t('Run again') : t('Play')}
          </button>
        </div>
      )}
      {(running || score || error) && (
        <div className="mt-1.5 flex items-center gap-3 font-ui text-[12.5px] text-muted">
          {score && <span className="game-settle font-semibold text-text tabular" role="status">{t('Score {n}', { n: score.score })}{score.total !== null ? ` / ${score.total}` : ''}</span>}
          {error && <span className="min-w-0 truncate text-bad" role="alert" title={error}>{error}</span>}
          {running && <button type="button" onClick={restart} className="ml-auto inline-flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 hover:bg-hover hover:text-text cursor-pointer"><RotateCcw className="size-3.5" aria-hidden />{t('Restart')}</button>}
        </div>
      )}
    </Frame>
  )
}
