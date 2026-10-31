// The pixel companion: a 12×12 one-colour creature with two frames for each thing it can be doing. Plain data, so
// it stays small and can't do anything but show what the app is really doing.
export type Activity = 'idle' | 'reading' | 'working' | 'searching' | 'listening' | 'happy' | 'asleep'
type Cell = readonly [number, number]
export const GRID = 12

const BODY = ['...######...', '..########..', '.##########.', '.##########.', '.##########.', '.##########.', '.##########.', '.##########.', '.##.####.##.']
const BODY_TOP = 2 // the rows above it hold what floats over its head
const EYES = {
  open: [[3, 5], [3, 6], [8, 5], [8, 6]],
  closed: [[3, 6], [4, 6], [7, 6], [8, 6]],
  left: [[2, 5], [2, 6], [7, 5], [7, 6]],
  right: [[4, 5], [4, 6], [9, 5], [9, 6]],
  down: [[3, 6], [3, 7], [8, 6], [8, 7]],
  glad: [[2, 6], [3, 5], [4, 6], [7, 6], [8, 5], [9, 6]],
} satisfies Record<string, Cell[]>

/** Cells of one frame: the body less its eyes, raised a row if `lift`, plus anything floating beside it. */
function frame(eyes: keyof typeof EYES, { lift = 0, extra = [] }: { lift?: number; extra?: Cell[] } = {}): Cell[] {
  const holes = new Set(EYES[eyes].map(([x, y]) => `${x},${y}`))
  const body = BODY.flatMap((row, i) => [...row].flatMap((c, x): Cell[] => {
    const y = i + BODY_TOP
    return c === '#' && !holes.has(`${x},${y}`) ? [[x, y - lift]] : []
  }))
  return [...body, ...extra]
}

const SPARK: Cell[][] = [[[10, 0], [9, 1], [11, 1]], [[1, 0], [0, 1], [2, 1]]]
const SNORE: Cell[][] = [[[9, 1], [10, 1]], [[10, 0], [11, 0]]]
const EARS: Cell[][] = [[[2, 0], [2, 1], [9, 0], [9, 1]], [[2, 1], [9, 1]]]

export const FRAMES: Record<Activity, { frames: [Cell[], Cell[]]; beat: 'blink' | 'steady' | 'slow' }> = {
  idle: { frames: [frame('open'), frame('closed')], beat: 'blink' },
  reading: { frames: [frame('down'), frame('closed')], beat: 'blink' },
  working: { frames: [frame('open', { extra: SPARK[0] }), frame('open', { lift: 1, extra: SPARK[1] })], beat: 'steady' },
  searching: { frames: [frame('left'), frame('right')], beat: 'steady' },
  listening: { frames: [frame('open', { extra: EARS[0] }), frame('open', { extra: EARS[1] })], beat: 'slow' },
  happy: { frames: [frame('glad'), frame('glad', { lift: 1 })], beat: 'steady' },
  asleep: { frames: [frame('closed', { extra: SNORE[0] }), frame('closed', { extra: SNORE[1] })], beat: 'slow' },
}
export const toPath = (cells: readonly Cell[]) => cells.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join('')
