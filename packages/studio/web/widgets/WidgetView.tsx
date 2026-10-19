// One question, rendered for answering and, once checked, with per-part results.
// The parent owns the draft (so study sessions, lessons and documents share these components).
import type { Checked, PosedWidget } from '@mdlearn/core'
import type { Draft } from './draft'
import { Quiz } from './Quiz'
import { Gaps } from './Gaps'
import { Order } from './Order'
import { FreeText } from './FreeText'

export interface WidgetProps<D extends Draft = Draft> {
  widget: PosedWidget
  draft: D
  setDraft: (d: D) => void
  /** Result of the check (locks the inputs and shows what was right). */
  result?: Checked | null
  /** Focus the first input when the question appears. */
  autoFocus?: boolean
  onSubmit?: () => void
}
export function WidgetView(p: WidgetProps) {
  switch (p.widget.type) {
    case 'quiz': return <Quiz {...(p as WidgetProps<Extract<Draft, { type: 'quiz' }>>)} />
    case 'cloze': case 'steps': return <Gaps {...(p as WidgetProps<Extract<Draft, { type: 'gaps' }>>)} />
    case 'order': return <Order {...(p as WidgetProps<Extract<Draft, { type: 'order' }>>)} />
    case 'explain': case 'code': return <FreeText {...(p as WidgetProps<Extract<Draft, { type: 'text' }>>)} />
  }
}
