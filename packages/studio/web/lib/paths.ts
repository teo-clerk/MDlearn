// Relative links and images inside a document resolve against the document's folder.
import { resolveRel } from '@mdlearn/core/paths'
export { resolveRel }
export const docRoute = (ws: string, path: string, anchor?: string) => `/w/${ws}/doc?path=${encodeURIComponent(path)}${anchor ? `#${anchor}` : ''}`
export const lessonRoute = (ws: string, path: string) => `/w/${ws}/lesson?path=${encodeURIComponent(path)}`
export const latexRoute = (ws: string, path: string) => `/w/${ws}/latex?path=${encodeURIComponent(path)}`
/** The map: the graph (default) or the layered view, of the whole folder or around one document. */
export const mapRoute = (ws: string, doc?: string, view?: 'layers') => {
  const q = new URLSearchParams()
  if (doc) q.set('doc', doc)
  if (view) q.set('view', view)
  const s = q.toString()
  return `/w/${ws}/map${s ? `?${s}` : ''}`
}
/** In-app route for a link in a document, or null when it should open as an ordinary link. */
export function linkTarget(ws: string, fromDoc: string, url: string): string | null {
  if (url.startsWith('#')) return url
  const r = resolveRel(fromDoc, url)
  if (!r) return null
  const [p, hash] = r.split('#')
  if (/\.learn\.md$/i.test(p)) return lessonRoute(ws, p)
  if (/\.(md|markdown)$/i.test(p)) return docRoute(ws, p, hash)
  if (/\.tex$/i.test(p)) return latexRoute(ws, p)
  return null
}
export const assetUrl = (ws: string, fromDoc: string, url: string) => {
  const r = resolveRel(fromDoc, url)
  return r ? `/api/w/${ws}/asset?path=${encodeURIComponent(r.split('#')[0])}` : url
}
