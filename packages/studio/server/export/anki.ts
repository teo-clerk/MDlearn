// Study cards as an Anki deck (.apkg): a zip holding a legacy-format collection (SQLite) that every Anki
// version imports. Quiz, order, explain, steps, code and the games become "Basic" notes, cloze becomes "Cloze" (all gaps
// of one card are hidden together). Notes carry a stable id, so importing again updates instead of duplicating.
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { zipSync, strToU8 } from 'fflate'
import { seededOrder, rightOrder, sortItems, speedItems, isWidget, type Lesson, type Widget, type Blank } from '@mdlearn/core'
import { esc, inlineHtml, toHtml } from './html.js'

type W = Exclude<Widget, { type: 'unavailable' }>
const BASIC_MODEL = 1735689601001
const CLOZE_MODEL = 1735689601002
const FIELD_SEP = '\x1f'
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export interface AnkiNote { guid: string; model: 'basic' | 'cloze'; deck: string; fields: string[]; tags: string[] }

const answerOf = (b: Blank | undefined) => (b ? b.answers[0] : '')
/** Cloze text: every gap is `{{c1::answer}}`; inside TeX a space keeps `}}` from ending the cloze early. */
function clozeFor(blanks: Blank[]) {
  const byId = new Map(blanks.map((b) => [b.id, b]))
  return { blank: (id: string, tex: boolean) => (tex ? `{{c1::${answerOf(byId.get(id))} }}` : `{{c1::${esc(answerOf(byId.get(id)))}}}`) }
}
/** Shown answers instead of gaps (the back of a steps card). */
function answersFor(blanks: Blank[]) {
  const byId = new Map(blanks.map((b) => [b.id, b]))
  return { blank: (id: string, tex: boolean) => (tex ? `\\boxed{${answerOf(byId.get(id))}}` : `<b>${esc(answerOf(byId.get(id)))}</b>`) }
}
const withReveal = (w: W) => (w.reveal?.length ? `<hr>${toHtml(w.reveal)}` : '')

