import type { Visual } from '@mdlearn/core'
import type { ProseContext } from '../prose/Prose'
import { Plot } from './Plot'
import { ExplainedFormula } from './ExplainedFormula'
import { Animate } from './Animate'
import { Sim } from './Sim'
import { HtmlBlock } from './HtmlBlock'
export const VISUAL_TYPES = new Set(['plot', 'formula', 'animate', 'sim', 'html'])
/** `cx`: how Markdown inside a visual (animate frames) resolves images and links. */
export function VisualBlock({ b, cx }: { b: Visual; cx?: ProseContext }) {
  switch (b.type) {
    case 'plot': return <Plot b={b} />
    case 'formula': return <ExplainedFormula b={b} />
    case 'animate': return <Animate b={b} cx={cx} />
    case 'sim': return <Sim b={b} />
    case 'html': return <HtmlBlock b={b} />
  }
}
