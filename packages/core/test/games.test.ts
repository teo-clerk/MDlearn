import { describe, it, expect } from 'vitest'
import { compile, isWidget } from '../src/compile'
import { locate, check, checkStructured, redactWidget, parseWebAnswer, pose, type Located } from '../src/tutor'
import { rightOrder, sortItems, speedItems } from '../src/games'
import type { Block, Lesson } from '../src/ast'

const lesson = (body: string) => compile(`---\ntitle: Games\n---\n## Card\n\n${body}\n`)
const codes = (body: string) => lesson(body).diagnostics.map((d) => d.code)
const located = (body: string): Located => {
  const l = lesson(body).lesson as Lesson
  const w = l.cards[0].blocks.find((b) => isWidget(b))!
  return locate([l], (w as { id: string }).id)!
}
type Of<T extends string> = Extract<Block, { type: T }>

const MATCH = `:::match
Match each symbol with its meaning.
- $\\sigma^0$ :: backscatter coefficient
- $\\lambda$ :: wavelength
- \`PRF\` :: pulse repetition frequency
- $c$ :: speed of light
:::`
const SORT = `:::sort
Sort the sensors.
- Active
  - SAR
  - LiDAR
- Passive
  - Radiometer
  - Optical camera
:::`
const SPEED = `:::speed[Radar basics]{time=45}
- [x] SAR is an active sensor.
- [ ] C-band has a longer wavelength than L-band.
  > L-band is about 24 cm, C-band about 5.6 cm.
- [x] Speckle is multiplicative noise.
- [ ] Clouds block C-band radar.
  > Microwaves pass through clouds.
- [x] Range resolution depends on bandwidth.
:::`

describe('compiling games', () => {
  it('match: pairs split at " :: ", never inside code or math', () => {
    const w = located(MATCH).widget as Of<'match'>
    expect(w.pairs).toHaveLength(4)
    expect(w.pairs[0].left[0]).toMatchObject({ type: 'inlineMath', value: '\\sigma^0' })
    expect(w.pairs[2].left[0]).toMatchObject({ type: 'inlineCode', value: 'PRF' })
    expect(w.pairs[2].right[0]).toMatchObject({ type: 'text', value: 'pulse repetition frequency' })
    expect(w.memory).toBe(false)
    expect(located(MATCH.replace(':::match', ':::match{memory}')).widget).toMatchObject({ memory: true })
  })
  it('match: too few pairs lock it, a malformed item is left out', () => {
    expect(codes(':::match\n- a :: b\n- c :: d\n:::')).toContain('E211')
    expect(codes(MATCH.replace('- $c$ :: speed of light', '- just text\n- $c$ :: speed of light'))).toContain('W212')
  })
  it('sort: groups from a nested list', () => {
    const w = located(SORT).widget as Of<'sort'>
    expect(w.groups.map((g) => g.items.length)).toEqual([2, 2])
    expect(codes(':::sort\n- Active\n  - SAR\n- Passive\n:::')).toContain('E214')
  })
  it('speed: truth from the task list, feedback under the statement, the time limit', () => {
    const w = located(SPEED).widget as Of<'speed'>
    expect(w.items.map((x) => x.truth)).toEqual([true, false, true, false, true])
    expect(w.items[1].feedback).toBeDefined()
    expect(w.time).toBe(45)
    expect(codes(':::speed\n- [x] a\n- [ ] b\n:::')).toContain('E216')
    expect(codes(':::speed\n- [x] a\n- [x] b\n- [x] c\n:::')).toContain('W218')
  })
  it('games count as widgets and close the retrieval gap', () => {
    expect(isWidget({ type: 'match' } as unknown as Block)).toBe(true)
    expect(codes(SORT)).not.toContain('W602')
  })
})

describe('posing games without the key', () => {
  const KEY = /"(truth|group|expected|feedback)"/
  it.each([['match', MATCH], ['memory', MATCH.replace(':::match', ':::match{memory}')], ['sort', SORT], ['speed', SPEED]])('%s', (_, src) => {
    const posed = redactWidget(located(src).widget)
    expect(JSON.stringify(posed)).not.toMatch(KEY)
  })
  it('the right column is shuffled and memory tiles cover both sides', () => {
    const w = located(MATCH.replace(':::match', ':::match{memory}')).widget as Of<'match'>
    const posed = redactWidget(w) as Extract<ReturnType<typeof redactWidget>, { type: 'match' }>
    expect(posed.right).toHaveLength(4)
    expect(posed.tiles).toHaveLength(8)
    expect(new Set(posed.tiles!.map((t) => `${t.side}${t.i}`)).size).toBe(8)
  })
  it('terminal question lists numbers and letters', () => {
    const q = pose(located(MATCH), { surface: 'terminal' })
    expect(q.question).toMatch(/1 {2}σ⁰/)
    expect(q.question).toMatch(/A {2}/)
    expect(q.answerFormat).toMatch(/1b 2a/)
  })
})