export function noteFor(lesson: Lesson, cardId: string, w: W, cardTitle: string): AnkiNote {
  const tags = ['mdlearn', lesson.id.replace(/[^\w-]/g, '_')]
  const deck = `MDlearn::${lesson.title.replace(/[:"]/g, ' ').trim() || lesson.id}`
  const guid = createHash('sha1').update(`${lesson.id}/${cardId}/${w.id}`).digest('base64').replace(/[+/=]/g, '').slice(0, 10)
  const basic = (front: string, back: string): AnkiNote => ({ guid, model: 'basic', deck, fields: [front, back], tags })
  switch (w.type) {
    case 'quiz': {
      const opts = `<ol type="A">${w.options.map((o) => `<li>${inlineHtml(o.content)}</li>`).join('')}</ol>`
      const right = w.options.flatMap((o, i) => (o.correct ? [`<p><b>${LETTERS[i]}.</b> ${inlineHtml(o.content)}</p>${o.feedback?.length ? `<div><small>${toHtml(o.feedback)}</small></div>` : ''}`] : []))
      return basic(`${toHtml(w.stem)}${opts}${w.multi ? '<p><i>Several options are correct.</i></p>' : ''}`, `${right.join('')}${withReveal(w)}`)
    }
    case 'cloze': return { guid, model: 'cloze', deck, fields: [toHtml(w.body, clozeFor(w.blanks)), withReveal(w).replace(/^<hr>/, '')], tags }
    case 'order': {
      const shown = seededOrder(w.items.map((it, i) => ({ it, i })), w.id)
      return basic(`${toHtml(w.prompt)}<ol>${shown.map((x) => `<li>${toHtml(x.it).replace(/^<p>|<\/p>$/g, '')}</li>`).join('')}</ol><p><i>Put these in the right order.</i></p>`,
        `<ol>${w.items.map((it) => `<li>${toHtml(it).replace(/^<p>|<\/p>$/g, '')}</li>`).join('')}</ol>${withReveal(w)}`)
    }
    case 'explain': return basic(toHtml(w.prompt), `<ul>${w.ideas.map((i) => `<li>${toHtml(i).replace(/^<p>|<\/p>$/g, '')}</li>`).join('')}</ul>${withReveal(w)}`)
    case 'steps': return basic(toHtml(w.problem), `<ol>${w.steps.map((s) => `<li>${toHtml(s, answersFor(w.blanks)).replace(/^<p>|<\/p>$/g, '')}</li>`).join('')}</ol>${withReveal(w)}`)
    case 'code': return basic(`${toHtml(w.prompt)}${w.starter ? `<pre><code>${esc(w.starter)}</code></pre>` : ''}`, `${w.solution ? `<pre><code>${esc(w.solution)}</code></pre>` : `<p>${esc(cardTitle)}</p>`}${withReveal(w)}`)
    case 'match': {
      const right = rightOrder(w)
      return basic(`${toHtml(w.prompt)}<table><tr><td><ol>${w.pairs.map((p) => `<li>${inlineHtml(p.left)}</li>`).join('')}</ol></td><td><ol type="A">${right.map((i) => `<li>${inlineHtml(w.pairs[i].right)}</li>`).join('')}</ol></td></tr></table><p><i>Match each number with a letter.</i></p>`,
        `<ul>${w.pairs.map((p) => `<li>${inlineHtml(p.left)} — ${inlineHtml(p.right)}</li>`).join('')}</ul>${withReveal(w)}`)
    }
    case 'sort':
      return basic(`${toHtml(w.prompt)}<p>${w.groups.map((g) => `<b>${inlineHtml(g.label)}</b>`).join(' · ')}</p><ul>${sortItems(w).map((x) => `<li>${inlineHtml(x.content)}</li>`).join('')}</ul><p><i>Sort each item into its group.</i></p>`,
        `${w.groups.map((g) => `<p><b>${inlineHtml(g.label)}</b>: ${g.items.map((x) => inlineHtml(x)).join(', ')}</p>`).join('')}${withReveal(w)}`)
    case 'speed': {
      const shown = speedItems(w)
      return basic(`${toHtml(w.prompt)}<ol>${shown.map((x) => `<li>${inlineHtml(x.content)}</li>`).join('')}</ol><p><i>True or false?</i></p>`,
        `<ol>${shown.map((x) => `<li><b>${x.truth ? 'True' : 'False'}</b>${x.feedback?.length ? ` — ${toHtml(x.feedback).replace(/^<p>|<\/p>$/g, '')}` : ''}</li>`).join('')}</ol>${withReveal(w)}`)
    }
  }
}

export function notesOf(lessons: Lesson[]): AnkiNote[] {
  const out: AnkiNote[] = []
  for (const l of lessons) for (const c of l.cards) for (const b of c.blocks) if (isWidget(b)) out.push(noteFor(l, c.id, b, c.title))
  return out
}

// ---- the collection
const css = '.card { font-family: Georgia, serif; font-size: 19px; text-align: left; color: #222; background: #fff; max-width: 40em; margin: auto; } pre { background: #f5f5f3; padding: .6em .8em; border-radius: 6px; overflow-x: auto; } .cloze { font-weight: bold; color: #1d4ed8; } td, th { border: 1px solid #ccc; }'
const fld = (name: string, ord: number) => ({ name, ord, sticky: false, rtl: false, font: 'Georgia', size: 20, media: [] })
const model = (id: number, name: string, type: 0 | 1, fields: string[], qfmt: string, afmt: string, now: number) => ({
  id, name, type, mod: now, usn: -1, sortf: 0, did: 1, tmpls: [{ name: type ? 'Cloze' : 'Card 1', ord: 0, qfmt, afmt, bqfmt: '', bafmt: '', did: null, bfont: '', bsize: 0 }],
  flds: fields.map(fld), css, latexPre: '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n',
  latexPost: '\\end{document}', latexsvg: false, req: [[0, 'any', [0]]], tags: [], vers: [],
})
const deckObj = (id: number, name: string, now: number) => ({ id, name, mod: now, usn: -1, lrnToday: [0, 0], revToday: [0, 0], newToday: [0, 0], timeToday: [0, 0], collapsed: false, browserCollapsed: false, desc: '', dyn: 0, conf: 1, extendNew: 0, extendRev: 0 })
const deckId = (name: string) => 1_700_000_000_000 + (parseInt(createHash('sha1').update(name).digest('hex').slice(0, 8), 16) % 1_000_000_000)
const checksum = (s: string) => parseInt(createHash('sha1').update(s.replace(/<[^>]*>/g, '')).digest('hex').slice(0, 8), 16)

