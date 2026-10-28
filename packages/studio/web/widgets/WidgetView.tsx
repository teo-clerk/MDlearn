// One question, rendered for answering and, once checked, with per-part results.
// The parent owns the draft (so study sessions, lessons and documents share these components).
import type { Checked, PosedWidget, WebAnswer } from '@mdlearn/core'
import type { Draft } from './draft'
import { Quiz } from './Quiz'
import { Gaps } from './Gaps'
import { Order } from './Order'
import { FreeText } from './FreeText'
import { Match } from './Match'
import { Memory } from './Memory'
import { Sort } from './Sort'
import { Speed } from './Speed'

export interface WidgetProps<D extends Draft = Draft> {
  widget: PosedWidget
  draft: D
  setDraft: (d: D) => void
  /** Result of the check (locks the inputs and shows what was right). */
  result?: Checked | null
  /** Focus the first input when the question appears. */
  autoFocus?: boolean
  onSubmit?: () => void
  /** Check one move of a game without recording it (instant feedback; the key stays on the server). */
  probe?: (a: WebAnswer) => Promise<Checked>
}
export function WidgetView(p: WidgetProps) {
  switch (p.widget.type) {
    case 'quiz': return <Quiz {...(p as WidgetProps<Extract<Draft, { type: 'quiz' }>>)} />
    case 'cloze': case 'steps': return <Gaps {...(p as WidgetProps<Extract<Draft, { type: 'gaps' }>>)} />
    case 'order': return <Order {...(p as WidgetProps<Extract<Draft, { type: 'order' }>>)} />
    case 'explain': case 'code': return <FreeText {...(p as WidgetProps<Extract<Draft, { type: 'text' }>>)} />
    case 'match': return p.widget.memory ? <Memory {...(p as WidgetProps<Extract<Draft, { type: 'match' }>>)} /> : <Match {...(p as WidgetProps<Extract<Draft, { type: 'match' }>>)} />
    case 'sort': return <Sort {...(p as WidgetProps<Extract<Draft, { type: 'sort' }>>)} />
    case 'speed': return <Speed {...(p as WidgetProps<Extract<Draft, { type: 'speed' }>>)} />
  }
}
