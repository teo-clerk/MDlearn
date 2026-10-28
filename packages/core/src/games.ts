// Games (DSL v1.3, §8.12): `:::match` (pairs, or a memory game with `{memory}`), `:::sort` (items into groups)
// and `:::speed` (a true/false round). Written in plain Markdown, graded on the server like every widget:
// the browser gets them without answer keys and checks each move with a partial answer (`null` = not yet),
// so feedback is instant and the key never leaves the server.
import { toString } from 'mdast-util-to-string'
import type { List, ListItem, Nodes, PhrasingContent, RootContent, Text } from 'mdast'
import type { ContainerDirective } from 'mdast-util-directive'
import type { MdNode, Widget } from './ast.js'
import type { Code } from './registry.js'
import { inlineText, toMarkdown, type MdOptions } from './md.js'
import { seededOrder } from './seed.js'

type Flow = MdNode[]
export type GameWidget = Extract<Widget, { type: 'match' | 'sort' | 'speed' }>
export const GAME_TYPES = ['match', 'sort', 'speed'] as const
const LETTERS = 'ABCDEFGHIJKL'

// ---------------------------------------------------------------- building (compile time)
export interface GameBuild {
  kind: (typeof GAME_TYPES)[number]
  directive: ContainerDirective
  /** Blocks of the widget body (hints and the trailing reveal already taken out). */
  main: RootContent[]
  cleanAll: (ns: Nodes[]) => MdNode[]
  diag: (code: Code, node: Nodes, message?: string) => void
  id: (key: string) => string
  fail: (code: Code, node: Nodes, message?: string) => Widget[]
  hints: MdNode[][]
  reveal?: Flow
}
const listIn = (main: RootContent[]) => main.findIndex((b) => b.type === 'list')
const itemText = (li: ListItem) => toString(li.children[0] ?? { type: 'text', value: '' }).trim()

export function buildGame(g: GameBuild): Widget[] {
  const { kind, directive: n, main, cleanAll, diag, fail } = g
  const attrs = (n.attributes ?? {}) as Record<string, string>
  const at = listIn(main)
  const prompt = cleanAll(main.slice(0, Math.max(0, at)) as Nodes[])
  const tail = { hints: g.hints, ...(g.reveal ? { reveal: g.reveal } : {}) }
  const list = at >= 0 ? (main[at] as List) : null

  if (kind === 'match') {
    const pairs: { left: Flow; right: Flow }[] = []
    for (const li of list?.children ?? []) {
      const para = li.children[0]
      const split = para?.type === 'paragraph' ? splitPair(para.children) : null
      if (!split) { diag('W212', li, itemText(li).slice(0, 40)); continue }
      pairs.push({ left: cleanAll(split[0] as Nodes[]), right: cleanAll(split[1] as Nodes[]) })
    }
    if (pairs.length < 3) return fail('E211', n)
    if (pairs.length > 8) diag('W213', n, `${pairs.length} pairs`)
    const key = toString({ type: 'root', children: main.slice(0, Math.max(0, at)) }) + (list ? toString(list) : '')
    return [{ type: 'match', id: g.id(key), prompt, pairs, memory: 'memory' in attrs, ...tail }]
  }
  if (kind === 'sort') {
    const groups = (list?.children ?? []).map((li) => {
      const para = li.children[0]
      const sub = li.children.find((c): c is List => c.type === 'list')
      return { label: para?.type === 'paragraph' ? cleanAll(para.children) : [], items: (sub?.children ?? []).map((it) => cleanAll(flatItem(it))) }
    })
    const total = groups.reduce((s, x) => s + x.items.length, 0)
    if (groups.length < 2 || total < 4 || groups.some((x) => !x.items.length || !x.label.length)) return fail('E214', n)
    if (groups.length > 4 || total > 12) diag('W215', n, `${groups.length} groups, ${total} items`)
    return [{ type: 'sort', id: g.id(list ? toString(list) : ''), prompt, groups, ...tail }]
  }
  // speed
  const items = (list?.children ?? []).filter((li) => li.checked === true || li.checked === false).map((li) => {
    const [first, ...rest] = li.children
    const fb = cleanAll(rest.filter((x) => x.type === 'blockquote').flatMap((x) => ('children' in x ? (x.children as Nodes[]) : [])))
    return { content: first?.type === 'paragraph' ? cleanAll(first.children) : [], truth: li.checked === true, ...(fb.length ? { feedback: fb } : {}) }
  })
  if (items.length < 3) return fail('E216', n)
  if (items.length > 20) diag('W217', n, `${items.length} statements`)
  if (items.every((x) => x.truth) || items.every((x) => !x.truth)) diag('W218', n)
  const seconds = Number(attrs.time)
  return [{ type: 'speed', id: g.id(list ? toString(list) + items.map((x) => +x.truth).join('') : ''), prompt, items,
    ...(seconds >= 5 && seconds <= 3600 ? { time: Math.round(seconds) } : {}), ...tail }]
}
/** `left :: right` at the first ` :: ` in plain text (never inside code or math, which are separate nodes). */
function splitPair(kids: PhrasingContent[]): [PhrasingContent[], PhrasingContent[]] | null {
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i]
    if (k.type !== 'text') continue
    const m = /\s+::\s+/.exec(k.value) ?? (/\s*::\s*/.exec(k.value))
    if (!m) continue
    const before = k.value.slice(0, m.index), after = k.value.slice(m.index + m[0].length)
    const left = [...kids.slice(0, i), ...(before.trim() ? [{ ...k, value: before.trimEnd() } as Text] : [])]
    const right = [...(after.trim() ? [{ ...k, value: after.trimStart() } as Text] : []), ...kids.slice(i + 1)]
    return left.length && right.length ? [left, right] : null
  }
  return null
}
/** A list item's content as one run (a tight item is one paragraph). */
const flatItem = (li: ListItem): Nodes[] => li.children.flatMap((c): Nodes[] => (c.type === 'paragraph' ? c.children : [c]))

