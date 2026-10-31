// Collect files from a drop (folders included) or a file input, keeping their relative paths.
export interface Picked { file: File; path: string }
const ACCEPT = /\.(md|markdown|txt|png|jpe?g|gif|webp)$/i
/** What a class hands out. Old Office formats are taken too: they are kept, and the person told what to do about them. */
export const CLASS_ACCEPT = /\.(pdf|pptx?|docx?|odt|odp|md|markdown|txt|png|jpe?g|gif|webp)$/i
export const CLASS_INPUT = '.pdf,.pptx,.ppt,.docx,.doc,.odt,.odp,.md,.markdown,.txt,.png,.jpg,.jpeg,.gif,.webp'
const MAX = 2000

type Entry = { isFile: boolean; isDirectory: boolean; name: string; fullPath: string; file?(ok: (f: File) => void, err: (e: unknown) => void): void; createReader?(): { readEntries(ok: (e: Entry[]) => void, err: (e: unknown) => void): void } }
async function walk(entry: Entry, out: Picked[], accept: RegExp): Promise<void> {
  if (out.length >= MAX || entry.name.startsWith('.')) return
  if (entry.isFile && accept.test(entry.name)) {
    const file = await new Promise<File>((ok, err) => entry.file!(ok, err))
    out.push({ file, path: entry.fullPath.replace(/^\//, '') })
  } else if (entry.isDirectory && !['node_modules', '.git'].includes(entry.name)) {
    const reader = entry.createReader!()
    for (;;) { // readEntries returns at most 100 entries per call (Chromium): read until empty
      const batch = await new Promise<Entry[]>((ok, err) => reader.readEntries(ok, err))
      if (!batch.length) break
      for (const e of batch) await walk(e, out, accept)
    }
  }
}
export async function fromDrop(dt: DataTransfer, accept = ACCEPT): Promise<Picked[]> {
  const out: Picked[] = []
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.() as unknown as Entry | null).filter((e): e is Entry => !!e)
  if (entries.length) for (const e of entries) await walk(e, out, accept)
  else for (const f of [...dt.files]) if (accept.test(f.name)) out.push({ file: f, path: f.name })
  return out
}
export const fromInput = (files: FileList | null, accept = ACCEPT): Picked[] =>
  [...(files ?? [])].filter((f) => accept.test(f.name)).slice(0, MAX).map((f) => ({ file: f, path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name }))
export function toForm(picked: Picked[], name: string): FormData {
  const fd = new FormData()
  fd.append('name', name)
  for (const p of picked) { fd.append('files', p.file, p.file.name); fd.append('paths', p.path) }
  return fd
}
/** A name for the new library folder: the dropped folder's name, or the first file's. */
export const nameFor = (picked: Picked[]) => {
  const first = picked[0]?.path ?? ''
  return first.includes('/') ? first.split('/')[0] : first.replace(/\.[^.]+$/, '') || 'Uploaded notes'
}
