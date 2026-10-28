// `mdlearn review` — a study session in the terminal, written as a coach: it says what today holds,
// asks one card at a time, asks for confidence before giving feedback, explains in words, revisits
// what you missed, and ends with what went well, what to reread, and when to come back.
import { createInterface, type Interface } from 'node:readline'
import { randomUUID } from 'node:crypto'
import {
  studyQueue, locate, pose, check, hint, ratingFor, ratingWords, scheduleAfter, whenText, readsLabel, report, deriveCards,
  type Lesson, type QueueItem, type Outcome, type Located,
} from '@mdlearn/core'
import { loadCourse, loadProgress, loadGoals, appendProgress, type Workspace, type Progress } from '@mdlearn/core/node'
import { bold, dim, out, wrap, plural } from './ui.js'

const MINUTES: Record<string, number> = { quiz: 0.6, cloze: 0.8, order: 1, steps: 1.5, explain: 2, code: 3, match: 1, sort: 1, speed: 1.5 }

/** Lines from stdin, one at a time; works for a person at a terminal and for piped input. */
function lineReader(rl: Interface) {
  const buffered: string[] = []
  let waiting: ((s: string | null) => void) | null = null
  let closed = false
  const echo = (l: string) => { if (!process.stdin.isTTY) process.stdout.write(l + '\n') } // piped input: show what was "typed"
  rl.on('line', (l) => { if (waiting) { const w = waiting; waiting = null; echo(l); w(l) } else buffered.push(l) })
  rl.on('close', () => { closed = true; if (waiting) { const w = waiting; waiting = null; w(null) } })
  return (prompt: string): Promise<string | null> => {
    process.stdout.write(prompt)
    if (buffered.length) { const l = buffered.shift()!; echo(l); return Promise.resolve(l) }
    if (closed) return Promise.resolve(null)
    return new Promise((res) => { waiting = res })
  }
}

interface Result { item: QueueItem; title: string; rating: 1 | 2 | 3; reads: string; docRef?: { doc: string; section: string } }

export async function reviewSession(ws: Workspace, opt: { limit?: string; scope?: string; 'new-cards'?: string; due?: boolean }): Promise<void> {
  const loaded = loadCourse(ws.learnDir)
  const lessons = loaded.map((l) => l.lesson).filter((l): l is Lesson => !!l)
  if (!lessons.length) {
    out(`No lessons found in ${ws.learnDir}.`)
    out('Run this inside a curriculum that has a learn/ folder (e.g. ~/CODING/ESA-PROJECTS), or pass --root <folder>.')
    process.exitCode = 1
    return
  }
  if (opt.scope && !lessons.some((l) => l.id.includes(opt.scope!) || l.title.toLowerCase().includes(opt.scope!.toLowerCase()))) {
    out(`No lessons match "${opt.scope}". Lesson ids look like f04-01-…; run \`mdlearn status\` or \`mdlearn queue\` to see them.`)
    process.exitCode = 1
    return
  }
  const progress = loadProgress(ws)
  const queue = studyQueue(lessons, progress.reviews, {
    limit: Number(opt.limit ?? 10), newCards: opt.due ? 0 : Number(opt['new-cards'] ?? 5), scope: opt.scope, attempts: progress.attempts, suspended: new Set(loadGoals(ws).suspended),
  })
  if (!queue.length) {
    const next = report(lessons, progress.reviews).nextDue
    out(opt.due ? 'Nothing is due right now.' : 'You are all caught up: nothing due and no new cards in this scope.')
    if (next) out(`Next review ${whenText(next)}.`)
    return
  }

  const due = queue.filter((q) => q.reason === 'due').length
  const minutes = Math.max(1, Math.round(queue.reduce((m, q) => m + (MINUTES[q.kind] ?? 1), 0)))
  out()
  out(bold(`Today${opt.scope ? ` · ${opt.scope}` : ''}: ${due ? plural(due, 'card') + ' to review' : ''}${due && queue.length - due ? ', ' : ''}${queue.length - due ? plural(queue.length - due, 'new card') : ''} · about ${minutes} min`))
  out(dim('Answer and press Enter.  ? = hint   s = show the answer   q = finish now'))

  const rl = createInterface({ input: process.stdin, terminal: false })
  const ask = lineReader(rl)
  const results: Result[] = []
  const started = Date.now()
  try {
    for (const [i, item] of queue.entries()) {
      const r = await askOne(lessons, item, `${i + 1} of ${queue.length}`, ask, ws, true)
      if (!r) break
      results.push(r)
    }
    const missed = results.filter((r) => r.rating === 1)
    if (missed.length && results.length === queue.length) {
      out()
      out(bold(`Let's revisit ${missed.length === 1 ? 'the card' : `the ${missed.length} cards`} you missed.`))
      for (const [i, r] of missed.entries()) if (!(await askOne(lessons, r.item, `revisit ${i + 1} of ${missed.length}`, ask, ws, false))) break
    }
  } finally { rl.close() }
  closeSession(lessons, loadProgress(ws), results, started)
}