// ---------------------------------------------------------------- display orders (the same on every surface)
/** Display position j of the right column shows pair `rightOrder[j]`. */
export const rightOrder = (w: Extract<GameWidget, { type: 'match' }>) => seededOrder(w.pairs.map((_, i) => i), `${w.id}/r`)
/** Memory tiles: side and index into the shown columns (left by pair, right by display position). */
export const memoryTiles = (w: Extract<GameWidget, { type: 'match' }>) =>
  seededOrder([...w.pairs.map((_, i) => ({ side: 'l' as const, i })), ...w.pairs.map((_, j) => ({ side: 'r' as const, i: j }))], `${w.id}/m`)
/** Items of a sort, flattened and shuffled: `group` is the key and never leaves the server. */
export const sortItems = (w: Extract<GameWidget, { type: 'sort' }>) => seededOrder(w.groups.flatMap((g, gi) => g.items.map((content) => ({ content, group: gi }))), w.id)
export const speedItems = (w: Extract<GameWidget, { type: 'speed' }>) => seededOrder(w.items, w.id)

// ---------------------------------------------------------------- posing
export type PosedGame =
  | { type: 'match'; prompt: Flow; left: Flow[]; right: Flow[]; memory: boolean; tiles?: { side: 'l' | 'r'; i: number }[] }
  | { type: 'sort'; prompt: Flow; groups: Flow[]; items: Flow[] }
  | { type: 'speed'; prompt: Flow; statements: Flow[]; time?: number }
export function redactGame(w: GameWidget): PosedGame {
  switch (w.type) {
    case 'match': return { type: 'match', prompt: w.prompt, left: w.pairs.map((p) => p.left), right: rightOrder(w).map((i) => w.pairs[i].right), memory: w.memory, ...(w.memory ? { tiles: memoryTiles(w) } : {}) }
    case 'sort': return { type: 'sort', prompt: w.prompt, groups: w.groups.map((g) => g.label), items: sortItems(w).map((x) => x.content) }
    case 'speed': return { type: 'speed', prompt: w.prompt, statements: speedItems(w).map((x) => x.content), ...(w.time ? { time: w.time } : {}) }
  }
}
/** Question text for the terminal and chat (a memory game is asked as a plain match). */
export function poseGame(w: GameWidget, mo: MdOptions): string {
  const head = toMarkdown(w.prompt, mo)
  const pre = head ? `${head}\n\n` : ''
  switch (w.type) {
    case 'match': {
      const right = rightOrder(w)
      return `${pre}${w.pairs.map((p, i) => `  ${i + 1}  ${inlineText(p.left, mo)}`).join('\n')}\n\n${right.map((r, j) => `  ${LETTERS[j]}  ${inlineText(w.pairs[r].right, mo)}`).join('\n')}`
    }
    case 'sort':
      return `${pre}Groups: ${w.groups.map((g, k) => `${LETTERS[k]} = ${inlineText(g.label, mo)}`).join(' · ')}\n\n${sortItems(w).map((x, i) => `  ${i + 1}  ${inlineText(x.content, mo)}`).join('\n')}`
    case 'speed':
      return `${pre}True or false?\n\n${speedItems(w).map((x, i) => `  ${i + 1}  ${inlineText(x.content, mo)}`).join('\n')}`
  }
}
export const GAME_FORMAT: Record<GameWidget['type'], { terminal: string; chat: string }> = {
  match: { terminal: 'Pair each number with a letter, e.g. "1b 2a 3c".', chat: 'Each number with its letter, e.g. "1b 2a 3c".' },
  sort: { terminal: 'One group letter per item, in order, e.g. "a b b a".', chat: 'The group letter of each item in order, e.g. "a b b a".' },
  speed: { terminal: 'T or F for each statement, in order, e.g. "T F T".', chat: 'T or F for each statement in order, e.g. "T F T".' },
}

