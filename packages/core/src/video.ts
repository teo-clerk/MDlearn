// Video (DSL v1.4): where a `::video` (or a Markdown image whose address is a video) plays from, and the time
// stamps of its segment and checkpoints. Pure, shared by the compiler and the players.

export type VideoSource = { kind: 'file'; path: string } | { kind: 'youtube'; id: string } | { kind: 'vimeo'; id: string; hash?: string }
/** Formats the browsers play natively (QuickTime `.mov` only when it holds H.264). */
export const VIDEO_FILE = /\.(mp4|m4v|webm|ogv|mov)$/i

/** The longest time accepted (100 hours), so a typo cannot become an endless or infinite time. */
export const MAX_TIME = 100 * 3600
/** `4:15`, `1:02:03`, `90`, `90s`, `1m30s`, `1h2m` → seconds; anything else (or over 100 hours) → null. */
export function parseTime(raw: string): number | null {
  const t = readTime(raw.trim().toLowerCase())
  return t !== null && Number.isFinite(t) && t <= MAX_TIME ? t : null
}
function readTime(s: string): number | null {
  if (/^\d+(\.\d+)?s?$/.test(s)) return parseFloat(s)
  const units = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(s)
  if (units && (units[1] || units[2] || units[3])) return (+(units[1] ?? 0)) * 3600 + (+(units[2] ?? 0)) * 60 + (+(units[3] ?? 0))
  const parts = s.split(':')
  if (parts.length < 2 || parts.length > 3 || !parts.every((p) => /^\d+(\.\d+)?$/.test(p))) return null
  const nums = parts.map(Number)
  // every field after the first is a 0–59 count of minutes or seconds
  if (nums.slice(1).some((n) => n >= 60)) return null
  return nums.reduce((total, n) => total * 60 + n, 0)
}

/** 255 → `4:15`, 3723 → `1:02:03`. */
export function formatTime(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds))
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60
  const two = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/
const YOUTUBE_HOSTS = new Set(['youtube.com', 'youtube-nocookie.com', 'youtu.be'])

/**
 * A YouTube or Vimeo address, or a relative path to a video file → where it plays from (and a start time given in
 * the address, such as YouTube's `t=`). Any other address (another site, an absolute path, a script URL) → null:
 * other sites are not embedded, so nothing is fetched from servers the reader did not choose.
 */
export function parseVideoUrl(raw: string): { source: VideoSource; start?: number } | null {
  const s = raw.trim()
  if (!s) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return parseRemote(s)
  const path = s.split(/[?#]/)[0]
  if (path.startsWith('/') || path.startsWith('\\') || !VIDEO_FILE.test(path)) return null
  return { source: { kind: 'file', path } }
}

function parseRemote(s: string): { source: VideoSource; start?: number } | null {
  let url: URL
  try { url = new URL(s) } catch { return null }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '')
  const segs = url.pathname.split('/').filter(Boolean)
  if (YOUTUBE_HOSTS.has(host)) {
    const id = host === 'youtu.be' ? segs[0] : segs[0] === 'watch' ? url.searchParams.get('v') : ['embed', 'shorts', 'live'].includes(segs[0] ?? '') ? segs[1] : null
    if (!id || !YOUTUBE_ID.test(id)) return null
    const t = url.searchParams.get('t') ?? url.searchParams.get('start')
    const start = t ? parseTime(t) : null
    return { source: { kind: 'youtube', id }, ...(start ? { start } : {}) }
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const [id, hash] = host === 'player.vimeo.com' ? [segs[0] === 'video' ? segs[1] : undefined, url.searchParams.get('h') ?? undefined] : [segs[0], segs[1]]
    if (!id || !/^\d{1,12}$/.test(id)) return null
    return { source: { kind: 'vimeo', id, ...(hash && /^[0-9a-f]{6,20}$/i.test(hash) ? { hash } : {}) } }
  }
  return null
}
