// Put items in order: drag them, or use the arrow buttons / Alt+↑↓ on a focused item.
import { useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import { Prose } from '../prose/Prose'
import type { Draft } from './draft'
import type { WidgetProps } from './WidgetView'

export function Order({ widget, draft, setDraft, result }: WidgetProps<Extract<Draft, { type: 'order' }>>) {
  const [drag, setDrag] = useState<number | null>(null)
  if (widget.type !== 'order') return null
  const locked = !!result
  const correctPos = result?.parts?.order // correct order as display indices
  const move = (from: number, to: number) => {
    if (locked || to < 0 || to >= draft.order.length || from === to) return
    const next = [...draft.order]
    const [x] = next.splice(from, 1)
    next.splice(to, 0, x)
    setDraft({ type: 'order', order: next })
  }
  return (
    <div>
      <div className="read"><Prose nodes={widget.prompt} /></div>
      <ol className="mt-3 flex flex-col gap-1.5" aria-label="Items to put in order">
        {draft.order.map((itemIdx, pos) => {
          const right = correctPos ? correctPos[pos] === itemIdx : null
          return (
            <li key={itemIdx} draggable={!locked}
              onDragStart={() => setDrag(pos)} onDragOver={(e) => { e.preventDefault(); if (drag !== null && drag !== pos) { move(drag, pos); setDrag(pos) } }} onDragEnd={() => setDrag(null)}
              tabIndex={locked ? -1 : 0}
              onKeyDown={(e) => { if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); move(pos, pos - 1) } if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); move(pos, pos + 1) } }}
              className={`flex items-start gap-2 rounded-[7px] border px-2 py-2 ${right === true ? 'border-good bg-good-soft' : right === false ? 'border-bad bg-bad-soft' : drag === pos ? 'border-text bg-hover' : 'border-border bg-raised'}`}>
              {!locked && <GripVertical className="mt-1 size-4 shrink-0 cursor-grab text-subtle" aria-hidden />}
              <span className="mt-[3px] w-5 shrink-0 text-right tabular font-ui text-[12px] font-semibold text-muted">{pos + 1}</span>
              <div className="read min-w-0 flex-1 text-[16px] leading-[1.55] [&_p]:!m-0"><Prose nodes={widget.items[itemIdx]} /></div>
              {!locked && (
                <span className="flex shrink-0 flex-col">
                  <button type="button" onClick={() => move(pos, pos - 1)} disabled={pos === 0} aria-label="Move up" className="rounded p-0.5 text-muted hover:bg-hover disabled:opacity-30 cursor-pointer"><ArrowUp className="size-3.5" /></button>
                  <button type="button" onClick={() => move(pos, pos + 1)} disabled={pos === draft.order.length - 1} aria-label="Move down" className="rounded p-0.5 text-muted hover:bg-hover disabled:opacity-30 cursor-pointer"><ArrowDown className="size-3.5" /></button>
                </span>
              )}
              {right === false && correctPos && <span className="shrink-0 self-center font-ui text-[12px] text-muted">belongs at {correctPos.indexOf(itemIdx) + 1}</span>}
            </li>
          )
        })}
      </ol>
      {!locked && <p className="mt-2 text-[12px] text-muted">Drag the items, or focus one and press Alt+↑ / Alt+↓.</p>}
    </div>
  )
}
