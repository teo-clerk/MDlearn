import { describe, it, expect } from 'vitest'
import { compile, seededOrder, type Lesson } from '@mdlearn/core'
import { queueNow, mark, answered, uuid, pose, NOTHING, type Pending } from '../../web/offline/engine'
import type { OfflinePack } from '../../shared/types'

const quiz = (n: number) => `## Q${n}\n\n:::quiz\nIs ${n} even?\n- [${n % 2 ? ' ' : 'x'}] Yes\n- [${n % 2 ? 'x' : ' '}] No\n  > Look at the last digit.\n:::\n`
const lesson = compile(`---\ntitle: Numbers\nid: numbers\n---\n${[1, 2, 3, 4].map(quiz).join('\n')}`, { path: 'learn/n.learn.md' }).lesson as Lesson
const NOW = Date.parse('2026-10-28T09:00:00')
const pack: OfflinePack = {
  id: uuid(), ws: 'w', name: 'Notes', createdAt: NOW, days: 3, newPerDay: 2, lessons: [lesson],
  cards: lesson.cards.map((c) => ({ cardKey: `numbers/${c.id}`, widgetId: (c.blocks.find((b) => b.type === 'quiz') as { id: string }).id, isNew: true })),
  reviews: [],
}
const right = (widgetId: string) => {
  const w = lesson.cards.flatMap((c) => c.blocks).find((b) => b.type === 'quiz' && b.id === widgetId)
  if (w?.type !== 'quiz') throw new Error('no quiz')
  return { type: 'quiz' as const, picked: [seededOrder(w.options, w.id).findIndex((o) => o.correct)] }
}

describe('studying an offline pack', () => {
  it('makes device ids the server accepts', () => {
    expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(uuid()).not.toBe(uuid())
  })
  it('poses the question without its answer, and marks it on the device', () => {
    const card = pack.cards[0]
    expect(JSON.stringify(pose(pack, card.widgetId).widget)).not.toContain('correct')
    expect(mark(pack, card.widgetId, right(card.widgetId)).correct).toBe(true)
  })
  it('offers the day\'s share of new cards, and an answered card comes back when it is due', () => {
    expect(queueNow(pack, NOTHING, NOW).cards.map((c) => c.cardKey)).toEqual(['numbers/q1', 'numbers/q2'])
    let pending: Pending = NOTHING
    for (const [i, card] of pack.cards.slice(0, 2).entries()) {
      const answer = i === 0 ? right(card.widgetId) : { type: 'skip' as const }
      const checked = mark(pack, card.widgetId, answer)
      const a = answered(pack, pending, card, { answer, checked, hints: 0, outcome: { correct: checked.correct === true, revealed: answer.type === 'skip', sure: true } }, NOW + i)
      pending = { reviews: [...pending.reviews, ...a.add.reviews], attempts: [...pending.attempts, ...a.add.attempts] }
      expect(a.rating).toBe(i === 0 ? 3 : 1)
      expect(a.next).toBeTruthy()
    }
    expect(pending.attempts.map((x) => x.kind)).toEqual(['attempt', 'reveal'])
    const later = queueNow(pack, pending, NOW + 5 * 60_000)
    expect(later.cards.map((c) => c.cardKey)).toEqual(['numbers/q2']) // the missed one, minutes later; no more new cards today
    expect(later.left).toBe(2)
    const tomorrow = queueNow(pack, pending, NOW + 864e5)
    expect(tomorrow.cards.map((c) => c.cardKey)).toEqual(expect.arrayContaining(['numbers/q3', 'numbers/q4']))
  })
})
