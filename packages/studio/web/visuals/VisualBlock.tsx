import type { Visual } from '@mdlearn/core'
import { Plot } from './Plot'
import { ExplainedFormula } from './ExplainedFormula'
import { Animate } from './Animate'
import { Sim } from './Sim'
export const VISUAL_TYPES = new Set(['plot', 'formula', 'animate', 'sim'])
export function VisualBlock({ b }: { b: Visual }) {
  switch (b.type) {
    case 'plot': return <Plot b={b} />
    case 'formula': return <ExplainedFormula b={b} />
    case 'animate': return <Animate b={b} />
    case 'sim': return <Sim b={b} />
  }
}
