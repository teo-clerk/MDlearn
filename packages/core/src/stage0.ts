// Stage 0 — line scanner. Linear time, aware of code fences, display math and frontmatter.
// Repairs predictable LLM drift, applies Pandoc fenced-div nesting semantics, and extracts
// blanks / hint labels into side tables so micromark never sees them.
import { WIDGET_TYPES } from './ast.js'
import type { Code, Diagnostic } from './registry.js'

export const PH_OPEN = ''
export const PH_CLOSE = ''
export const PH_STRAY = ''

export interface SideBlank {
  id: string; answers: string[]; inMath: boolean; line: number
  tol?: { abs?: number; rel?: number }; hint?: string
}
export interface Stage0Result {
  text: string
  lineMap: number[] // output line (0-based) -> original line (1-based)
  frontmatter?: { raw: string; line: number }
  blanks: Map<string, SideBlank>
  hints: Map<string, { raw: string; line: number }>
  diagnostics: Diagnostic[]
}

export const WIDGETS = WIDGET_TYPES
export const CALLOUTS = ['note', 'tip', 'important', 'warning'] as const
const ALIASES: Record<string, string> = {
  mcq: 'quiz', choice: 'quiz', question: 'quiz', multiplechoice: 'quiz',
  blank: 'cloze', blanks: 'cloze', fill: 'cloze', fillin: 'cloze',
  sequence: 'order', sort: 'order', parsons: 'order',
  recall: 'explain', reflect: 'explain', feynman: 'explain', 'self-explain': 'explain',
  worked: 'steps', example: 'steps', 'worked-example': 'steps',
  sandbox: 'code', exercise: 'code',
  info: 'note', abstract: 'note', summary: 'note', quote: 'note',
  hint: 'tip', intuition: 'tip', success: 'tip',
  key: 'important', takeaway: 'important',
  chart: 'plot', graph: 'plot', equation: 'formula', animation: 'animate', morph: 'animate', simulation: 'sim', applet: 'sim',
  caution: 'warning', danger: 'warning', attention: 'warning', failure: 'warning', bug: 'warning', misconception: 'warning',
}
export const VISUALS = ['plot', 'formula', 'animate', 'sim', 'html'] as const
const CANON = new Set<string>([...WIDGETS, ...CALLOUTS, ...VISUALS])

interface Container {
  name: string; label?: string; attrs: string[]; author: number; line: number
  children: Container[]; innerColonLine: number; colons: number
}
type Out = { text: string; line: number } | { open: Container; indent: string; line: number } | { close: Container; indent: string; line: number }

export interface Stage0Options {
  /**
   * `lesson` (default) repairs LLM drift for `.learn.md` files. `document` is faithful to ordinary Markdown:
   * no unwrapping or preamble removal, `---` kept, `{{…}}` literal outside widgets, a stray `$$` recovered.
   */
  mode?: 'lesson' | 'document'
}

