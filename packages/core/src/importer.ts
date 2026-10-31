// Importer — deterministic reading of curriculum documents (a numbered house style and plain Markdown).
// No LLM involved: metadata, the section tree and exact section text come straight from the source,
// so the agent only writes the learning layer and never re-types structure.
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { toString } from 'mdast-util-to-string'
import GithubSlugger from 'github-slugger'
import type { Root } from 'mdast'

export type DocKind = 'concept' | 'assessment' | 'milestones' | 'readme' | 'brief' | 'reference'
export type SectionRole = 'content' | 'bridge' | 'worked' | 'exercises' | 'lookup' | 'howto'

export interface SectionInfo {
  /** Section number as written ("5.1"), or null for unnumbered headings. */
  num: string | null
  title: string
  /** GitHub-style anchor, unique within the document. */
  anchor: string
  depth: number
  role: SectionRole
  /** 1-based inclusive line range of the section, heading included, children included. */
  startLine: number
  endLine: number
  words: number
  displayMath: number
  codeBlocks: number
}
export interface DocOutline {
  path: string
  title: string
  /** "04", "01.03", "00.2" — the document number in the title, if any. */
  docNo: string | null
  kind: DocKind
  track?: string
  timeMin?: number
  difficulty?: number
  level?: 'beginner' | 'intermediate' | 'advanced'
  milestone?: string
  prerequisites: { label: string; href: string }[]
  objectives: string[]
  deliverable?: string
  words: number
  sections: SectionInfo[]
}

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath)
const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length

function roleOf(title: string): SectionRole {
  if (/^bridge to what you already know/i.test(title)) return 'bridge'
  if (/where to look things up|further reading|references/i.test(title)) return 'lookup'
  if (/^(\d+\.\s*)?how to use this/i.test(title)) return 'howto'
  if (/exercise|self-assessment|interview|problems/i.test(title)) return 'exercises'
  if (/worked/i.test(title)) return 'worked'
  return 'content'
}
function kindOf(path: string, title: string): DocKind {
  const base = path.split('/').pop() ?? path
  if (/^readme\.md$/i.test(base)) return 'readme'
  if (/milestones\.md$/i.test(base)) return 'milestones'
  if (/exercises|assessment|interview/i.test(base) || /exercises|interview/i.test(title)) return 'assessment'
  if (/mission_brief/i.test(base)) return 'brief'
  if (/^[A-Z_]+\.md$/.test(base)) return 'reference'
  return 'concept'
}
export function levelFromDifficulty(d?: number): DocOutline['level'] {
  if (d === undefined) return undefined
  return d <= 2 ? 'beginner' : d === 3 ? 'intermediate' : 'advanced'
}

/** Parse the house-style front-matter blockquote (tolerant: any field may be missing). */
function frontMatter(lines: string[]) {
  const firstH2 = lines.findIndex((l) => /^##\s/.test(l))
  const head = lines.slice(0, firstH2 < 0 ? Math.min(lines.length, 60) : firstH2)
  const quoted = head.filter((l) => /^>/.test(l)).map((l) => l.replace(/^>\s?/, ''))
  const text = quoted.join('\n')
  const field = (name: string) => new RegExp(`\\*\\*${name}\\*\\*:\\s*([^·\\n]+)`, 'i').exec(text)?.[1].trim()
  const time = field('Est\\. time') ?? field('Est\\. total')
  const hours = time ? parseFloat(time.replace(',', '.')) : NaN
  const difficulty = Number(field('Difficulty'))
  const prereqBlock = /\*\*Prerequisites?\*\*:([\s\S]*?)(?=\*\*Learning objectives|\*\*Deliverable|\*\*Rule|$)/i.exec(text)?.[1] ?? ''
  const prerequisites = [...prereqBlock.matchAll(/\[`?([^`\]]+)`?\]\(([^)]+)\)/g)].map((m) => ({ label: m[1], href: m[2] }))
  const objBlock = /\*\*Learning objectives\*\*[^\n]*\n([\s\S]*?)(?=\n\s*\*\*Deliverable|$)/i.exec(text)?.[1] ?? ''
  const objectives: string[] = []
  for (const line of objBlock.split('\n')) {
    const item = /^\s*\d+\.\s+(.*)$/.exec(line)
    if (item) objectives.push(item[1].trim())
    else if (objectives.length && line.trim() && !/^\s*$/.test(line)) objectives[objectives.length - 1] += ' ' + line.trim()
  }
  const deliverable = /\*\*Deliverable\*\*:\s*([\s\S]*?)(?=\n\s*\n|$)/i.exec(text)?.[1].replace(/\s+/g, ' ').trim()
  const milestone = field('Milestone')?.replace(/`/g, '')
  return {
    track: field('Track'),
    timeMin: Number.isFinite(hours) ? Math.round(hours * 60) : undefined,
    difficulty: Number.isFinite(difficulty) && difficulty > 0 ? difficulty : undefined,
    milestone, prerequisites, objectives, deliverable,
  }
}

