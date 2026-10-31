import { FRAMES, GRID, toPath, type Activity } from './sprites'

export function PixelPet({ activity }: { activity: Activity }) {
  const { frames, beat } = FRAMES[activity]
  return (
    <svg className={`pet pet-${beat}`} viewBox={`0 0 ${GRID} ${GRID}`} width={24} height={24} shapeRendering="crispEdges" fill="currentColor" aria-hidden>
      <path className="pet-a" d={toPath(frames[0])} />
      <path className="pet-b" d={toPath(frames[1])} />
    </svg>
  )
}
