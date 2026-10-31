// Word and PowerPoint files → Markdown, so any assistant can read a class's slides and handouts. Pictures are kept;
// equations can't come through as text, so they are counted and the person is told. These are untrusted zip files:
// their unpacked size is capped first, and only the parts named here are read.
import { posix } from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import { DOMParser } from 'linkedom'
import mammoth from 'mammoth'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { UserError } from '../workspaces.js'
import { pictureType } from '../pictures.js'

const MAX_UNPACKED = 400 * 1024 * 1024
const MAX_PICTURES = 500

export interface OfficePicture { name: string; bytes: Uint8Array }
export interface OfficeText { markdown: string; pictures: OfficePicture[]; skipped: number; equations: number; slides?: number }

type Files = Record<string, Uint8Array>
function unzip(bytes: Uint8Array, keep: (name: string) => boolean): Files {
  let total = 0
  try {
    return unzipSync(bytes, { filter: (f) => {
      total += f.originalSize
      if (total > MAX_UNPACKED) throw new UserError('too-large', 'This file unpacks to more than 400 MB.')
      return keep(f.name)
    } })
  } catch (e) {
    if (e instanceof UserError) throw e
    throw new UserError('invalid', 'This file could not be opened. It may be damaged.')
  }
}

// ---------------------------------------------------------------- Word
const SKIPPED = 'mdl-skipped-picture'
/** Word tables have no header row and wrap each cell in a paragraph: Markdown tables need the first and can't hold the second. */
const plainTables = (html: string) => html.replace(/<table>[\s\S]*?<\/table>/g, (table) => table
  .replace(/<(t[dh])><p>((?:(?!<\/?p>)[\s\S])*)<\/p><\/\1>/g, '<$1>$2</$1>')
  .replace(/<tr>[\s\S]*?<\/tr>/, (row) => row.replace(/<(\/?)td>/g, '<$1th>')))