/** One card. `record` = schedule the result (first pass); revisits only practise. Returns null on quit. */
async function askOne(lessons: Lesson[], item: QueueItem, position: string, ask: (p: string) => Promise<string | null>, ws: Workspace, record: boolean): Promise<Result | null> {
  const loc: Located = locate(lessons, item.widgetId)!
  const p = pose(loc, { surface: 'terminal', bold })
  const reads = readsLabel(p.reads)
  out()
  out(dim(`${position} · ${record ? (item.reason === 'due' ? 'review' : 'new') : 'practice'}`) + '  ' + bold(p.title))
  if (reads) out(dim(`Source: ${reads}`))
  out()
  out(wrap(p.question))
  out()
  out(dim(p.answerFormat))
  let help: Outcome['help'] = 'none'
  let shownHints = 0
  let answer: string | null
  for (;;) {
    answer = await ask('> ')
    if (answer === null || /^q(uit)?$/i.test(answer.trim())) { out(dim('Session paused — progress so far is saved.')); return null }
    if (answer.trim() !== '?') {
      // a reply that cannot be an answer here is re-asked, not graded
      if (loc.widget.type === 'quiz' && answer.trim() && !/\b[A-H]\b/i.test(answer) && !/^s(kip)?$/i.test(answer.trim())) { out(dim(`Type a letter (A–${'ABCDEFGH'[loc.widget.options.length - 1]}), or s to see the answer.`)); continue }
      if (loc.widget.type === 'order' && answer.trim() && !/\d/.test(answer) && !/^s(kip)?$/i.test(answer.trim())) { out(dim('Type the item numbers in order, e.g. 3 1 4 2, or s to see the answer.')); continue }
      break
    }
    const h = hint(loc, shownHints, { surface: 'terminal' })
    if (h) { out(wrap(`Hint: ${h}`)); shownHints++; help = 'author-hint' } else out(dim('No more hints. Answer, or type s to see the answer.'))
  }
  const revealed = /^(s|skip|show)?$/i.test(answer.trim()) || /can'?t recall|don'?t know|non lo so/i.test(answer)
  const res = check(loc, revealed ? '' : answer, lessons, { surface: 'terminal' })
  let correct = res.correct
  let sure: boolean | undefined
  let partial = res.partial

  if (!revealed && correct !== null) {
    const s = await ask('Were you sure? [y/n] ')
    sure = s === null ? undefined : !/^n/i.test(s.trim())
    out()
    out(correct ? `✓ ${bold(partial ? 'Nearly right' : 'Right')}` : `✗ ${bold('Not quite')}`)
    const lines = res.feedback.split('\n').filter((l) => l && !/^(\[\d+\] )?correct$/.test(l))
      .map((l) => (correct ? l.replace(/^(right|correct|yes|exactly)\s*[:,.!—-]\s*/i, '') : l)).filter(Boolean)
    if (lines.length) out(wrap(lines.map((l) => `  ${l}`).join('\n')))
    if (!correct && (loc.widget.type === 'quiz' || loc.widget.type === 'order')) out(wrap(res.answer))
  } else {
    out()
    out(wrap(res.answer || 'No reference answer for this card.'))
    if (correct === null && !revealed) {
      for (;;) {
        const s = (await ask('How did you do? [a] all of it · [p] partly · [m] missed it  ')) ?? 'm'
        const v = s.trim().toLowerCase()
        if (/^(a|all|1)$/.test(v)) { correct = true; break }
        if (/^(p|partly|partial|2)$/.test(v)) { correct = true; partial = true; break }
        if (/^(m|missed|3)$/.test(v)) { correct = false; break }
        out(dim('Please type a, p or m.'))
      }
    }
  }
  if (res.reveal) out(wrap(dim(res.reveal)))

  const outcome: Outcome = { correct: !!correct && !revealed, sure, partial, help, revealed }
  const rating = ratingFor(outcome) as 1 | 2 | 3
  const attempt = { id: randomUUID(), t: Date.now(), widget: item.widgetId, card: item.cardKey, kind: revealed ? 'reveal' as const : 'attempt' as const, correct: outcome.correct, ...(sure !== undefined ? { sure } : {}), answer: (answer ?? '').slice(0, 2000) }
  // saved after every card (merged with other writers), so quitting or a crash loses nothing
  const saved = appendProgress(ws, { attempts: [attempt], reviews: record ? [{ id: randomUUID(), t: Date.now(), key: item.cardKey, rating }] : [] })
  if (record) {
    const next = scheduleAfter(saved.reviews, item.cardKey)
    const w = ratingWords(rating)
    out(`→ ${bold(w.word)}${rating === 1 ? ' · we will come back to it before the session ends' : next ? ` · next review ${whenText(next.due)}` : ''}`)
  }
  const first = p.reads[0]
  return { item, title: p.title.split(' › ').pop()!, rating, reads, docRef: first ? { doc: first.doc.split('/').pop()!.replace(/\.md$/, ''), section: first.section } : undefined }
}

