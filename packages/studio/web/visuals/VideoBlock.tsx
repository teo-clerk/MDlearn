// A video (DSL v1.4): a file beside the notes in the browser's own player, or a YouTube or Vimeo video that is
// loaded only when you press Play (until then nothing is fetched from those sites). Questions written after it
// with {at=4:15} are its checkpoints: playback pauses there and the question opens below; the chips under the
// player open any of them directly. In a document, "Note at 4:15" pins a note to the current moment (the note card
// sits beside the video's title, which is brought into view).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ExternalLink, Film, Pause, Play, StickyNote, TriangleAlert } from 'lucide-react'
import { formatTime, type Checked, type PosedWidget, type VideoBlock as Video, type WebAnswer } from '@mdlearn/core'
import type { ProseContext } from '../prose/Prose'
import { Practice } from '../widgets/Practice'
import { embedUrl, fileControl, reached, siteUrl, videoLabel, vimeoControl, youtubeControl, type Control } from './videoPlayers'
import { t } from '../i18n'

export interface Checkpoint { at: number; widget: PosedWidget }
/** The event a note dispatches on the player to go back to its moment (detail: seconds). */
export const SEEK_EVENT = 'mdl-video-seek'
interface Props {
  b: Video
  cx: ProseContext
  checkpoints: Checkpoint[]
  check: (widgetId: string, a: WebAnswer) => Promise<Checked>
  noteAt?: (label: HTMLElement, t: number) => void
}

