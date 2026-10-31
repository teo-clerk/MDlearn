import { describe, it, expect } from 'vitest'
import { compile } from '../src/compile'
import { carriedOver, deriveCards } from '../src/learn/srs'
import { courseChanges, lostCards, pinIds } from '../src/revise'
import type { Lesson } from '../src/ast'

const lesson = (body: string, front = 'title: Heat\nlevel: beginner\nlang: en\ngoals: [Explain heat]') => `---\n${front}\n---\n\n${body}`
const CARD = (title: string, q = 'What is it?') => `## ${title}

Some words.

:::quiz
${q}

- [x] This
  > Right.
- [ ] That
  > No.
:::
`
const compiled = (source: string, path = '/c/02-heat.learn.md'): Lesson => compile(source, { path }).lesson!
const review = (key: string, t: number, id = `${key}-${t}`) => ({ id, t, key, rating: 3 as const })

describe('pinIds', () => {
  it('writes each card id on its heading and the lesson id in its frontmatter', () => {
    const out = pinIds(lesson(`${CARD('Base rate')}\n${CARD('Base rate')}`), '/c/02-heat.learn.md')
    expect(out).toContain('## Base rate {#base-rate}\n')
    expect(out).toContain('## Base rate {#base-rate-1}\n')
    expect(out).toMatch(/^---\nid: heat\ntitle: Heat/)
    const pinned = compiled(out, '/c/somewhere-else.learn.md')
    expect(pinned.id).toBe('heat')
    expect(pinned.cards.map((c) => c.id)).toEqual(['base-rate', 'base-rate-1'])
    expect(pinned.cards[0].title).toBe('Base rate')
  })
  it('changes nothing the second time', () => {
    const once = pinIds(lesson(CARD('Base rate')), '/c/02-heat.learn.md')
    expect(pinIds(once, '/c/02-heat.learn.md')).toBe(once)
  })
  it('keeps an id already written, and only pins what it is asked to', () => {
    const out = pinIds(lesson(`${CARD('First {#mine}')}\n${CARD('Second')}\n${CARD('Third')}`, 'id: fixed\ntitle: Heat\nlevel: beginner\nlang: en\ngoals: [Explain heat]'), '/c/x.learn.md', new Set(['second']))
    expect(out).toContain('## First {#mine}\n')
    expect(out).toContain('## Second {#second}\n')
    expect(out).toContain('## Third\n')
    expect(out.match(/^id:/gm)).toHaveLength(1)
  })
  it('pins titles in any language, and a slug that starts with a dash', () => {
    const out = pinIds(lesson(`${CARD('Perché il calore fluisce')}\n${CARD('— Entropía y orden')}\n${CARD('Forêt à énergie')}`), '/c/a.learn.md')
    const before = compiled(lesson(`${CARD('Perché il calore fluisce')}\n${CARD('— Entropía y orden')}\n${CARD('Forêt à énergie')}`), '/c/a.learn.md')
    const after = compiled(out, '/c/a.learn.md')
    expect(after.cards.map((c) => c.id)).toEqual(before.cards.map((c) => c.id))
    expect(after.cards.map((c) => c.title)).toEqual(before.cards.map((c) => c.title))
    const renamed = compiled(out.replace('## Perché il calore fluisce', '## Il verso del calore'), '/c/a.learn.md')
    expect(renamed.cards[0].id).toBe(before.cards[0].id)
    expect(renamed.cards[0].title).toBe('Il verso del calore')
  })
  it('does not change the id of a same-titled card it leaves unpinned', () => {
    const source = lesson(`${CARD('Base rate')}\n${CARD('Base rate')}`)
    const out = pinIds(source, '/c/a.learn.md', new Set(['base-rate']))
    expect(compiled(out, '/c/a.learn.md').cards.map((c) => c.id)).toEqual(['base-rate', 'base-rate-1'])
  })
  it('leaves the lesson id out when its file name could not be an id', () => {
    const out = pinIds(lesson(CARD('Base rate')), '/c/03-Calor específico.learn.md')
    expect(out).not.toMatch(/^id:/m)
    expect(compile(out, { path: '/c/03-Calor específico.learn.md' }).diagnostics.filter((d) => d.code.startsWith('E'))).toEqual([])
  })
  it('handles a byte-order mark and closing hashes', () => {
    const out = pinIds(`\uFEFF${lesson(CARD('Base rate ##'))}`, '/c/02-heat.learn.md')
    expect(out).toContain('## Base rate {#base-rate}\n')
    expect(compiled(out).id).toBe('heat')
    expect(compiled(out).title).toBe('Heat')
  })
  it('leaves a heading in a code block alone', () => {
    const body = `## Real\n\nText.\n\n\`\`\`markdown\n## Not a card\n\`\`\`\n`
    const out = pinIds(lesson(body), '/c/a.learn.md')
    expect(out).toContain('## Real {#real}\n')
    expect(out).toContain('## Not a card\n')
  })
  it('keeps Windows line endings', () => {
    const out = pinIds(lesson(CARD('Base rate')).replace(/\n/g, '\r\n'), '/c/a.learn.md')
    expect(out).toContain('## Base rate {#base-rate}\r\n')
  })
  it('leaves a lesson that does not compile as it is', () => {
    expect(pinIds('no title here', '/c/a.learn.md')).toBe('no title here')
  })
  it('lets a title change without losing the schedule', () => {
    const before = compiled(lesson(CARD('Base rate')))
    const reviews = [review(`${before.id}/base-rate`, 1000)]
    const pinned = pinIds(lesson(CARD('Base rate')), '/c/02-heat.learn.md')
    const after = compiled(pinned.replace('## Base rate', '## The base rate fallacy'), '/c/07-renamed.learn.md')
    expect(deriveCards(reviews).has(`${after.id}/${after.cards[0].id}`)).toBe(true)
    expect(lostCards([after], reviews, new Set())).toEqual([])
  })
})

