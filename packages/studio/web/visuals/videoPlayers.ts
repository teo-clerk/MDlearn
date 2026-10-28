// The three ways a video plays, behind one small interface: the browser's own <video> for files, and the YouTube
// (privacy-enhanced domain) and Vimeo players in a frame. The frames are driven with postMessage, the protocol
// their own script libraries use, so no outside script is loaded into this page. Messages are accepted only from
// that frame's window and that site's origin.
import type { VideoBlock } from '@mdlearn/core'

export interface Control {
  play(): void
  pause(): void
  seek(t: number): void
  destroy(): void
}
export type OnTime = (t: number) => void
type Source = VideoBlock['source']

export const YOUTUBE_ORIGIN = 'https://www.youtube-nocookie.com'
export const VIMEO_ORIGIN = 'https://player.vimeo.com'
/** Two time reports further apart than this were a jump (a seek), not playback passing a checkpoint. */
const MAX_STEP = 2

/** The player page for a YouTube or Vimeo video, starting at `start` and playing at once (it opens on a click). */
export function embedUrl(source: Exclude<Source, { kind: 'file' }>, start: number | undefined, end: number | undefined, origin: string): string {
  if (source.kind === 'youtube') {
    const q = new URLSearchParams({ enablejsapi: '1', autoplay: '1', rel: '0', playsinline: '1', origin })
    if (start) q.set('start', String(Math.floor(start)))
    if (end) q.set('end', String(Math.ceil(end)))
    return `${YOUTUBE_ORIGIN}/embed/${source.id}?${q}`
  }
  const q = new URLSearchParams({ autoplay: '1', dnt: '1', playsinline: '1' })
  if (source.hash) q.set('h', source.hash)
  return `${VIMEO_ORIGIN}/video/${source.id}?${q}${start ? `#t=${Math.floor(start)}s` : ''}`
}
/** The page of the video on its own site, for "Open on YouTube". */
export function siteUrl(source: Exclude<Source, { kind: 'file' }>, at = 0): string {
  const t = Math.floor(at)
  if (source.kind === 'youtube') return `https://www.youtube.com/watch?v=${source.id}${t ? `&t=${t}s` : ''}`
  return `https://vimeo.com/${source.id}${source.hash ? `/${source.hash}` : ''}${t ? `#t=${t}s` : ''}`
}
/** What to show (and anchor notes to) when the author gave no title: the file name, or the address. */
export function videoLabel(b: Pick<VideoBlock, 'title' | 'source'>): string {
  if (b.title) return b.title
  const s = b.source
  return s.kind === 'file' ? s.path.split('/').pop()! : s.kind === 'youtube' ? `youtube.com/watch?v=${s.id}` : `vimeo.com/${s.id}`
}

/**
 * The checkpoint playback has just reached, if any: one whose time lies between two time reports that are a
 * moment of ordinary playback apart (a seek past a checkpoint does not stop there), and not shown before.
 */
export function reached(prev: number, now: number, times: number[], shown: ReadonlySet<number>): number | null {
  if (now <= prev || now - prev > MAX_STEP) return null
  const i = times.findIndex((at, k) => !shown.has(k) && prev < at && at <= now)
  return i < 0 ? null : i
}

export function fileControl(el: HTMLVideoElement, onTime: OnTime): Control {
  const tick = () => onTime(el.currentTime)
  el.addEventListener('timeupdate', tick)
  return {
    play: () => { void el.play().catch(() => {}) },
    pause: () => el.pause(),
    seek: (t) => { el.currentTime = t },
    destroy: () => el.removeEventListener('timeupdate', tick),
  }
}

/** A frame's message, if it really comes from that frame and that site; JSON text or an object. */
function messageFrom(e: MessageEvent, frame: HTMLIFrameElement, origin: string): Record<string, unknown> | null {
  if (e.origin !== origin || e.source !== frame.contentWindow) return null
  let data: unknown = e.data
  if (typeof data === 'string') { try { data = JSON.parse(data) } catch { return null } }
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : null
}

export function youtubeControl(frame: HTMLIFrameElement, onTime: OnTime): Control {
  const send = (msg: object) => frame.contentWindow?.postMessage(JSON.stringify({ ...msg, id: 1, channel: 'widget' }), YOUTUBE_ORIGIN)
  const command = (func: string, args: unknown[] = []) => send({ event: 'command', func, args })
  let answered = false
  // the player starts reporting once it hears that someone is listening; say so until it answers
  const hello = window.setInterval(() => { if (answered) window.clearInterval(hello); else send({ event: 'listening' }) }, 250)
  const stopHello = window.setTimeout(() => window.clearInterval(hello), 15_000)
  const onMessage = (e: MessageEvent) => {
    const m = messageFrom(e, frame, YOUTUBE_ORIGIN)
    if (!m) return
    answered = true
    const info = m.info as { currentTime?: unknown } | undefined
    if (m.event === 'infoDelivery' && typeof info?.currentTime === 'number') onTime(info.currentTime)
  }
  window.addEventListener('message', onMessage)
  return {
    play: () => command('playVideo'),
    pause: () => command('pauseVideo'),
    seek: (t) => command('seekTo', [t, true]),
    destroy: () => { window.clearInterval(hello); window.clearTimeout(stopHello); window.removeEventListener('message', onMessage) },
  }
}

export function vimeoControl(frame: HTMLIFrameElement, onTime: OnTime): Control {
  const send = (method: string, value?: unknown) => frame.contentWindow?.postMessage(value === undefined ? { method } : { method, value }, VIMEO_ORIGIN)
  const onMessage = (e: MessageEvent) => {
    const m = messageFrom(e, frame, VIMEO_ORIGIN)
    if (!m) return
    if (m.event === 'ready') send('addEventListener', 'timeupdate')
    const data = m.data as { seconds?: unknown } | undefined
    if (m.event === 'timeupdate' && typeof data?.seconds === 'number') onTime(data.seconds)
  }
  window.addEventListener('message', onMessage)
  return {
    play: () => send('play'),
    pause: () => send('pause'),
    seek: (t) => send('setCurrentTime', t),
    destroy: () => window.removeEventListener('message', onMessage),
  }
}
