import { t } from '../i18n'

// Blocks the editor can insert. `‸` marks where the cursor goes (the first one); it is not written.
export interface Snippet { id: string; label: string; hint: string; group: 'Questions' | 'Visuals' | 'Text'; lessonOnly?: boolean; text: string }
/** The insertable blocks; a function so the labels are translated when the menu opens. */
export const SNIPPETS = (): Snippet[] => [
  { id: 'quiz', group: 'Questions', label: t('Multiple choice'), hint: t('One right answer, a reason for each wrong one'), text: ':::quiz\n‸Question?\n- [ ] A wrong answer\n  > Why it is tempting and wrong.\n- [x] The right answer\n  > Why it holds.\n- [ ] Another wrong answer\n  > Why not.\n:::\n' },
  { id: 'cloze', group: 'Questions', label: t('Fill the gaps'), hint: '{{answer}} or {{answer|alternative}}', text: ':::cloze\nA sentence with a {{‸gap}} and a formula $x = {{2}}$.\n:::\n' },
  { id: 'order', group: 'Questions', label: t('Put in order'), hint: t('Three or more steps in the right order'), text: ':::order\n‸Put the steps in order.\n1. First\n2. Second\n3. Third\n:::\n' },
  { id: 'explain', group: 'Questions', label: t('Explain in your words'), hint: t('The quoted lines are the key ideas'), text: ':::explain\n‸Explain why …\n> - First key idea.\n> - Second key idea.\n:::\n' },
  { id: 'steps', group: 'Questions', label: t('Worked steps'), hint: t('A problem solved in numbered steps, with gaps'), text: ':::steps\n‸The problem.\n1. First step.\n2. Second step with an answer {{42}}.\n> The takeaway.\n:::\n' },
  { id: 'code', group: 'Questions', label: t('Code exercise'), hint: t('Starter, checks and solution; Python runs in the browser'), lessonOnly: true, text: ':::code\n‸What to write.\n```python\ndef f(x):\n    ...\n```\n```python test\nassert f(2) == 4\n```\n```python solution\ndef f(x):\n    return x * 2\n```\n:::\n' },
  { id: 'hint', group: 'Questions', label: t('Hint line'), hint: t('Inside a question, before the closing :::'), lessonOnly: true, text: '::hint[‸A nudge without the answer.]\n' },
  { id: 'read', group: 'Questions', label: t('Reading reference'), hint: t('Points a card back to a section of the source document'), lessonOnly: true, text: '::read[§‸1]\n' },
  { id: 'plot', group: 'Visuals', label: t('Plot with sliders'), hint: t('A formula drawn live, one slider per parameter'), text: ':::plot[‸Title]\n$$y = a x^2$$\n- $x$ in [-5, 5] — input\n- $a$ = 1 in [0.1, 5] — curvature\n:::\n' },
  { id: 'formula', group: 'Visuals', label: t('Explained formula'), hint: t('Hover a term to see what it means'), text: ':::formula[‸Title]\n$$E = m c^2$$\n- $E$ — energy\n- $m$ — mass\n- $c^2$ — speed of light, squared\n:::\n' },
  { id: 'animate', group: 'Visuals', label: t('Step-by-step derivation'), hint: t('One formula and sentence per step'), text: ':::animate[‸Title]\n1. $$a = b$$ First step.\n2. $$a + 1 = b + 1$$ Second step.\n:::\n' },
  { id: 'sim', group: 'Visuals', label: t('Simulation'), hint: t('JavaScript drawing on a canvas, in a sandbox'), text: ':::sim[‸Title]{height=200}\nWhat the simulation shows.\n```js\n// api.canvas, api.params, api.frame\n```\n:::\n' },
  { id: 'math', group: 'Text', label: t('Display formula'), hint: '$$ … $$', text: '$$\n‸\n$$\n' },
  { id: 'tip', group: 'Text', label: t('Callout'), hint: t('note, tip, important or warning'), text: ':::tip[‸Title]\nText.\n:::\n' },
  { id: 'table', group: 'Text', label: t('Table'), hint: t('Term | Meaning feeds the glossary'), text: '| Term | Meaning |\n|---|---|\n| ‸ |  |\n' },
]
export const snippetsFor = (kind: 'doc' | 'lesson') => SNIPPETS().filter((s) => kind === 'lesson' || !s.lessonOnly)

/** Names offered after `:::` at the start of a line. */
export const BLOCK_NAMES = ['quiz', 'cloze', 'order', 'explain', 'steps', 'code', 'plot', 'formula', 'animate', 'sim', 'note', 'tip', 'important', 'warning']

/** Split a snippet at its cursor marker. */
export function splitCursor(text: string): { text: string; cursor: number } {
  const at = text.indexOf('‸')
  return at < 0 ? { text, cursor: text.length } : { text: text.replace('‸', ''), cursor: at }
}
