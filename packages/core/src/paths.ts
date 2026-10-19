// Document-relative paths: where a link or image in a Markdown file points, as a path relative to the
// folder that holds the notes (no file system access, so the browser can use it too).
/** `../b/c.md#x` from `a/doc.md` → `b/c.md#x`; null for absolute URLs, `mailto:`, or paths that leave the folder. */
export function resolveRel(fromDoc: string, url: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')) return null
  const [pathPart, hash = ''] = url.split('#')
  const base = fromDoc.split('/').slice(0, -1)
  const segs = pathPart.startsWith('/') ? [] : [...base]
  for (const s of pathPart.split('/')) {
    if (!s || s === '.') continue
    if (s === '..') { if (!segs.length) return null; segs.pop() } else {
      let part = s
      try { part = decodeURIComponent(s) } catch { /* keep as written */ }
      segs.push(part)
    }
  }
  const path = segs.join('/')
  return hash ? `${path}#${hash}` : path
}
