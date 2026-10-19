// Lessons go to the browser without answer keys: widgets are replaced by their redacted form.
import { isWidget, redactWidget, type Block, type Lesson, type DocBlock, type DocModel } from '@mdlearn/core'
import type { RedactedBlock, LessonResponse } from '../shared/types.js'

const block = (b: Block): RedactedBlock => (isWidget(b) ? redactWidget(b) : b)
export function redactLesson(lesson: Lesson): NonNullable<LessonResponse['lesson']> {
  return { ...lesson, intro: lesson.intro.map(block), cards: lesson.cards.map((c) => ({ ...c, blocks: c.blocks.map(block) })) }
}

/** Documents may contain authored widgets too: same redaction, inside folded <details> as well. */
export function redactDocBlocks(blocks: DocBlock[]): DocBlock[] {
  return blocks.map((b): DocBlock => {
    if (b.type === 'details') return { ...b, children: redactDocBlocks(b.children) }
    const block = b as Block
    return isWidget(block) ? { ...redactWidget(block), line: b.line } as unknown as DocBlock : b
  })
}
export const redactDoc = <D extends DocModel>(d: D): D => ({ ...d, blocks: redactDocBlocks(d.blocks) })
/** Find an authored widget in a document (for practice checks). */
export function findDocWidget(blocks: DocBlock[], id: string): Extract<Block, { id: string }> | null {
  for (const b of blocks) {
    if (b.type === 'details') { const hit = findDocWidget(b.children, id); if (hit) return hit }
    else if (b.type !== 'heading' && isWidget(b as Block) && (b as { id: string }).id === id) return b as Extract<Block, { id: string }>
  }
  return null
}
