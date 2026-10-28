// What the AI Studio can be asked to do, turned into job specs: the prompt, the folders it may write,
// and any files the server prepares first (lesson scaffolds), all inside the job's undo snapshot.
import { existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { coursePrompt } from '@mdlearn/core'
import { findDoc, lessonDirFor, scaffoldLessons, loadDoc, inRoot } from '@mdlearn/core/node'
import { slugify } from '../import/common.js'
import type { Handle } from '../workspaces.js'
import { UserError } from '../workspaces.js'
import type { PreWrite } from './jobs.js'
import type { JobSpec } from './engine.js'

type Recipe = { spec: Omit<JobSpec, 'id' | 'root'>; preWrite?: PreWrite }
const posix = (p: string) => p.split(sep).join('/')

/** A course for one document: the server writes lesson skeletons (one card per subsection, linked to the source), Claude fills them. */
export function createCourse(h: Handle, docRel: string): Recipe {
  const abs = findDoc(h.ws, docRel)
  if (!abs) throw new UserError('not-found', `No document ${docRel}.`)
  const plan = scaffoldLessons(h.ws, abs)
  const fresh = plan.filter((p) => p.content !== null)
  if (!fresh.length) throw new UserError('exists', 'This document already has all its lessons. Use "Improve a lesson" instead.')
  const { outline } = loadDoc(abs, h.root)
  const rel = posix(relative(h.root, abs))
  const files = fresh.map((p) => posix(relative(h.root, p.path)))
  return {
    spec: {
      recipe: 'course.create', title: `Course from ${outline.title || rel}`, maxTurns: 40 + 15 * fresh.length,
      writeScope: [lessonDirFor(h.ws, abs)],
      prompt: `Build an interactive course from the user's notes with MDlearn.

Source document: ${rel} — read it with the mdlearn tools doc_outline and get_section. Never edit it.
These lesson files were just created from the document's outline (frontmatter, one card per subsection, \`::read[§…]\` links to the source, TODO comments):
${files.map((f) => `- ${f}`).join('\n')}

For each file, following the mdlearn-curriculum skill (steps 4–5) and the mdlearn-course skill:
1. Read the sections each card links to (get_section).
2. Replace every TODO: give each card the gist in at most three sentences and one retrieval question that tests it — a :::quiz whose wrong options each have feedback naming the misconception, a :::cloze, an :::order, a :::steps worked example with gaps, or an :::explain with key ideas. Vary the kinds.
3. Fill \`goals\` with 2–4 objectives these sections serve; keep \`source:\`, \`id\` and every \`::read\`.
4. Call lint_lesson on the file and fix every E and W line; repeat until it is clean.

Write only these files. Finish with one line per file: its path, the number of cards and questions, and the lint result.`,
    },
    preWrite: (write) => { for (const p of fresh) write(p.path, p.content!) },
  }
}

const FOCUS: Record<string, string> = {
  questions: 'Strengthen the questions: every card should end with a retrieval question; wrong quiz options need feedback naming the misconception; vary the question kinds.',
  clarity: 'Make the explanations clearer and shorter (at most three sentences per card) without losing anything the source says.',
  lint: 'Fix every lint error and warning.',
  all: 'Fix lint problems, make sure every card has a good retrieval question (feedback on every wrong option), and tighten explanations.',
}
export interface LeechContext { cardKey: string; title: string; wrong: string[] }
export function improveLesson(h: Handle, lessonRel: string, focus: keyof typeof FOCUS | 'leech' = 'all', extra = '', leech?: LeechContext): Recipe {
  const abs = inRoot(h.root, lessonRel)
  if (!abs || !lessonRel.endsWith('.learn.md') || !existsSync(abs)) throw new UserError('not-found', `No lesson ${lessonRel}.`)
  const task = focus === 'leech' && leech
    ? `The learner keeps failing one card: "${leech.title}" (card key ${leech.cardKey}; the card's heading in the file is the title). Their wrong answers: ${leech.wrong.length ? leech.wrong.map((w) => `"${w}"`).join(', ') : 'none recorded'}.
Fix that card so it is learnable: find the misconception behind the wrong answers and address it directly. Options, in order of preference: add a worked example or a hint before the question; split it into two simpler cards (keep the original card's heading so its history stays); rewrite the stem so it tests one idea; make wrong options plausible and give each feedback naming the misconception. Read the linked source section with get_section first. Change only this card (and a new card if you split it).`
    : FOCUS[focus as keyof typeof FOCUS] ?? FOCUS.all
  return {
    spec: {
      recipe: focus === 'leech' ? 'leech.fix' : 'lesson.improve', title: focus === 'leech' && leech ? `Fix “${leech.title}”` : `Improve ${lessonRel.split('/').pop()}`, maxTurns: focus === 'leech' ? 25 : 40, writeScope: [abs],
      prompt: `Improve the MDlearn lesson ${lessonRel} (follow the mdlearn-course skill; read its source sections with get_section when it has \`source:\`).
${task}${extra.trim() ? `\nThe user adds: ${extra.trim()}` : ''}
Keep ids, \`source:\` and \`::read\` links. Edit only this file. Call lint_lesson until it reports no errors and no warnings. Finish with one line saying what changed.`,
    },
  }
}

/** A PDF read page by page by Claude (it sees the page images, so formulas become LaTeX) into a new Markdown document. */
export function importPdf(h: Handle, pdfRel: string, outRel: string, pages: number | null): Recipe {
  const pdf = inRoot(h.root, pdfRel), out = inRoot(h.root, outRel)
  if (!pdf || !out || !/\.pdf$/i.test(pdfRel) || !/\.md$/i.test(outRel) || !existsSync(pdf)) throw new UserError('not-found', `No PDF ${pdfRel}.`)
  const ranges = pages ? `${pages} pages: ask for "1-20", then "21-40" and so on` : 'ask for 20 pages at a time ("1-20", "21-40", …) until a request says the document has ended'
  return {
    spec: {
      recipe: 'pdf.import', title: `Import ${pdfRel.split('/').pop()}`, maxTurns: 20 + 6 * Math.ceil((pages ?? 60) / 10), writeScope: [out],
      prompt: `Convert the PDF ${pdfRel} into a clean Markdown document at ${outRel}, as faithfully as you can.

How: use the Read tool on the PDF with its \`pages\` parameter, at most 20 pages per call (${ranges}). After each part, add it to ${outRel} (Write for the first part, then Edit to append), so nothing is lost if you are stopped.
Rules:
- Start with one \`# Title\`; use \`##\` and \`###\` for the PDF's own headings. Keep section numbers if it has them.
- Write all mathematics as LaTeX: inline $…$, display $$…$$ on their own lines. Tables as Markdown tables; lists as lists; code in fenced blocks.
- A figure becomes one italic line, *Figure: what it shows*; never invent data you cannot read.
- Drop running headers, footers and page numbers; join words split by hyphenation at a line end.
- Keep the original wording. Do not summarise, translate or comment.
Write only ${outRel}. Finish with one line: pages converted, sections, formulas.`,
    },
  }
}

export function customJob(h: Handle, request: string, scopeRel: string): Recipe {
  const scope = inRoot(h.root, scopeRel || 'learn')
  if (!scope || scope === h.root && scopeRel !== '.') throw new UserError('path', 'That folder is outside this workspace.')
  return {
    spec: {
      recipe: 'custom', title: request.slice(0, 80), maxTurns: 60, writeScope: [scope],
      prompt: `${request.trim()}

Context: this is a folder of Markdown notes used with MDlearn. Lessons are \`.learn.md\` files (mdlearn-course skill); you may create or edit Markdown files only inside ${posix(relative(h.root, scope)) || '.'}/. Check every lesson you write with lint_lesson until it has no errors or warnings. Finish with a short summary.`,
    },
  }
}

export interface TopicCourse { topic: string; level?: string; language?: string; minutes?: number; notes?: string }
/** A course on any topic, from notes in the folder or from general knowledge, in a new folder of its own. */
export function topicCourse(h: Handle, o: TopicCourse): Recipe {
  if (o.notes && o.notes.split(/[\\/]/).some((p) => p.startsWith('.'))) throw new UserError('path', 'Hidden files and folders cannot be used as notes.')
  if (o.notes && !existsSync(inRoot(h.root, o.notes) ?? '')) throw new UserError('not-found', `No file or folder ${o.notes} in this folder.`)
  const base = slugify(o.topic, 48)
  let folder = base
  for (let n = 2; existsSync(join(h.root, folder)); n++) folder = `${base}-${n}`
  const prompt = coursePrompt({ ...o, folder, save: 'write' })
  return {
    spec: {
      recipe: 'course.topic', title: `Course: ${o.topic.slice(0, 70)}`, maxTurns: 40 + 12 * Math.max(1, Math.round((o.minutes ?? 45) / 12)),
      writeScope: [join(h.root, folder)],
      prompt: `${prompt}

Context: this is a folder used with MDlearn Studio. Write only inside ${folder}/ (create it). ${o.notes ? `You may read ${o.notes} but never edit it.` : ''}`.trim(),
    },
  }
}