interface RawHeading { depth: number; text: string; line: number }
/**
 * ATX headings outside fenced code. Deliberately line-based: real notes contain `$$ … $$` on content
 * lines, which makes a Markdown parser swallow the rest of the file (DSL_SPECIFICATION §6).
 */
export function scanHeadings(lines: string[]): RawHeading[] {
  const out: RawHeading[] = []
  let fence: { ch: string; len: number } | null = null
  for (const [i, l] of lines.entries()) {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(l)
    if (fence) { if (f && f[1][0] === fence.ch && f[1].length >= fence.len && /^\s*[`~]+\s*$/.test(l)) fence = null; continue }
    if (f) { fence = { ch: f[1][0], len: f[1].length }; continue }
    const h = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l)
    if (h) out.push({ depth: h[1].length, text: inlineText(h[2]), line: i + 1 })
  }
  return out
}
/** Plain text of a heading: drop emphasis and code markers, keep numbers and math as written. */
const inlineText = (s: string) =>
  s.replace(/`/g, '').replace(/\*\*|__/g, '').replace(/(^|[\s(])[*_](\S[^*_]*?)[*_](?=[\s).,:;!?]|$)/g, '$1$2').trim()

export function outlineDoc(md: string, path = 'doc.md'): DocOutline {
  const src = md.replace(/\r\n?/g, '\n')
  const lines = src.split('\n')
  const slugger = new GithubSlugger()
  const headings = scanHeadings(lines)
  const h1 = headings.find((h) => h.depth === 1)
  const rawTitle = h1 ? h1.text : (path.split('/').pop() ?? path).replace(/\.md$/, '')
  const no = /^(\d+(?:\.\d+)*)\.?\s*(?:—|-|–)?\s*/.exec(rawTitle)
  const title = no ? rawTitle.slice(no[0].length).trim() || rawTitle : rawTitle
  const sections: SectionInfo[] = []
  const hs = headings.filter((h) => h.depth >= 2 && h.depth <= 4)
  for (const [i, h] of hs.entries()) {
    const t = h.text
    const next = hs.slice(i + 1).find((x) => x.depth <= h.depth)
    const end = next ? next.line - 1 : lines.length
    const body = lines.slice(h.line - 1, end).join('\n')
    const num = /^(\d+(?:\.\d+)*|[A-Z]\d+)\.?\s/.exec(t)?.[1] ?? null
    sections.push({
      num, title: num ? t.slice(t.indexOf(num) + num.length).replace(/^\.?\s*/, '') : t,
      anchor: slugger.slug(t), depth: h.depth, role: roleOf(t.replace(/^[\d.]+\s*/, '')),
      startLine: h.line, endLine: end, words: wordCount(body),
      displayMath: (body.match(/\$\$/g) ?? []).length >> 1,
      codeBlocks: (body.match(/^\s*(```|~~~)/gm) ?? []).length >> 1,
    })
  }
  const fm = frontMatter(lines)
  return {
    path, title, docNo: no?.[1] ?? null, kind: kindOf(path, rawTitle),
    ...fm, level: levelFromDifficulty(fm.difficulty), words: wordCount(src), sections,
  }
}

/**
 * Resolve a section reference: "5.1", "§5.1", "A2", an anchor ("5-range-resolution"),
 * or a case-insensitive title fragment. Returns null when nothing matches.
 */
export function findSection(outline: DocOutline, ref: string): SectionInfo | null {
  const r = ref.trim().replace(/^§\s*/, '')
  return outline.sections.find((s) => s.num === r)
    ?? outline.sections.find((s) => s.anchor === r)
    ?? outline.sections.find((s) => s.title.toLowerCase() === r.toLowerCase())
    ?? outline.sections.find((s) => s.title.toLowerCase().includes(r.toLowerCase()) && r.length >= 4)
    ?? null
}

/** Exact Markdown of a section (heading included), optionally truncated to a word budget. */
export function sectionText(md: string, outline: DocOutline, ref: string, maxWords?: number): { section: SectionInfo; text: string; truncated: boolean } | null {
  const s = findSection(outline, ref)
  if (!s) return null
  const text = md.replace(/\r\n?/g, '\n').split('\n').slice(s.startLine - 1, s.endLine).join('\n').trimEnd()
  if (!maxWords || s.words <= maxWords) return { section: s, text, truncated: false }
  let count = 0, cut = text.length
  for (const m of text.matchAll(/\S+/g)) { if (++count > maxWords) { cut = m.index; break } }
  // never cut inside display math or a code fence: back up to the last blank line
  const safe = text.lastIndexOf('\n\n', cut)
  return { section: s, text: text.slice(0, safe > 0 ? safe : cut).trimEnd(), truncated: true }
}

export interface LessonPlan {
  id: string
  file: string
  title: string
  sections: string[]
  words: number
  kind: 'companion' | 'assessment'
}
/**
 * Split a document into companion lessons: consecutive top-level sections are grouped until a
 * group reaches `targetWords` of source text (default 2,500 ≈ 10–15 cards of retrieval).
 * "How to use" and "Where to look things up" sections are skipped; assessment documents
 * become one lesson per part.
 */
export function planLessons(outline: DocOutline, opts: { targetWords?: number; idPrefix?: string } = {}): LessonPlan[] {
  const target = opts.targetWords ?? 2500
  const top = outline.sections.filter((s) => s.depth === 2 && s.role !== 'lookup' && s.role !== 'howto')
  const prefix = opts.idPrefix ?? idPrefixFor(outline)
  const groups: { secs: SectionInfo[]; words: number }[] = []
  const assessment = outline.kind === 'assessment'
  for (const s of top) {
    const g = groups[groups.length - 1]
    if (!g || assessment || g.words >= target || g.words + s.words > target * 1.6) groups.push({ secs: [s], words: s.words })
    else { g.secs.push(s); g.words += s.words }
  }
  // fold a tiny trailing group into its predecessor
  if (groups.length > 1 && groups[groups.length - 1].words < target / 4 && !assessment) {
    const last = groups.pop()!; groups[groups.length - 1].secs.push(...last.secs); groups[groups.length - 1].words += last.words
  }
  const slug = new GithubSlugger()
  return groups.map((g, i) => {
    const title = g.secs.length === 1 ? g.secs[0].title : `${g.secs[0].title} → ${g.secs[g.secs.length - 1].title}`
    const s = slug.slug(g.secs[0].title).replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').slice(0, 40).replace(/^-+|-+$/g, '')
    const nn = String(i + 1).padStart(2, '0')
    return { id: `${prefix}-${nn}-${s}`.replace(/--+/g, '-'), file: `${nn}-${s}.learn.md`, title,
      sections: g.secs.map((x) => x.num ?? x.anchor), words: g.words, kind: assessment ? 'assessment' : 'companion' }
  })
}
/** "00_FOUNDATIONS/04_sar….md" → "f04"; "01_FLOOD…/docs/03_dem….md" → "p1-03"; else the file slug. */
export function idPrefixFor(outline: Pick<DocOutline, 'path'>): string {
  const parts = outline.path.split('/')
  const file = parts[parts.length - 1].replace(/\.md$/, '')
  const nn = /^(\d+)_/.exec(file)?.[1]
  const proj = parts.map((p) => /^(\d{2})_[A-Z]/.exec(p)?.[1]).find(Boolean)
  if (proj === '00' && nn) return `f${nn}`
  if (proj && nn) return `p${Number(proj)}-${nn}`
  if (proj) return `p${Number(proj)}-${new GithubSlugger().slug(file)}`
  return new GithubSlugger().slug(file)
}

/** Deterministic companion-lesson skeleton: frontmatter, one card per subsection, ::read links. */
export function scaffoldLesson(o: DocOutline, plan: LessonPlan & { source: string }, prevId: string | undefined): string {
  const tops = o.sections.filter((s) => s.depth === 2 && plan.sections.includes(s.num ?? s.anchor))
  const cards: string[] = []
  for (const top of tops) {
    const subs = o.sections.filter((s) => s.depth === 3 && s.startLine > top.startLine && s.endLine <= top.endLine && s.role !== 'lookup')
    // a top section's own lead (text before its first subsection) gets a card when it is substantial
    const leadWords = subs.length ? top.words - subs.reduce((n, s) => n + s.words, 0) : top.words
    const units = subs.length ? (leadWords >= 120 ? [top, ...subs] : subs) : [top]
    for (const u of units) {
      const ref = u.num ? `§${u.num}` : `§${u.anchor}`
      cards.push(`## ${u.title.replace(/\s*—.*$/, '').slice(0, 60)}\n\n::read[${ref}]\n\n<!-- TODO(${u.role}, ${u.words}w): gist in ≤ 3 sentences + a widget testing this section -->`)
    }
  }
  const prereq = prevId ? `[${prevId}]` : '[]'
  return `---
title: ${JSON.stringify(plan.title.replace(/\s*→\s*/, ' to '))}
id: ${plan.id}
level: ${o.level ?? 'intermediate'}
lang: en
source: ${plan.source}
prereq: ${prereq}
goals:
  - TODO
---
<!-- scaffold from ${o.path} §${plan.sections.join(', §')} (${plan.words} source words). Objectives of the document:
${o.objectives.map((x, i) => `  ${i + 1}. ${x}`).join('\n')}
Pick 2–4 that these sections serve as goals; delete this comment. -->

${cards.join('\n\n')}
`
}

