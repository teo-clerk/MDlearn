// What GraphCanvas needs from a drawing engine; graphEngine2d (force-graph) and graphEngine3d (3d-force-graph,
// loaded only when you switch to 3D) both provide it.
import type { GraphData, GraphView } from './graph'
import type { GraphColors } from './graphColors'

/** Read on every frame, so a change shows after `restyle()` without rebuilding the drawing. */
export interface EngineState { view: GraphView; colors: GraphColors; reduced: boolean }
export interface EngineEvents {
  onHover(id: string | null): void
  /** `touch`: a tap, which chooses the node instead of opening it (there is no hover to preview it first). */
  onClick(id: string, touch: boolean): void
  onBackground(): void
}
export interface Engine {
  /** New nodes and links; nodes already drawn keep their place. The view is fitted again once it settles. */
  setData(data: GraphData): void
  restyle(): void
  resize(width: number, height: number): void
  center(id: string): void
  fit(): void
  destroy(): void
}
export type Mount = (host: HTMLElement, state: { readonly current: EngineState }, events: EngineEvents) => Engine

/** With reduced motion the layout is worked out before the first frame and then holds still; otherwise it settles
 * visibly for a few seconds. Applied on each data change, so a change of the setting takes effect then. */
export function layoutMotion(fg: { warmupTicks(n: number): unknown; cooldownTicks(n: number): unknown; cooldownTime(ms: number): unknown }, state: EngineState) {
  if (state.reduced) { fg.warmupTicks(200); fg.cooldownTicks(0) } else { fg.warmupTicks(40); fg.cooldownTicks(Infinity); fg.cooldownTime(3000) }
}
/** A tap rather than a mouse click: it chooses the node instead of opening it. */
export const isTap = (ev: MouseEvent) => { const type = (ev as PointerEvent).pointerType; return type === 'touch' || type === 'pen' }
/** Durations for camera moves: none when the reader asked for reduced motion. */
export const moveMs = (state: EngineState, ms: number) => (state.reduced ? 0 : ms)
export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
