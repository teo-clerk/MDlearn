// Feedback on a free-text explanation: the local model compares it with the card's key ideas and
// suggests, per idea, covered / partly / missing. A suggestion only: the learner still rates themselves.
import { z } from 'zod'
import { locate, toMarkdown, type Lesson } from '@mdlearn/core'
import { loadCourse } from '@mdlearn/core/node'
import { ollamaChat, type OllamaConfig } from './ollama.js'
import type { Handle } from '../workspaces.js'
import { UserError } from '../workspaces.js'

const Verdict = z.object({
  ideas: z.array(z.object({ index: z.number().int().min(1), verdict: z.enum(['covered', 'partly', 'missing']), evidence: z.string().max(400).optional() })),
  feedback: z.string().max(1200),
})
export type JudgeResult = z.infer<typeof Verdict>
const SCHEMA = {
  type: 'object', required: ['ideas', 'feedback'],
  properties: {
    ideas: { type: 'array', items: { type: 'object', required: ['index', 'verdict'], properties: { index: { type: 'integer' }, verdict: { type: 'string', enum: ['covered', 'partly', 'missing'] }, evidence: { type: 'string' } } } },
    feedback: { type: 'string' },
  },
}
export async function judge(h: Handle, cfg: OllamaConfig, widgetId: string, text: string): Promise<JudgeResult> {
  const lessons = loadCourse(h.ws.learnDir).map((l) => l.lesson).filter((l): l is Lesson => !!l)
  const loc = locate(lessons, widgetId)
  if (!loc || loc.widget.type !== 'explain') throw new UserError('not-found', 'Feedback is available for explanation cards only.')
  const ideas = loc.widget.ideas.map((i, k) => `${k + 1}. ${toMarkdown(i).replace(/\s+/g, ' ')}`).join('\n')
  const prompt = toMarkdown(loc.widget.prompt)
  const raw = await ollamaChat(cfg, {
    format: SCHEMA, temperature: 0.1,
    messages: [
      { role: 'system', content: 'You grade a student explanation against numbered key ideas. An idea is "covered" only if the student states it (in any words), "partly" if they gesture at it without the essential point, "missing" otherwise. Be strict: an idea not mentioned is missing. Quote the student as evidence. Feedback: one or two encouraging sentences naming what to add. Reply in JSON.' },
      { role: 'user', content: `Question:\n${prompt}\n\nKey ideas:\n${ideas}\n\nStudent answer:\n"""${text.slice(0, 4000)}"""` },
    ],
  })
  const parsed = Verdict.safeParse(JSON.parse(raw))
  if (!parsed.success) throw new UserError('engine', 'The local model gave an answer that could not be read. Rate yourself with the key ideas.')
  const n = loc.widget.ideas.length
  return { ...parsed.data, ideas: parsed.data.ideas.filter((i) => i.index <= n) }
}