// ---------------------------------------------------------------- answers
export type GameAnswer =
  /** For each left item, the right display position chosen (null = not yet). Memory games send their flips. */
  | { type: 'match'; pairs: (number | null)[]; log?: [number, number][] }
  /** For each shown item, the group chosen. */
  | { type: 'sort'; groups: (number | null)[] }
  /** For each shown statement, true/false; `done` ends a timed round with statements left unanswered. */
  | { type: 'speed'; answers: (boolean | null)[]; ms?: number; done?: boolean }
const sizeOf = (w: GameWidget) => (w.type === 'match' ? w.pairs.length : w.type === 'sort' ? w.groups.reduce((s, g) => s + g.items.length, 0) : w.items.length)
/** Shape checks beyond the schema: right length, indices in range, no right side chosen twice. */
export function fitsGame(w: GameWidget, a: GameAnswer): boolean {
  const n = sizeOf(w)
  if (a.type === 'match') {
    const chosen = a.pairs.filter((x): x is number => x !== null)
    return a.pairs.length === n && chosen.every((j) => j < n) && new Set(chosen).size === chosen.length && (a.log ?? []).every(([l, r]) => l < n && r < n)
  }
  if (a.type === 'sort') return a.groups.length === n && a.groups.every((x) => x === null || x < (w as Extract<GameWidget, { type: 'sort' }>).groups.length)
  return a.answers.length === n
}
/** Free text (terminal, chat) → a structured answer. */
export function parseGameText(w: GameWidget, text: string): GameAnswer {
  const n = sizeOf(w)
  if (w.type === 'match') {
    const pairs = Array<number | null>(n).fill(null)
    const labelled = [...text.matchAll(/(\d+)\s*[-:=.)>]*\s*([a-l])\b/gi)]
    if (labelled.length) for (const m of labelled) { const i = Number(m[1]) - 1; if (i >= 0 && i < n) pairs[i] = LETTERS.indexOf(m[2].toUpperCase()) }
    else (text.match(/\b[a-l]\b/gi) ?? []).slice(0, n).forEach((l, i) => { pairs[i] = LETTERS.indexOf(l.toUpperCase()) })
    // a letter used twice: keep the first use
    const seen = new Set<number>()
    return { type: 'match', pairs: pairs.map((j) => (j === null || j < 0 || j >= n || seen.has(j) ? null : (seen.add(j), j))) }
  }
  if (w.type === 'sort') {
    const groups = Array<number | null>(n).fill(null)
    const labelled = [...text.matchAll(/(\d+)\s*[-:=.)>]*\s*([a-l])\b/gi)]
    const k = w.groups.length
    if (labelled.length) for (const m of labelled) { const i = Number(m[1]) - 1; const gi = LETTERS.indexOf(m[2].toUpperCase()); if (i >= 0 && i < n && gi < k) groups[i] = gi }
    else (text.match(/\b[a-l]\b/gi) ?? []).slice(0, n).forEach((l, i) => { const gi = LETTERS.indexOf(l.toUpperCase()); groups[i] = gi < k ? gi : null })
    return { type: 'sort', groups }
  }
  const words = text.match(/\b(true|false|vero|falso|verdadero|t|f|v)\b/gi) ?? (/^[tfTF]+$/.test(text.replace(/\s/g, '')) ? text.replace(/\s/g, '').split('') : [])
  const answers = Array<boolean | null>(n).fill(null)
  words.slice(0, n).forEach((x, i) => { answers[i] = /^(t|true|v|vero|verdadero)$/i.test(x) })
  return { type: 'speed', answers, done: true }
}