function closeSession(lessons: Lesson[], progress: Progress, results: Result[], started: number): void {
  if (!results.length) return
  const good = results.filter((r) => r.rating === 3)
  const shaky = results.filter((r) => r.rating === 2)
  const missed = results.filter((r) => r.rating === 1)
  const mins = Math.max(1, Math.round((Date.now() - started) / 6e4))
  out()
  out(bold(`Session done: ${good.length} of ${results.length} solid on the first try · ${plural(mins, 'minute')}`))
  if (good.length) out(`Solid: ${good.map((r) => r.title).join(', ')}`)
  if (shaky.length) out(`Shaky (comes back sooner): ${shaky.map((r) => r.title).join(', ')}`)
  if (missed.length) {
    out('Worth rereading:')
    for (const r of missed) out(`  ${r.title}${r.docRef ? dim(`  →  mdlearn section ${r.docRef.doc} ${r.docRef.section}`) : ''}`)
  }
  const newMissed = missed.filter((r) => r.item.reason === 'new').length
  if (newMissed && newMissed >= results.length / 2) out(dim('Missing cards you have only just met is normal: a failed attempt followed by the answer and a reread is what makes it stick.'))
  const rep = report(lessons, progress.reviews, Date.now(), progress.attempts)
  if (rep.nextDue) {
    const soon = deriveDueCount(progress, new Date(rep.nextDue).getTime() + 3600e3)
    out(`Next review ${whenText(rep.nextDue)}${soon > 1 ? ` (${plural(soon, 'card')})` : ''}.`)
  }
  out(`Study streak: ${plural(rep.streak, 'day')}.`)
}
/** Cards due by a given time (for "Next review in 9 minutes (4 cards)"). */
function deriveDueCount(progress: Progress, by: number): number {
  return [...deriveCards(progress.reviews).values()].filter((c) => c.due.getTime() <= by).length
}