describe('checking games', () => {
  it('match: right pairs, one swap, and a single move that reveals nothing else', () => {
    const loc = located(MATCH)
    const w = loc.widget as Of<'match'>
    const key = w.pairs.map((_, i) => rightOrder(w).indexOf(i))
    expect(checkStructured(loc, { type: 'match', pairs: key })).toMatchObject({ correct: true, partial: false })
    const swapped = [key[1], key[0], key[2], key[3]]
    expect(checkStructured(loc, { type: 'match', pairs: swapped })).toMatchObject({ correct: true, partial: true })
    const move = checkStructured(loc, { type: 'match', pairs: [key[0], null, null, null] })
    expect(move.correct).toBe(false)
    expect(move.parts?.pairs?.[0].ok).toBe(true)
    expect(move.parts?.pairs?.every((p) => p.expected === undefined)).toBe(true)
    expect(move.answer).toBe('')
  })
  it('memory: misses are counted from the flips', () => {
    const loc = located(MATCH.replace(':::match', ':::match{memory}'))
    const w = loc.widget as Of<'match'>
    const key = w.pairs.map((_, i) => rightOrder(w).indexOf(i))
    const wrong = (key[0] + 1) % 4
    const clean = checkStructured(loc, { type: 'match', pairs: key, log: key.map((r, l) => [l, r]) })
    expect(clean).toMatchObject({ correct: true, partial: false, parts: { misses: 0 } })
    const log = [...Array(5)].map(() => [0, wrong] as [number, number]).concat(key.map((r, l) => [l, r] as [number, number]))
    expect(checkStructured(loc, { type: 'match', pairs: key, log })).toMatchObject({ correct: true, partial: true, parts: { misses: 5 } })
  })
  it('sort: one item in the wrong group is nearly right', () => {
    const loc = located(SORT)
    const shown = sortItems(loc.widget as Of<'sort'>)
    const key = shown.map((x) => x.group)
    expect(checkStructured(loc, { type: 'sort', groups: key })).toMatchObject({ correct: true, partial: false })
    expect(checkStructured(loc, { type: 'sort', groups: key.map((g, i) => (i === 0 ? 1 - g : g)) })).toMatchObject({ correct: true, partial: true })
    expect(checkStructured(loc, { type: 'sort', groups: key.map((g, i) => (i < 2 ? 1 - g : g)) })).toMatchObject({ correct: false })
  })
  it('speed: an answered statement shows its truth, unanswered ones stay hidden; 80% passes', () => {
    const loc = located(SPEED)
    const truth = speedItems(loc.widget as Of<'speed'>).map((x) => x.truth)
    const first = checkStructured(loc, { type: 'speed', answers: [truth[0], null, null, null, null] })
    expect(first.parts?.statements?.[0]).toMatchObject({ ok: true, truth: truth[0] })
    expect(first.parts?.statements?.[1]).toEqual({ ok: null })
    expect(checkStructured(loc, { type: 'speed', answers: truth.map((t, i) => (i === 0 ? !t : t)) })).toMatchObject({ correct: true, partial: true })
    const timedOut = checkStructured(loc, { type: 'speed', answers: [truth[0], null, null, null, null], done: true })
    expect(timedOut).toMatchObject({ correct: false, parts: { score: { right: 1, total: 5 } } })
  })
  it('text answers from the terminal and chat', () => {
    const loc = located(MATCH)
    const w = loc.widget as Of<'match'>
    const letters = w.pairs.map((_, i) => 'abcd'[rightOrder(w).indexOf(i)])
    expect(check(loc, letters.map((l, i) => `${i + 1}${l}`).join(' ')).correct).toBe(true)
    const sp = located(SPEED)
    const tf = speedItems(sp.widget as Of<'speed'>).map((x) => (x.truth ? 'T' : 'F')).join(' ')
    expect(check(sp, tf).correct).toBe(true)
  })
  it('answers that do not fit are rejected', () => {
    const w = located(MATCH).widget
    expect(parseWebAnswer(w, { type: 'match', pairs: [0, 0, 1, 2] })).toBeNull()
    expect(parseWebAnswer(w, { type: 'match', pairs: [0, 1] })).toBeNull()
    expect(parseWebAnswer(w, { type: 'match', pairs: [0, null, 1, 2] })).not.toBeNull()
    expect(parseWebAnswer(located(SORT).widget, { type: 'sort', groups: [0, 5, 1, 0] })).toBeNull()
  })
})