// ---------------------------------------------------------------- checking
export interface GameParts {
  /** match: per left item. `expected` (right display position) only once the answer is complete or skipped. */
  pairs?: { ok: boolean | null; expected?: number }[]
  /** Memory: wrong flips, counted from the log. */
  misses?: number
  /** sort: per shown item; `expected` (group) only once complete or skipped. */
  items?: { ok: boolean | null; expected?: number }[]
  /** speed: per shown statement; truth and feedback only for answered statements (all, once done). */
  statements?: { ok: boolean | null; truth?: boolean; feedback?: Flow }[]
  score?: { right: number; total: number }
}
export interface GameChecked { correct: boolean; partial: boolean; complete: boolean; feedback: string; answer: string; parts: GameParts }
export function checkGame(w: GameWidget, given: GameAnswer | { type: 'skip' }, mo: MdOptions): GameChecked {
  const skip = given.type === 'skip'
  switch (w.type) {
    case 'match': {
      const order = rightOrder(w)
      const expected = w.pairs.map((_, i) => order.indexOf(i))
      const pairs = given.type === 'match' ? given.pairs : w.pairs.map(() => null)
      const complete = skip || pairs.every((x) => x !== null)
      const ok = pairs.map((j, i) => (j === null ? null : j === expected[i]))
      const wrong = ok.filter((x) => x === false).length
      const misses = given.type === 'match' && given.log ? given.log.filter(([l, r]) => expected[l] !== r).length : undefined
      const all = !skip && complete && wrong === 0
      const swap = !skip && complete && wrong === 2 && !w.memory
      const answer = `Answer: ${w.pairs.map((p, i) => `${i + 1}${LETTERS[expected[i]].toLowerCase()} (${inlineText(p.left, mo)} — ${inlineText(p.right, mo)})`).join('; ')}`
      const feedback = skip ? 'Skipped.' : !complete ? `${ok.filter(Boolean).length} of ${w.pairs.length} pairs found.`
        : all ? (misses ? `All pairs found, with ${misses} wrong ${misses === 1 ? 'flip' : 'flips'}.` : 'All pairs right.') : swap ? 'Nearly — two items are swapped.' : `${w.pairs.length - wrong} of ${w.pairs.length} pairs right.`
      return { correct: all || swap, partial: swap || (all && misses !== undefined && misses > w.pairs.length), complete, feedback, answer,
        parts: { pairs: ok.map((x, i) => ({ ok: skip ? false : x, ...(complete ? { expected: expected[i] } : {}) })), ...(misses !== undefined ? { misses } : {}), score: { right: ok.filter(Boolean).length, total: w.pairs.length } } }
    }
    case 'sort': {
      const shown = sortItems(w)
      const chosen = given.type === 'sort' ? given.groups : shown.map(() => null)
      const complete = skip || chosen.every((x) => x !== null)
      const ok = chosen.map((g, i) => (g === null ? null : g === shown[i].group))
      const wrong = ok.filter((x) => x === false).length
      const all = !skip && complete && wrong === 0
      const one = !skip && complete && wrong === 1
      const answer = `Answer: ${w.groups.map((g) => `${inlineText(g.label, mo)}: ${g.items.map((x) => inlineText(x, mo)).join(', ')}`).join(' · ')}`
      const feedback = skip ? 'Skipped.' : !complete ? `${ok.filter(Boolean).length} placed so far.` : all ? 'Everything in the right group.' : one ? 'Nearly — one item is in the wrong group.' : `${shown.length - wrong} of ${shown.length} in the right group.`
      return { correct: all || one, partial: one, complete, feedback, answer,
        parts: { items: ok.map((x, i) => ({ ok: skip ? false : x, ...(complete ? { expected: shown[i].group } : {}) })), score: { right: ok.filter(Boolean).length, total: shown.length } } }
    }
    case 'speed': {
      const shown = speedItems(w)
      const answers = given.type === 'speed' ? given.answers : shown.map(() => null)
      const complete = skip || (given.type === 'speed' && (!!given.done || answers.every((x) => x !== null)))
      const ok = answers.map((a, i) => (a === null ? (complete ? false : null) : a === shown[i].truth))
      const right = ok.filter(Boolean).length
      const ratio = right / shown.length
      const answer = `Answer: ${shown.map((x, i) => `${i + 1} ${x.truth ? 'T' : 'F'}`).join(' · ')}`
      const secs = given.type === 'speed' && given.ms ? ` in ${Math.round(given.ms / 1000)} s` : ''
      const feedback = skip ? 'Skipped.' : !complete ? `${right} right so far.` : `${right} of ${shown.length} right${secs}.`
      return { correct: !skip && complete && ratio >= 0.8, partial: !skip && complete && ratio >= 0.8 && ratio < 1, complete, feedback, answer,
        parts: { statements: shown.map((x, i) => (answers[i] !== null || complete ? { ok: skip ? false : ok[i], truth: x.truth, ...(x.feedback ? { feedback: x.feedback } : {}) } : { ok: null })),
          score: { right, total: shown.length } } }
    }
  }
}