export function VideoBlock({ b, cx, checkpoints, check, noteAt }: Props) {
  const src = b.source
  const site = src.kind === 'youtube' ? 'YouTube' : src.kind === 'vimeo' ? 'Vimeo' : null
  const fig = useRef<HTMLElement>(null)
  const label = useRef<HTMLSpanElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const control = useRef<Control | null>(null)
  const last = useRef(b.start ?? 0)
  const shown = useRef(new Set<number>())
  const [loaded, setLoaded] = useState(src.kind === 'file')
  const [from, setFrom] = useState(b.start)
  const [second, setSecond] = useState(Math.floor(b.start ?? 0))
  const [open, setOpen] = useState<{ i: number; paused: boolean } | null>(null)
  const [answered, setAnswered] = useState<ReadonlySet<number>>(() => new Set())
  const [failed, setFailed] = useState(false)
  const times = useMemo(() => checkpoints.map((c) => c.at), [checkpoints])

  const onTime = useCallback((now: number) => {
    const prev = last.current
    last.current = now
    setSecond(Math.floor(now))
    if (b.end !== undefined && prev < b.end && now >= b.end) control.current?.pause()
    const i = reached(prev, now, times, shown.current)
    if (i === null) return
    shown.current.add(i)
    control.current?.pause()
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    setOpen({ i, paused: true })
  }, [b.end, times])

  useEffect(() => {
    if (!loaded) return
    const c = src.kind === 'file' ? video.current && fileControl(video.current, onTime)
      : frame.current && (src.kind === 'youtube' ? youtubeControl(frame.current, onTime) : vimeoControl(frame.current, onTime))
    if (!c) return
    control.current = c
    return () => { c.destroy(); control.current = null }
  }, [loaded, from, src.kind, onTime])

  const goTo = useCallback((at: number) => {
    last.current = at
    setSecond(Math.floor(at))
    fig.current?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    if (!loaded) { setFrom(at); setLoaded(true); return } // the embed opens there and plays
    control.current?.seek(at)
    control.current?.play()
  }, [loaded])
  useEffect(() => {
    const el = fig.current
    if (!el) return
    const on = (e: Event) => { const at = (e as CustomEvent<unknown>).detail; if (typeof at === 'number') goTo(at) }
    el.addEventListener(SEEK_EVENT, on)
    return () => el.removeEventListener(SEEK_EVENT, on)
  }, [goTo])
  useEffect(() => { if (open?.paused) panel.current?.focus() }, [open])

  const fileUrl = (path: string) => (cx.imageSrc ? cx.imageSrc(path) : path)
  const fragment = b.start !== undefined || b.end !== undefined ? `#t=${b.start ?? 0}${b.end !== undefined ? `,${b.end}` : ''}` : ''
  const segment = b.start !== undefined || b.end !== undefined ? `${formatTime(b.start ?? 0)}–${b.end !== undefined ? formatTime(b.end) : ''}` : null
  const current = open ? checkpoints[open.i] : undefined
  const resume = () => { const wasPaused = open?.paused; setOpen(null); if (wasPaused) control.current?.play() }

  return (
    <>
      <figure ref={fig} data-video={b.id} className="not-prose my-6 rounded-[10px] border border-border px-4 py-3.5">
        <figcaption className="mb-2 flex min-w-0 flex-wrap items-baseline gap-x-2 font-ui text-[14px]">
          <Film className="size-4 shrink-0 self-center text-muted" aria-hidden />
          <span ref={label} className="min-w-0 break-words font-semibold text-text">{videoLabel(b)}</span>
          <span data-no-anchor className="tabular text-[12.5px] text-muted">{site ?? t('Video file')}{segment ? ` · ${segment}` : ''}</span>
        </figcaption>
        {src.kind === 'file' ? (
          failed
            ? <p role="alert" className="flex items-start gap-1.5 rounded-[8px] bg-panel px-3 py-6 font-ui text-[13px] text-muted"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />{t('This video could not be played. MP4 (H.264) and WebM play in every browser.')}</p>
            : <video ref={video} controls preload="metadata" playsInline aria-label={videoLabel(b)} onError={() => setFailed(true)}
                src={`${fileUrl(src.path)}${fragment}`} className="aspect-video w-full rounded-[8px] bg-black">
                {b.captions && <track kind="captions" src={fileUrl(b.captions)} label={t('Captions')} default />}
              </video>
        ) : loaded ? (
          <iframe ref={frame} key={from ?? 0} src={embedUrl(src, from, b.end, location.origin)} title={videoLabel(b)}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
            className="aspect-video w-full rounded-[8px] border-0 bg-black" />
        ) : (
          <div data-no-anchor className="flex aspect-video w-full flex-col items-center justify-center gap-2.5 rounded-[8px] bg-panel px-4 text-center font-ui">
            <button type="button" onClick={() => setLoaded(true)} aria-describedby={`${b.id}-privacy`}
              className="inline-flex h-9 items-center gap-1.5 rounded-[6px] bg-accent px-3.5 text-[13.5px] font-medium text-on-accent hover:brightness-[1.06] cursor-pointer">
              <Play className="size-4" aria-hidden />{t('Play')}
            </button>
            <p id={`${b.id}-privacy`} className="max-w-[46ch] text-[12.5px] text-muted">{t('Plays from {site}. Nothing is loaded from {site} until you press Play.', { site: site! })}</p>
          </div>
        )}
        <div data-no-anchor className="mt-2 flex flex-wrap items-center gap-1.5 font-ui text-[12.5px] text-muted">
          {checkpoints.length > 0 && <span>{t('Questions')}</span>}
          {checkpoints.map((c, i) => (
            <button key={c.widget.id} type="button" aria-pressed={open?.i === i} aria-label={t('Question at {time}', { time: formatTime(c.at) })}
              onClick={() => setOpen(open?.i === i ? null : { i, paused: false })}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 tabular cursor-pointer hover:text-text ${open?.i === i ? 'border-accent text-accent-ink' : 'border-border-strong'}`}>
              {answered.has(i) && <Check className="size-3 text-good" aria-hidden />}{formatTime(c.at)}
            </button>
          ))}
          <span className="ml-auto flex items-center gap-1">
            {noteAt && (
              <button type="button" onClick={() => { if (!label.current) return; label.current.scrollIntoView({ block: 'nearest' }); noteAt(label.current, last.current) }}
                className="inline-flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 tabular hover:bg-hover hover:text-text cursor-pointer">
                <StickyNote className="size-3.5" aria-hidden />{t('Note at {time}', { time: formatTime(second) })}
              </button>
            )}
            {src.kind !== 'file' && (
              <a href={siteUrl(src, second)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 hover:bg-hover hover:text-text">
                <ExternalLink className="size-3.5" aria-hidden />{t('Open on {site}', { site: site! })}
              </a>
            )}
          </span>
        </div>
      </figure>
      {current && open && (
        <div ref={panel} tabIndex={-1} role="group" aria-label={t('Question at {time}', { time: formatTime(current.at) })} className="-mt-3 mb-6 rounded-[10px] pt-1">
          <p className="flex items-center gap-1.5 px-1 font-ui text-[12.5px] text-muted">
            {open.paused && <Pause className="size-3.5" aria-hidden />}
            {open.paused ? t('The video paused here for a question.') : t('Question at {time}', { time: formatTime(current.at) })}
          </p>
          <Practice key={current.widget.id} widget={current.widget}
            check={async (a) => { const r = await check(current.widget.id, a); setAnswered((s) => new Set(s).add(open.i)); return r }} />
          <button type="button" onClick={resume} className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-border-strong px-3 font-ui text-[13px] hover:bg-hover cursor-pointer">
            {open.paused ? <><Play className="size-3.5" aria-hidden />{t('Continue the video')}</> : t('Close')}
          </button>
        </div>
      )}
    </>
  )
}