export function stage0(input: string, opts: Stage0Options = {}): Stage0Result {
  const doc = opts.mode === 'document'
  const diagnostics: Diagnostic[] = []
  const diag = (code: Code, line: number, message?: string) => diagnostics.push({ code, line, message })
  let lines = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')
  let map = lines.map((_, i) => i + 1)
  if (doc) {
    // a `$$` that never closes would swallow the rest of the document: treat it as literal text
    for (let k = unclosedMath(lines); k >= 0; k = unclosedMath(lines)) {
      diag('I820', map[k])
      const trailing = /^\s*(\$\$|\\\[)\s*$/.test(lines[k]) && lines.slice(k + 1).every((l) => !l.trim())
      if (trailing) { lines = lines.slice(0, k); map = map.slice(0, k) } // a lone fence at the very end is debris
      else lines = lines.map((l, i) => (i === k ? l.replace('$$', '\\$\\$').replace(/^(\s*)\\\[/, '$1\\\\[') : l))
    }
  }

  // 1. Unwrap a whole-file ```markdown fence.
  const nb = (arr: string[]) => arr.findIndex((l) => l.trim() !== '')
  const last = doc ? -1 : lines.length - 1 - nb([...lines].reverse())
  // the wrapper may follow a short chat preamble ("Sure! Here is your lesson:")
  const first = lines.findIndex((l, i) => i < 8 && /^(`{3,}|~{3,})\s*(markdown|md)?\s*$/i.test(l) && (/(markdown|md)\s*$/i.test(l) || lines[i + 1]?.trim() === '---'))
  const open = first >= 0 ? /^(`{3,}|~{3,})/.exec(lines[first]) : null
  if (open && last > first) {
    const close = new RegExp(`^\\${open[1][0]}{${open[1].length},}\\s*$`)
    if (close.test(lines[last])) {
      diag('I801', map[first]); if (lines.slice(0, first).some((l) => l.trim())) diag('I802', map[0])
      lines = lines.slice(first + 1, last); map = map.slice(first + 1, last)
    }
  }
  // 2. Chat preamble before frontmatter.
  const f2 = doc ? -1 : nb(lines)
  if (f2 >= 0 && lines[f2].trim() !== '---') {
    const k = lines.findIndex((l, i) => i <= 12 && l.trim() === '---' && /^[A-Za-z_][\w-]*\s*:/.test(lines[i + 1] ?? ''))
    if (k > 0 && lines.slice(k + 1, k + 40).some((l) => l.trim() === '---')) {
      diag('I802', map[0]); lines = lines.slice(k); map = map.slice(k)
    }
  }
  // 3. Frontmatter (kept verbatim; parsed in stage 3).
  let frontmatter: Stage0Result['frontmatter']
  let start = 0
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && (l.trim() === '---' || l.trim() === '...'))
    if (end > 0) { frontmatter = { raw: lines.slice(1, end).join('\n'), line: map[0] + 1 }; start = end + 1 }
  }

  const blanks = new Map<string, SideBlank>()
  const hints = new Map<string, { raw: string; line: number }>()
  const out: Out[] = []
  const stack: Container[] = []
  const roots: Container[] = []
  let code: { ch: string; len: number } | null = null
  let math: { latex: boolean; indent: string } | null = null
  let comment = false, obsComment = false
  let optionCol = -1 // content column of the last quiz option while its feedback may follow
  let inlineOpen = false // an inline `$…$` opened on an earlier line of the same paragraph

  const innermostWidget = () => [...stack].reverse().find((c) => (WIDGETS as readonly string[]).includes(c.name))
  const blankMode = () => { const w = innermostWidget(); return w && (w.name === 'cloze' || w.name === 'steps') ? 'extract' : doc ? 'literal' : 'stray' }
  const colonLine = (l: string) => { const m = /^\s*(:{3,})\s*$/.exec(l); if (m) for (const c of stack) c.innerColonLine = Math.max(c.innerColonLine, m[1].length) }
  const emit = (text: string, line: number) => out.push({ text, line })
  const closeTop = (line: number, indent = '') => { const c = stack.pop()!; out.push({ close: c, indent, line }) }

  for (let i = start; i < lines.length; i++) {
    let l = lines[i]
    const ln = map[i]
    if (inlineOpen && !l.trim()) inlineOpen = false
    // --- inside fenced code
    if (code) {
      const m = /^\s*(`{3,}|~{3,})\s*$/.exec(l)
      if (m && m[1][0] === code.ch && m[1].length >= code.len) code = null
      else colonLine(l)
      emit(l, ln); continue
    }
    // --- inside display math
    if (math) {
      colonLine(l)
      const t = l.trim(), ind = l.match(/^\s*/)![0]
      const closer = math.latex ? '\\]' : '$$'
      // the closing fence goes at the opener's indentation (an over-indented `$$` would not close the block)
      const fenceInd = math.indent
      if (t === closer || t === '$$') { math = null; emit(fenceInd + '$$', ln); if (t !== '$$') diag('I807', ln); continue }
      if (t.endsWith(closer) && !t.endsWith('\\' + closer)) {
        diag('I806', ln); math = null
        emit(ind + mathLine(t.slice(0, -closer.length), ln), ln); emit(fenceInd + '$$', ln); continue
      }
      emit(ind + mathLine(t, ln), ln); continue
    }
    // --- HTML comments (annotations) and Obsidian %% blocks
    if (comment) { if (l.includes('-->')) comment = false; emit(l, ln); continue }
    if (obsComment) { if (l.includes('%%')) obsComment = false; continue }
    if (/<!--/.test(l) && !/<!--[\s\S]*?-->/.test(l.slice(l.lastIndexOf('<!--')))) {
      if (lines.slice(i + 1).some((x) => x.includes('-->'))) comment = true
      else { diag('E108', ln); l = l + ' -->' }
      emit(l, ln); continue
    }
    if (/^\s*%%/.test(l) && !/%%.*%%/.test(l)) { obsComment = true; diag('I810', ln); continue }

    // --- fenced code opens
    const fence = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(l)
    if (fence && !(fence[2][0] === '`' && fence[3].includes('`'))) { code = { ch: fence[2][0], len: fence[2].length }; emit(l, ln); continue }

    const indent = l.match(/^\s*/)![0]
    const t = l.trim()
    // --- display math opens / one-liners
    const one = /^(?:\$\$(.+)\$\$|\\\[(.+)\\\])$/.exec(t)
    if (one) {
      if (one[2] !== undefined) diag('I807', ln) // a one-line `$$…$$` on its own line is canonical (cheapest form)
      emit(indent + '$$', ln); emit(indent + mathLine(one[1] ?? one[2], ln), ln); emit(indent + '$$', ln); continue
    }
    if (t === '$$' || t === '\\[') { math = { latex: t === '\\[', indent }; if (math.latex) diag('I807', ln); emit(indent + '$$', ln); continue }
    if (t.startsWith('$$') && !t.slice(2).includes('$$')) {
      diag('I806', ln); math = { latex: false, indent }; emit(indent + '$$', ln); emit(indent + mathLine(t.slice(2), ln), ln); continue
    }

    // --- container closers / openers (Pandoc semantics: named opener opens, bare fence closes innermost)
    if (/^\s{0,3}:{3,}\s*$/.test(l)) {
      if (stack.length) closeTop(ln, indent); else diag('I814', ln)
      optionCol = -1; continue
    }
    const op = /^\s*(:{3,})(.+)$/.exec(l)
    if (op) {
      const c = parseOpener(op[1].length, op[2].trim(), ln, diag)
      if (c) {
        const parentWidget = innermostWidget()
        if (parentWidget && (WIDGETS as readonly string[]).includes(c.name)) diag('E106', ln, `"${c.name}" inside "${parentWidget.name}"`)
        ;(stack.length ? stack[stack.length - 1].children : roots).push(c)
        stack.push(c); out.push({ open: c, indent, line: ln }); optionCol = -1; continue
      }
    }
    // --- leaf hint
    const hint = /^(\s*)::hint(?:\[(.*)\]|[:\s]\s*(.+))\s*$/.exec(l)
    if (hint) {
      const id = `h${hints.size}`
      hints.set(id, { raw: (hint[2] ?? hint[3]).trim(), line: ln })
      emit(`${hint[1]}::hint[${PH_OPEN}${id}${PH_CLOSE}]`, ln); continue
    }
    // --- card heading closes everything that is still open
    if (/^\s{0,3}##(?!#)\s/.test(l) && stack.length) {
      while (stack.length) { diag('E105', stack[stack.length - 1].line, `"${stack[stack.length - 1].name}" auto-closed at line ${ln}`); closeTop(ln) }
    }
    // --- separators (setext-heading trap)
    if (!doc && /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(l)) { diag('I805', ln); continue }
    // --- GFM / Obsidian alerts -> callout containers (re-scanned by the loop)
    const alert = /^(\s*)>\s*\[!(\w+)\]([+-]?)\s*(.*)$/.exec(l)
    if (alert) {
      let j = i + 1
      const body: string[] = []
      while (j < lines.length && /^\s*>/.test(lines[j])) { body.push(lines[j].replace(/^(\s*)>\s?/, '$1')); j++ }
      const name = alert[2].toLowerCase()
      const attrs = alert[3] === '-' ? '{fold}' : ''
      const label = alert[4] ? `[${alert[4]}]` : ''
      const repl = [`${alert[1]}:::${name}${label}${attrs}`, ...body, `${alert[1]}:::`]
      lines.splice(i, j - i, ...repl); map.splice(i, j - i, ...repl.map(() => ln))
      diag('I811', ln); i--; continue
    }
    // --- quiz option feedback re-indentation
    const inQuiz = stack.length && ['quiz', 'speed'].includes(stack[stack.length - 1].name)
    if (inQuiz) {
      const opt = /^(\s*(?:[-*+]|\d+[.)])\s+)\[[ xX]\]/.exec(l)
      if (opt) optionCol = opt[1].length
      else if (t === '') optionCol = -1
      else if (t.startsWith('>') && optionCol > 0 && indent.length < optionCol) {
        diag('I812', ln); l = ' '.repeat(optionCol) + t
      }
    }
    emit(inlineLine(l, ln, i), ln)
  }
  if (code || math) diag('E109', map[lines.length - 1] ?? 1, code ? 'inside a code fence' : 'inside display math')
  while (stack.length) { diag('E105', stack[stack.length - 1].line, `"${stack[stack.length - 1].name}" never closed`); closeTop(map[lines.length - 1] ?? 1) }

  // Pass 2: colon counts so micromark sees the same tree (outer fence strictly longer than anything inside).
  const size = (c: Container): number => {
    const inner = Math.max(c.innerColonLine, ...c.children.map(size))
    c.colons = Math.max(3, inner ? inner + 1 : 3)
    if (c.colons > 3) diagnostics.push({ code: 'I813', line: c.line })
    return c.colons
  }
  roots.forEach(size)
  const text: string[] = [], lineMap: number[] = []
  for (const o of out) {
    if ('text' in o) { text.push(o.text); lineMap.push(o.line) }
    else if ('open' in o) {
      const c = o.open
      text.push(`${o.indent}${':'.repeat(c.colons)}${c.name}${c.label !== undefined ? `[${c.label}]` : ''}${c.attrs.length ? `{${c.attrs.join(' ')}}` : ''}`)
      lineMap.push(o.line)
    } else { text.push(`${o.indent}${':'.repeat(o.close.colons)}`); lineMap.push(o.line) }
  }
  return { text: text.join('\n'), lineMap, frontmatter, blanks, hints, diagnostics }

  // ---- helpers bound to this run -------------------------------------------------------
  function mathLine(tex: string, ln: number) {
    return blankMode() === 'extract' ? extractBlanks(tex, true, ln) : tex
  }
  function inlineLine(l: string, ln: number, idx: number): string {
    const table = /^\s*\|/.test(l)
    let res = '', i = 0
    let text = ''
    if (inlineOpen) { // continuation of a `$…$` span from the previous line
      // "- 2x$" would start a list and break the formula; 4 spaces make it paragraph continuation text
      if (/^\s{0,3}([-*+]|\d+[.)])\s/.test(l)) l = '    ' + l.trimStart()
      const k = closerAt(l, 0)
      if (k < 0) return mathSeg(l, table, ln)
      res = mathSeg(l.slice(0, k), table, ln) + '$'; i = k + 1; inlineOpen = false
    }
    const flushText = () => {
      let s = text
      s = s.replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (_, p) => (diag('I810', ln), `![](${p.trim()})`))
      s = s.replace(/(?<!!)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => (diag('I810', ln), (b ?? a).trim()))
      s = s.replace(/%%.*?%%/g, () => (diag('I810', ln), ''))
      const mode = blankMode()
      s = mode === 'extract' ? extractBlanks(s, false, ln) : mode === 'literal' ? s : s.replace(/\{\{([^{}]+)\}\}/g, () => (diag('W305', ln), PH_STRAY))
      res += s; text = ''
    }
    while (i < l.length) {
      const ch = l[i]
      if (ch === '\\' && (l[i + 1] === '(' || l[i + 1] === '[')) {
        const closeSeq = l[i + 1] === '(' ? '\\)' : '\\]'
        const j = l.indexOf(closeSeq, i + 2)
        const inner = j > 0 ? l.slice(i + 2, j) : ''
        if (j > 0 && (l[i + 1] === '(' || /[\\^_]/.test(inner))) {
          flushText(); diag('I807', ln); res += '$' + mathSeg(inner, table, ln) + '$'; i = j + 2; continue
        }
      }
      if (ch === '\\') { text += ch + (l[i + 1] ?? ''); i += 2; continue }
      if (ch === '`') {
        const run = /^`+/.exec(l.slice(i))![0]
        const j = l.indexOf(run, i + run.length)
        if (j > 0 && l[j + run.length] !== '`') { flushText(); res += l.slice(i, j + run.length); i = j + run.length; continue }
        text += run; i += run.length; continue
      }
      if (ch === '$') {
        if (l[i + 1] === '$') { // inline $$…$$
          const j = l.indexOf('$$', i + 2)
          if (j > 0) { flushText(); res += '$$' + mathSeg(l.slice(i + 2, j), table, ln) + '$$'; i = j + 2; continue }
          text += '\\$\\$'; diag('I808', ln); i += 2; continue
        }
        // Pandoc rule: opener followed by non-space; closer preceded by non-space, not followed by a digit.
        let j = -1
        if (l[i + 1] && !/\s/.test(l[i + 1])) {
          for (let k = i + 1; k < l.length; k++) {
            if (l[k] === '\\') { k++; continue }
            if (l[k] === '$') { // the first unescaped $ must be a valid closer, otherwise the opener fails
              if (l[k + 1] !== '$' && !/\s/.test(l[k - 1]) && !/\d/.test(l[k + 1] ?? '')) j = k
              break
            }
          }
        }
        if (j > 0) { flushText(); res += '$' + mathSeg(l.slice(i + 1, j), table, ln) + '$'; i = j + 1; continue }
        if (j < 0 && doc) { // documents: "$[R T] = $" — a span whose content is clearly TeX counts despite the spaces
          const k = nextDollar(l, i + 1)
          const inner = k > 0 ? l.slice(i + 1, k) : ''
          if (k > 0 && inner.trim() && /[\\^_={}]/.test(inner) && !/\d/.test(l[k + 1] ?? '')) {
            flushText(); res += '$' + mathSeg(inner.trim(), table, ln) + '$'; i = k + 1; continue
          }
        }
        if (j < 0 && l[i + 1] && !/\s/.test(l[i + 1]) && !hasDollar(l, i + 1) && closesLater(idx)) {
          flushText(); res += '$' + mathSeg(l.slice(i + 1), table, ln); inlineOpen = true; return res
        }
        diag('I808', ln); text += '\\$'; i++; continue
      }
      text += ch; i++
    }
    flushText()
    return res
  }
  /** Does a later line of this paragraph close the `$` opened at the end of line `idx`? */
  function closesLater(idx: number): boolean {
    for (let k = idx + 1; k < lines.length; k++) {
      const x = lines[k]
      if (!x.trim() || /^\s*(`{3,}|~{3,}|\$\$|\\\[|:{3,}|#{1,6}\s|>|\|)/.test(x)) return false
      const c = closerAt(x, 0)
      if (c >= 0) return true
      if (hasDollar(x, 0)) return false // the first `$` after the opener must be a valid closer
    }
    return false
  }
  function mathSeg(tex: string, table: boolean, ln: number) {
    let s = mathLine(tex, ln)
    if (table && s.includes('|')) { diag('I809', ln); s = s.replace(/(?<!\\)\|/g, '\\vert ') }
    return s
  }
  function extractBlanks(s: string, inMath: boolean, ln: number): string {
    let res = '', i = 0
    while (i < s.length) {
      if (s[i] === '\\' && !inMath) { res += s.slice(i, i + 2); i += 2; continue }
      if (s.startsWith('{{{', i)) { res += s[i]; i++; continue } // `\sqrt{{{x}}}`: the outer brace is TeX, the blank is the last `{{`
      if (s.startsWith('{{', i)) {
        let d = 0, j = i + 2, end = -1
        for (; j < s.length; j++) {
          if (s[j] === '\\') { j++; continue }
          if (s[j] === '{') d++
          else if (s[j] === '}') { if (d === 0 && s[j + 1] === '}') { end = j; break } d-- }
        }
        const raw = end > 0 ? s.slice(i + 2, end).trim() : ''
        if (end < 0 || raw === '') { diag('E302', ln); res += s.slice(i, i + 2); i += 2; continue }
        const id = `b${blanks.size}`
        blanks.set(id, { id, line: ln, inMath, ...parseAnswer(raw, inMath, ln) })
        res += `${PH_OPEN}${id}${PH_CLOSE}`; i = end + 2; continue
      }
      res += s[i]; i++
    }
    return res
  }
  function parseAnswer(raw: string, inMath: boolean, ln: number): Pick<SideBlank, 'answers' | 'tol' | 'hint'> {
    let body = raw, hint: string | undefined
    const anki = /^c\d+::/.exec(body)
    if (anki) {
      diag('I306', ln); body = body.slice(anki[0].length)
      const parts = splitTop(body, '::'); body = parts[0]; hint = parts[1]
    }
    let tol: SideBlank['tol']
    const pm = /^(.*?)\s*(?:±|\+-|\+\/-)\s*([\d.,]+)\s*(%?)$/.exec(body)
    if (pm) { body = pm[1]; const v = parseFloat(pm[2].replace(',', '.')); tol = pm[3] ? { rel: v / 100 } : { abs: v } }
    const answers = inMath ? [body.trim()] : splitTop(body, '|').map((a) => a.trim()).filter(Boolean)
    return { answers, tol, hint }
  }
}

/** Split on a separator only at bracket depth 0 (so `P(E|H)` stays whole). */
export function splitTop(s: string, sep: string): string[] {
  const parts: string[] = []; let d = 0, cur = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '\\') { cur += ch + (s[i + 1] ?? ''); i++; continue }
    if ('([{'.includes(ch)) d++
    else if (')]}'.includes(ch)) d = Math.max(0, d - 1)
    if (d === 0 && s.startsWith(sep, i)) { parts.push(cur); cur = ''; i += sep.length - 1; continue }
    cur += ch
  }
  parts.push(cur)
  return parts
}

function parseOpener(colons: number, rest: string, line: number, diag: (c: Code, l: number, m?: string) => void): Container | null {
  let name = '', label: string | undefined, attrs: string[] = []
  let canonical = true
  let m: RegExpExecArray | null
  if ((m = /^\{([A-Za-z][\w-]*)\}\s*(.*)$/.exec(rest))) { name = m[1]; label = m[2] || undefined; canonical = false } // MyST
  else if ((m = /^\{\.?([\w-]+)([^}]*)\}\s*(.*)$/.exec(rest))) { // Pandoc / Quarto
    name = m[1].replace(/^callout-/, ''); canonical = false
    if (/collapse\s*=\s*"?true/.test(m[2])) attrs.push('fold')
    label = m[3] || /title\s*=\s*"([^"]*)"/.exec(m[2])?.[1]
  } else if ((m = /^([A-Za-z][\w-]*)(.*)$/.exec(rest))) {
    name = m[1]; let tail = m[2]
    if (/^\s/.test(tail)) canonical = false
    tail = tail.trim()
    // any order of [label] and {attrs}; leftover text becomes the label
    for (let guard = 0; guard < 3 && tail; guard++) {
      const lab = /^\[(.*?)\]/.exec(tail)
      const att = /^\{([^}]*)\}/.exec(tail)
      if (lab) { label = lab[1]; tail = tail.slice(lab[0].length).trim(); if (attrs.length) canonical = false; continue }
      if (att) { attrs = parseAttrs(att[1]); tail = tail.slice(att[0].length).trim(); continue }
      break
    }
    if (tail) { label = (label ? label + ' ' : '') + tail; canonical = false }
  } else return null
  const lower = name.toLowerCase()
  if (!CANON.has(lower) && ALIASES[lower]) { diag('I804', line, `${name} → ${ALIASES[lower]}`); name = ALIASES[lower] } else name = lower
  if (!canonical || colons !== 3) diag('I803', line)
  return { name, label, attrs, author: colons, line, children: [], innerColonLine: 0, colons: 3 }
}

function parseAttrs(s: string): string[] {
  const out: string[] = []
  for (const tok of s.match(/#[\w-]+|[\w-]+(?:\s*=\s*(?:"[^"]*"|[^\s}]+))?/g) ?? []) {
    if (tok.startsWith('#')) out.push(tok)
    else if (/^(fold|collapsed?|exact|auto|memory|replace)$/.test(tok)) out.push(tok.startsWith('collapse') ? 'fold' : tok)
    else if (/^time\s*=\s*"?\d{1,4}"?$/.test(tok)) out.push(tok.replace(/\s|"/g, ''))
    else if (/^(x|y)\s*=\s*"?(log|lin|linear)"?$/.test(tok)) out.push(tok.replace(/\s|"/g, '').replace('linear', 'lin'))
    else if (/^height\s*=\s*"?\d{2,4}"?$/.test(tok)) out.push(tok.replace(/\s|"/g, ''))
    else if (/^collapse\s*=\s*"?true/.test(tok)) out.push('fold')
  }
  return out
}

/** Index of the first unescaped `$` in `l` from `from` if it is a valid Pandoc closer (non-space before, no digit after, not `$$`), else -1. */
function closerAt(l: string, from: number): number {
  for (let k = from; k < l.length; k++) {
    if (l[k] === '\\') { k++; continue }
    if (l[k] === '$') return k > 0 && !/\s/.test(l[k - 1]) && l[k + 1] !== '$' && !/\d/.test(l[k + 1] ?? '') ? k : -1
  }
  return -1
}
/** Index of the next single unescaped `$` (not part of `$$`), or -1. */
const nextDollar = (l: string, from: number) => { for (let k = from; k < l.length; k++) { if (l[k] === '\\') { k++; continue } if (l[k] === '$') return l[k + 1] === '$' ? -1 : k } return -1 }
const hasDollar = (l: string, from: number) => { for (let k = from; k < l.length; k++) { if (l[k] === '\\') { k++; continue } if (l[k] === '$') return true } return false }

/** Index of the line that opens a display-math block never closed before the end (code fences respected), or -1. */
function unclosedMath(lines: string[]): number {
  let fence: { ch: string; len: number } | null = null
  let open = -1
  let latex = false
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (fence) { const m = /^(`{3,}|~{3,})\s*$/.exec(t); if (m && m[1][0] === fence.ch && m[1].length >= fence.len) fence = null; continue }
    if (open >= 0) {
      if (t === '$$' || (latex && t === '\\]') || (!latex && t.endsWith('$$') && !t.endsWith('\\$$'))) open = -1
      continue
    }
    const f = /^(`{3,}|~{3,})(.*)$/.exec(t)
    if (f && !(f[1][0] === '`' && f[2].includes('`'))) { fence = { ch: f[1][0], len: f[1].length }; continue }
    if (/^(?:\$\$(.+)\$\$|\\\[(.+)\\\])$/.test(t)) continue
    if (t === '$$' || t === '\\[') { open = i; latex = t === '\\['; continue }
    if (t.startsWith('$$') && !t.slice(2).includes('$$')) { open = i; latex = false }
  }
  return open
}
