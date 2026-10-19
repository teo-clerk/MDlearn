// "Visualise this passage": the local model drafts a visual block; the compiler checks it and the
// diagnostics go back to the model until the block is clean (at most 3 attempts). Nothing is written:
// the learner previews the block and decides where it goes.
import { findSection, sectionText, compile, type Diagnostic, type Visual } from '@mdlearn/core'
import { loadDoc, checkJs } from '@mdlearn/core/node'
import { ollamaChat, type OllamaConfig, type ChatMessage } from './ollama.js'
import type { Handle, Workspaces } from '../workspaces.js'
import type { Anchor } from '../notes.js'

const CHEATSHEET = `You write ONE MDlearn visual block in Markdown. Output only the block, nothing else.

plot — how a quantity changes. Exactly one parameter has a range and NO value: the x axis. Every other symbol in the formula needs a value. Formulas in LaTeX, form "name = expression". Optional {y=log} for power laws.
:::plot[Received power falls as R⁻⁴]{y=log}
Drag the gain: the curve moves but the slope stays.
$$P_r = \\frac{P_t G^2 \\lambda^2 \\sigma}{(4\\pi)^3 R^4}$$
- $R$ in [100e3, 2000e3] m — slant range
- $P_t$ = 1000 in [10, 5000] W — transmit power
- $G$ = 1000 in [10, 10000] log — antenna gain
- $\\lambda$ = 0.055 m — wavelength
- $\\sigma$ = 1 m^2 — radar cross-section
:::

formula — explain the terms of one equation. Each term must appear in the formula exactly as written.
:::formula[Bayes' theorem, term by term]
$$P(H \\mid E) = \\frac{P(E \\mid H)\\,P(H)}{P(E)}$$
- $P(E \\mid H)$ — likelihood: how expected the evidence is if the hypothesis is true
- $P(H)$ — prior: what you believed before
- $P(E)$ — evidence: how expected it is overall
:::

animate — a derivation in 2–6 steps, each "N. $$formula$$ caption".
:::animate[Where R⁴ comes from]
1. $$S_{tx} = \\frac{P_t G}{4\\pi R^2}$$ Power density at the target.
2. $$S_{rx} = \\frac{P_t G\\,\\sigma}{(4\\pi)^2 R^4}$$ Spread again on the way back.
:::

Rules: computable LaTeX only (\\frac, powers, \\sqrt, \\exp, \\ln, \\log_{10}, \\sin, \\cos, \\max, |x|). Declare every symbol, including constants. Use realistic values from the passage. Caption in square brackets. Keep labels short.`

export interface VisualDraft { markdown: string; block: Visual | null; diagnostics: Diagnostic[]; attempts: number; kind: string }
const extract = (text: string): string | null => {
  const m = /:::(plot|formula|animate|chart|graph|equation|animation)[\s\S]*?\n:::(?=\s*$|\n)/m.exec(text.replace(/```(?:markdown|md)?\n?/g, ''))
  return m ? m[0].trim() : null
}
function check(markdown: string): { block: Visual | null; diagnostics: Diagnostic[] } {
  const r = compile(`---\ntitle: Draft\n---\n## Card\n\n${markdown}\n`, { checkJs })
  const block = (r.lesson?.cards[0]?.blocks.find((b) => ['plot', 'formula', 'animate'].includes(b.type)) ?? null) as Visual | null
  // lines refer to the stub: shift them back to the block (the stub adds 5 lines)
  return { block, diagnostics: r.diagnostics.filter((d) => /^[EW]/.test(d.code)).map((d) => ({ ...d, line: Math.max(1, d.line - 5) })) }
}
export async function visualise(h: Handle, workspaces: Workspaces, cfg: OllamaConfig, doc: string, anchor: Anchor, kind: 'auto' | 'plot' | 'formula' | 'animate', signal?: AbortSignal): Promise<VisualDraft> {
  const abs = workspaces.resolve(h, doc)
  const { outline, md } = loadDoc(abs, h.root)
  const section = anchor.section ? findSection(outline, anchor.section) : null
  const context = section ? sectionText(md, outline, section.num ?? section.anchor, 900)?.text ?? '' : ''
  const want = kind === 'auto' ? 'Choose the kind (plot, formula or animate) that best shows the idea of the passage.' : `Write a ${kind} block.`
  const messages: ChatMessage[] = [
    { role: 'system', content: CHEATSHEET },
    { role: 'user', content: `${section ? `Section §${section.num ?? section.anchor} ${section.title}:\n"""\n${context}\n"""\n\n` : ''}Passage to visualise: "${anchor.quote.exact}"\n\n${want}` },
  ]
  let best: VisualDraft = { markdown: '', block: null, diagnostics: [], attempts: 0, kind }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const text = await ollamaChat(cfg, { messages, signal, temperature: attempt === 1 ? 0.3 : 0.2, numCtx: 8192 })
    const block = extract(text)
    if (!block) {
      messages.push({ role: 'assistant', content: text }, { role: 'user', content: 'Answer with only the :::plot, :::formula or :::animate block, starting with ::: and ending with a line containing only :::.' })
      continue
    }
    const r = check(block)
    best = { markdown: block, block: r.block, diagnostics: r.diagnostics, attempts: attempt, kind: r.block?.type ?? kind }
    if (r.block && !r.diagnostics.length) return best
    const lines = block.split('\n')
    const report = r.diagnostics.map((d) => `line ${d.line}: ${d.code} ${d.message ?? ''} — ${lines[d.line - 1] ?? ''}`).join('\n') || 'The block did not compile into a visual.'
    messages.push({ role: 'assistant', content: block }, { role: 'user', content: `The checker found:\n${report}\nReturn the corrected block only.` })
  }
  return best
}