export async function wordToMarkdown(bytes: Uint8Array, mediaUrl: (name: string) => string): Promise<OfficeText> {
  const files = unzip(bytes, (n) => n === 'word/document.xml')
  const body = files['word/document.xml']
  if (!body) throw new UserError('invalid', 'This is not a Word file.')
  const equations = strFromU8(body).match(/<m:oMath[ >]/g)?.length ?? 0
  const pictures: OfficePicture[] = []
  let skipped = 0
  const { value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) }, {
    convertImage: mammoth.images.imgElement(async (image) => {
      const data = new Uint8Array(await image.read())
      const type = pictureType(data)
      if (!type || pictures.length >= MAX_PICTURES) { skipped++; return { src: SKIPPED } }
      const name = `picture-${pictures.length + 1}.${type}`
      pictures.push({ name, bytes: data })
      const alt = (image as { altText?: string }).altText // mammoth passes it, its types leave it out
      return { src: mediaUrl(name), alt: alt || `Picture ${pictures.length}` }
    }),
  })
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*', hr: '---' })
  td.use(gfm)
  const markdown = td.turndown(plainTables(html)).replace(new RegExp(`!\\[[^\\]]*\\]\\(${SKIPPED}\\)\\n*`, 'g'), '')
    .replace(/^(\s*)-   /gm, '$1- ').replace(/^(\s*\d+\.)   /gm, '$1 ')
    .replace(/^(#{1,5}) /gm, '#$1 ') // the file's name is the title; its headings sit below it
  return { markdown: markdown.trim(), pictures, skipped, equations }
}

// ---------------------------------------------------------------- PowerPoint
type El = { localName?: string; tagName: string; childNodes: unknown[]; children: El[]; getAttribute(n: string): string | null; textContent: string | null }
const xml = (bytes: Uint8Array): El => new DOMParser().parseFromString(strFromU8(bytes), 'text/xml').documentElement as unknown as El
const elements = (el: El): El[] => [...(el.children ?? [])]
const named = (el: El, name: string) => elements(el).find((c) => c.tagName === name)
/** Every descendant with one of these tags, in document order. */
function descendants(el: El, names: ReadonlySet<string>): El[] {
  return elements(el).flatMap((c) => [...(names.has(c.tagName) ? [c] : []), ...descendants(c, names)])
}
const relationsOf = (files: Files, part: string): Map<string, { type: string; target: string }> => {
  const file = files[posix.join(posix.dirname(part), '_rels', `${posix.basename(part)}.rels`)]
  if (!file) return new Map()
  return new Map(elements(xml(file)).map((r) => [r.getAttribute('Id') ?? '', {
    type: r.getAttribute('Type') ?? '',
    target: posix.normalize(posix.join(posix.dirname(part), r.getAttribute('Target') ?? '')),
  }]))
}
const TEXT = new Set(['a:t', 'm:t'])
const plain = (s: string) => s.replace(/\s+/g, ' ').replace(/</g, '&lt;').trim()
const textOf = (el: El) => plain(descendants(el, TEXT).map((t) => t.textContent ?? '').join(''))
const paragraphs = (body: El) => descendants(body, new Set(['a:p'])).map((p) => ({ text: textOf(p), level: Number(named(p, 'a:pPr')?.getAttribute('lvl') ?? 0) })).filter((p) => p.text)

interface Slide { title: string; lines: string[] }
function shape(sp: El, slide: Slide): void {
  const kind = named(named(sp, 'p:nvSpPr') ?? sp, 'p:nvPr')
  const placeholder = kind && named(kind, 'p:ph')?.getAttribute('type')
  const body = named(sp, 'p:txBody')
  if (!body || placeholder === 'sldNum' || placeholder === 'dt' || placeholder === 'ftr') return
  const items = paragraphs(body)
  if ((placeholder === 'title' || placeholder === 'ctrTitle') && !slide.title) { slide.title = items.map((i) => i.text).join(' '); return }
  // a text box with one line reads as a sentence; anything longer as the bullets it usually is
  if (items.length === 1 && !items[0].level) slide.lines.push(items[0].text)
  else slide.lines.push(items.map((i) => `${'  '.repeat(i.level)}- ${i.text}`).join('\n'))
}
function table(frame: El, slide: Slide): void {
  const rows = descendants(frame, new Set(['a:tr'])).map((tr) => elements(tr).filter((c) => c.tagName === 'a:tc').map((tc) => textOf(tc).replace(/\|/g, '\\|')))
  if (!rows.length) return
  const width = Math.max(...rows.map((r) => r.length))
  const row = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`
  slide.lines.push([row(rows[0]), row(Array(width).fill('---')), ...rows.slice(1).map(row)].join('\n'))
}

export function slidesToMarkdown(bytes: Uint8Array, mediaUrl: (name: string) => string): OfficeText {
  const files = unzip(bytes, (n) => /^ppt\/(presentation\.xml|_rels\/|slides\/|notesSlides\/|media\/)/.test(n))
  const deck = 'ppt/presentation.xml'
  if (!files[deck]) throw new UserError('invalid', 'This is not a PowerPoint file.')
  const parts = relationsOf(files, deck)
  const order = descendants(xml(files[deck]), new Set(['p:sldId'])).map((s) => parts.get(s.getAttribute('r:id') ?? '')?.target).filter((p): p is string => !!p && !!files[p])
  const pictures: OfficePicture[] = []
  const savedAs = new Map<string, string>()
  let skipped = 0, equations = 0
  const out: string[] = []
  order.forEach((part, index) => {
    const n = index + 1, root = xml(files[part]), rels = relationsOf(files, part)
    const slide: Slide = { title: '', lines: [] }
    const picture = (pic: El) => {
      const id = descendants(pic, new Set(['a:blip']))[0]?.getAttribute('r:embed') ?? ''
      const media = rels.get(id)?.target, data = media ? files[media] : undefined
      const type = data ? pictureType(data) : null
      if (!data || !type || (!savedAs.has(media!) && pictures.length >= MAX_PICTURES)) { skipped++; return }
      if (!savedAs.has(media!)) {
        const name = `slide-${n}-picture-${pictures.length + 1}.${type}`
        savedAs.set(media!, name); pictures.push({ name, bytes: data })
      }
      const about = plain(descendants(pic, new Set(['p:cNvPr']))[0]?.getAttribute('descr') ?? '')
      slide.lines.push(`![${about || `Picture from slide ${n}`}](${mediaUrl(savedAs.get(media!)!)})`)
    }
    const walk = (tree: El) => {
      for (const el of elements(tree)) {
        if (el.tagName === 'p:sp') { equations += descendants(el, new Set(['a14:m'])).length; shape(el, slide) }
        else if (el.tagName === 'p:pic') picture(el)
        else if (el.tagName === 'p:graphicFrame') table(el, slide)
        else if (el.tagName === 'p:grpSp') walk(el)
        else if (el.tagName === 'mc:AlternateContent') {
          // an equation carries a picture of itself as its fallback: the only faithful copy here
          equations += descendants(el, new Set(['a14:m'])).length
          walk(named(el, 'mc:Fallback') ?? named(el, 'mc:Choice') ?? el)
        }
      }
    }
    const tree = descendants(root, new Set(['p:spTree']))[0]
    if (tree) walk(tree)
    const notesPart = [...rels.values()].find((r) => r.type.endsWith('/notesSlide'))?.target
    const notes = notesPart && files[notesPart]
      ? descendants(xml(files[notesPart]), new Set(['p:sp'])).filter((sp) => descendants(sp, new Set(['p:ph']))[0]?.getAttribute('type') === 'body').flatMap((sp) => paragraphs(sp).map((p) => p.text))
      : []
    out.push([`## Slide ${n}${slide.title ? `: ${slide.title}` : ''}`, ...slide.lines, ...(notes.length ? [`> Speaker notes: ${notes.join(' ')}`] : [])].join('\n\n'))
  })
  if (!order.length) throw new UserError('invalid', 'This PowerPoint file has no slides.')
  return { markdown: out.join('\n\n'), pictures, skipped, equations, slides: order.length }
}
