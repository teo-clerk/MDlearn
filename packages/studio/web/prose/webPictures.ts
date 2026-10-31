// Which sites may show pictures in which document, and fetching them. The page policy blocks web pictures, so a document
// can't reach out by itself; the server fetches one (see server/web-pictures.ts) once its site is allowed there. It stops
// at that document because a document writes the whole address, and a later one could carry anything out in it.
import { useMemo, useSyncExternalStore } from 'react'

const KEY = 'mdl-picture-sites'
const load = (): readonly string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[] } catch { return [] } }
let sites = load()
const listeners = new Set<() => void>()
function save(next: readonly string[]) {
  sites = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private mode: this visit only */ }
  for (const l of listeners) l()
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

export const fromWeb = (src: string) => /^https:/i.test(src)
export const siteOf = (src: string) => (URL.canParse(src) ? new URL(src).hostname : '')
const page = () => `${location.pathname}?${new URLSearchParams(location.search).get('path') ?? ''}\n`
const sitesHere = () => sites.filter((s) => s.startsWith(page())).map((s) => s.slice(page().length)).join('\n')
export const useAllowedSites = () => {
  const here = useSyncExternalStore(subscribe, sitesHere)
  return useMemo(() => (here ? here.split('\n') : []), [here])
}
/** Every site allowed in any document, for Settings. */
export const useSitesAnywhere = () => {
  const every = useSyncExternalStore(subscribe, () => sites)
  return useMemo(() => [...new Set(every.map((s) => s.slice(s.lastIndexOf('\n') + 1)))], [every])
}
export const allowSite = (site: string) => { if (site && !sites.includes(page() + site)) save([...sites, page() + site]) }
export const forgetSites = () => save([])

const loaded = new Map<string, Promise<string>>()
/** An address the page may show (a blob), fetched through the server. The header is one a plain <img> can't send. */
export function loadWebPicture(src: string): Promise<string> {
  const known = loaded.get(src)
  if (known) return known
  const picture = fetch(`/api/web-picture?url=${encodeURIComponent(src)}`, { headers: { 'x-mdl': '1' } }).then(async (r) => {
    if (!r.ok) throw new Error('not loaded')
    return URL.createObjectURL(await r.blob())
  })
  picture.catch(() => loaded.delete(src))
  loaded.set(src, picture)
  return picture
}