describe('courseChanges', () => {
  it('counts what stayed, what is new and what went', () => {
    const before = compiled(lesson(`${CARD('One')}\n${CARD('Two')}\n${CARD('Three')}`))
    const after = compiled(lesson(`${CARD('One')}\n${CARD('Two')}\n${CARD('Four')}`))
    expect(courseChanges([before], [after])).toEqual({
      kept: 2,
      added: [{ key: 'heat/four', title: 'Four' }],
      removed: [{ key: 'heat/three', title: 'Three' }],
    })
  })
})

describe('lostCards', () => {
  const now = compiled(lesson(`${CARD('Carnot cycle limit')}\n${CARD('Heat pumps')}\n${CARD('Studied')}`))
  it('finds a studied card with no card left, and suggests where it went', () => {
    const lost = lostCards([now], [review('heat/studied', 1), review('heat/the-carnot-limit', 2), review('heat/the-carnot-limit', 3)], new Set())
    expect(lost).toHaveLength(1)
    expect(lost[0]).toMatchObject({ key: 'heat/the-carnot-limit', title: 'the carnot limit', reviews: 2, last: 3 })
    expect(lost[0].matches[0]).toEqual({ key: 'heat/carnot-cycle-limit', title: 'Carnot cycle limit' })
    expect(lost[0].matches.map((m) => m.key)).not.toContain('heat/studied') // that one has its own history
  })
  it('looks across lessons, because a card can move', () => {
    const other = compiled(lesson(CARD('Otto cycle'), 'id: engines\ntitle: Engines\nlevel: beginner\nlang: en\ngoals: [Explain engines]'))
    expect(lostCards([now, other], [review('old-lesson/otto-cycle', 1)], new Set())[0].matches[0].key).toBe('engines/otto-cycle')
  })
  it('stops asking about a card you let go', () => {
    expect(lostCards([now], [review('heat/gone', 1)], new Set(['heat/gone']))).toEqual([])
  })
})

describe('carriedOver', () => {
  it('gives the new card the old schedule and leaves the old events in place', () => {
    const log = [review('heat/old', 1000), review('heat/old', 90_000_000), review('heat/other', 5)]
    const copies = carriedOver(log, 'heat/old', 'heat/new')
    expect(copies.map((c) => c.key)).toEqual(['heat/new', 'heat/new'])
    expect(copies.every((c) => c.id.startsWith('moved:'))).toBe(true)
    const cards = deriveCards([...log, ...copies])
    expect(cards.get('heat/new')?.due).toEqual(cards.get('heat/old')?.due)
    expect(carriedOver([...log, ...copies], 'heat/old', 'heat/new').map((c) => c.id)).toEqual(copies.map((c) => c.id)) // the same ids: never recorded twice
  })
})
