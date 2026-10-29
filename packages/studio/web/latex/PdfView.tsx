// The compiled PDF, drawn page by page with pdf.js (loaded only here), fitted to the pane's width. The same on
// every device, phones included, which the browser's own PDF viewer is not. A new compile keeps the scroll
// position, so the page being worked on stays in view.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { Spinner } from '../ui/primitives'
import { t, tp } from '../i18n'

const MAX_PAGES = 150
const SIDE = 32
type State = { kind: 'loading' } | { kind: 'ready'; pages: number; shown: number } | { kind: 'missing' } | { kind: 'error'; message: string }

export default function PdfView({ url, missing }: { url: string; missing: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const pagesEl = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    const el = box.current!
    // re-fit only when the width changes noticeably, not on every pixel of a drag
    const ro = new ResizeObserver(([e]) => setWidth((w) => { const n = Math.round(e.contentRect.width / 40) * 40; return Math.abs(n - w) >= 40 ? n : w }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!width) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (res.status === 404) { if (!cancelled) setState({ kind: 'missing' }); return }
        if (!res.ok) throw new Error(t('The PDF could not be loaded.'))
        const data = new Uint8Array(await res.arrayBuffer())
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
        const task = pdfjs.getDocument({ data, useWasm: false })
        const doc = await task.promise
        const shown = Math.min(doc.numPages, MAX_PAGES)
        const ratio = window.devicePixelRatio || 1
        const canvases: HTMLCanvasElement[] = []
        for (let n = 1; n <= shown && !cancelled; n++) {
          const page = await doc.getPage(n)
          const scale = Math.min(3, (width - SIDE) / page.getViewport({ scale: 1 }).width)
          const viewport = page.getViewport({ scale: scale * ratio })
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height)
          canvas.style.width = `${Math.floor(viewport.width / ratio)}px`; canvas.style.height = `${Math.floor(viewport.height / ratio)}px`
          canvas.className = 'rounded-[2px] bg-white shadow-[0_1px_3px_rgb(0_0_0/0.18)]'
          canvas.setAttribute('role', 'img')
          canvas.setAttribute('aria-label', t('Page {n} of {total}', { n, total: doc.numPages }))
          await page.render({ canvas, viewport }).promise
          canvases.push(canvas)
        }
        void task.destroy()
        if (cancelled || !pagesEl.current || !box.current) return
        const el = box.current
        const at = el.scrollHeight > el.clientHeight ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 0
        pagesEl.current.replaceChildren(...canvases)
        el.scrollTop = at * (el.scrollHeight - el.clientHeight)
        setState({ kind: 'ready', pages: doc.numPages, shown })
      } catch (e) { if (!cancelled) setState({ kind: 'error', message: (e as Error).message }) }
    })()
    return () => { cancelled = true }
  }, [url, width])

  return (
    <div ref={box} className="relative h-full min-h-0 overflow-auto bg-hover" aria-busy={state.kind === 'loading'}>
      <div ref={pagesEl} className={`flex flex-col items-center gap-4 px-4 py-4 ${state.kind === 'ready' ? '' : 'hidden'}`} aria-label={t('PDF pages')} role="group" />
      {state.kind === 'ready' && state.shown < state.pages && <p className="pb-6 text-center text-[13px] text-muted">{tp(state.pages, 'Open the PDF to see all {n} page.', 'Open the PDF to see all {n} pages.')}</p>}
      {state.kind === 'loading' && <div className="p-8"><Spinner label={t('Drawing the PDF')} /></div>}
      {state.kind === 'missing' && <div className="p-8">{missing}</div>}
      {state.kind === 'error' && <p className="p-8 text-[13.5px] text-bad" role="alert">{state.message}</p>}
    </div>
  )
}
