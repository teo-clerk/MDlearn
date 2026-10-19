// Sliders for a visual's parameters (logarithmic where declared), each with its symbol, value and unit.
import { Inline } from '../prose/Prose'
import { Tex } from '../prose/Tex'
import { MiniMarkdown } from '../prose/MiniMarkdown'
import type { Param } from '@mdlearn/core'
import { fmt } from './format'

export type Values = Record<string, number>
export const initialValues = (params: Param[]): Values => Object.fromEntries(params.map((p) => [p.id, p.value ?? p.min ?? 0]))
const STEPS = 400
export function ParamSliders({ params, values, onChange, exclude }: { params: Param[]; values: Values; onChange: (v: Values) => void; exclude?: string }) {
  const sliders = params.filter((p) => p.min !== undefined && p.max !== undefined && p.id !== exclude)
  if (!sliders.length) return null
  return (
    <div className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
      {sliders.map((p) => {
        const min = p.min!, max = p.max!
        const toPos = (v: number) => (p.log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min)) * STEPS
        const fromPos = (pos: number) => {
          const t = pos / STEPS
          const v = p.log ? min * (max / min) ** t : min + (max - min) * t
          return p.step ? Math.round(v / p.step) * p.step : v
        }
        return (
          <label key={p.id} className="block font-ui text-[13px]">
            <span className="flex items-baseline gap-1.5">
              <Tex tex={p.sym} eager />
              <span className="min-w-0 flex-1 truncate text-muted"><Inline nodes={p.label} /></span>
              <span className="tabular font-medium">{fmt(values[p.id])}</span>
              {p.unit && <span className="text-muted"><MiniMarkdown text={p.unit} /></span>}
            </span>
            <input type="range" min={0} max={STEPS} step={p.step && !p.log ? (p.step / (max - min)) * STEPS : 1} value={toPos(values[p.id])}
              onChange={(e) => onChange({ ...values, [p.id]: fromPos(Number(e.target.value)) })}
              aria-valuetext={`${fmt(values[p.id])}${p.unit ? ` ${p.unit.replace(/\$/g, '')}` : ''}`}
              className="mt-1 w-full accent-[var(--text)]" />
          </label>
        )
      })}
    </div>
  )
}