export function buildApkg(notes: AnkiNote[], now = Date.now()): Uint8Array {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn); CREATE INDEX ix_cards_usn on cards (usn); CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid); CREATE INDEX ix_cards_sched on cards (did, queue, due); CREATE INDEX ix_revlog_cid on revlog (cid); CREATE INDEX ix_notes_csum on notes (csum);`)
  const sec = Math.floor(now / 1000)
  const decks: Record<string, unknown> = { 1: deckObj(1, 'Default', sec) }
  const ids = new Map<string, number>()
  for (const n of notes) if (!ids.has(n.deck)) { const id = deckId(n.deck); ids.set(n.deck, id); decks[id] = deckObj(id, n.deck, sec) }
  const models = {
    [BASIC_MODEL]: model(BASIC_MODEL, 'MDlearn Basic', 0, ['Front', 'Back'], '{{Front}}', '{{FrontSide}}<hr id=answer>{{Back}}', sec),
    [CLOZE_MODEL]: model(CLOZE_MODEL, 'MDlearn Cloze', 1, ['Text', 'Extra'], '{{cloze:Text}}', '{{cloze:Text}}<br>{{Extra}}', sec),
  }
  const dconf = { 1: { id: 1, name: 'Default', replayq: true, lapse: { leechFails: 8, minInt: 1, delays: [10], leechAction: 0, mult: 0 }, rev: { perDay: 200, fuzz: 0.05, ivlFct: 1, maxIvl: 36500, ease4: 1.3, bury: true, minSpace: 1 }, timer: 0, maxTaken: 60, usn: 0, new: { perDay: 20, delays: [1, 10], separate: true, ints: [1, 4, 7], initialFactor: 2500, bury: true, order: 1 }, mod: 0, autoplay: true } }
  const conf = { nextPos: notes.length + 1, estTimes: true, activeDecks: [1], sortType: 'noteFld', timeLim: 0, sortBackwards: false, addToCur: true, curDeck: 1, newBury: true, newSpread: 0, dueCounts: true, curModel: String(BASIC_MODEL), collapseTime: 1200 }
  db.prepare('INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, ?)').run(sec - (sec % 86400), now, now, JSON.stringify(conf), JSON.stringify(models), JSON.stringify(decks), JSON.stringify(dconf), '{}')
  const addNote = db.prepare('INSERT INTO notes VALUES (?, ?, ?, ?, -1, ?, ?, ?, ?, 0, \'\')')
  const addCard = db.prepare('INSERT INTO cards VALUES (?, ?, ?, 0, ?, -1, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, \'\')')
  notes.forEach((n, i) => {
    const id = now + i // unique and increasing
    addNote.run(id, n.guid, n.model === 'cloze' ? CLOZE_MODEL : BASIC_MODEL, sec, ` ${n.tags.join(' ')} `, n.fields.join(FIELD_SEP), n.fields[0].replace(/<[^>]*>/g, '').slice(0, 200), checksum(n.fields[0]))
    addCard.run(id, id, ids.get(n.deck)!, sec, i + 1)
  })
  const bytes = db.serialize()
  db.close()
  return zipSync({ 'collection.anki2': bytes, media: strToU8('{}') }, { level: 6 })
}
