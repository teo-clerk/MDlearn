// A formula whose terms light up with their meaning: hover or focus a term (in the formula or in the
// list) and both highlight. With values, it also computes live.
import { useMemo, useState } from 'react'
import { compileExpr } from '@mdlearn/core/eval'
import type { Visual } from '@mdlearn/core'
import { Inline } from '../prose/Prose'
import { Tex } from '../prose/Tex'
import { Frame } from './Plot'
import { ParamSliders, initialValues, type Values } from './ParamSliders'
import { fmt } from './format'

type FormulaBlock = Extract<Visual, { type: 'formula' }>
export function ExplainedFormula({ b }: { b: FormulaBlock }) {
  const [active, setActive] = useState<number | null>(null)
  const [values, setValues] = useState<Values>(() => initialValues(b.params))
  const live = useMemo(() => (b.live ? compileExpr(b.live.expr) : null), [b.live])
  const termAt = (el: EventTarget | null) => {
    const hit = (el as HTMLElement | null)?.closest?.('[class*="mdl-t-"]')
    const m = hit && /mdl-t-(\d+)/.exec(hit.getAttribute('class') ?? '')
    return m ? Number(m[1]) : null
  }
  return (
    <Frame b={b}>
      <div className="formula-explained" data-active={active ?? undefined}
        onPointerOver={(e) => setActive(termAt(e.target))} onPointerLeave={() => setActive(null)}>
        <Tex tex={b.marked} display eager />
      </div>
      <ul className="mt-2 flex flex-col gap-1.5 font-ui text-[14px]">
        {b.terms.map((t) => (
          <li key={t.i}>
            <button type="button" onMouseEnter={() => setActive(t.i)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(t.i)} onBlur={() => setActive(null)}
              className={`flex w-full items-baseline gap-3 rounded-[6px] px-2 py-1 text-left ${active === t.i ? 'bg-hover' : ''}`}>
              <span className="w-24 shrink-0"><Tex tex={t.tex} eager /></span>
              <span className="text-text/85"><Inline nodes={t.label} /></span>
            </button>
          </li>
        ))}
      </ul>
      {live && (
        <>
          <ParamSliders params={b.params} values={values} onChange={setValues} />
          <p className="mt-3 font-ui text-[14px]">{b.live!.lhs ? <Tex tex={b.live!.lhs} eager /> : 'Result'} = <span className="tabular font-semibold">{fmt(live(values), 4)}</span></p>
        </>
      )}
    </Frame>
  )
}
