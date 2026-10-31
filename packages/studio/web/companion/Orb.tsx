// Loaded only for someone who chose the orb. The library draws a static frame under reduced motion, and follows the theme.
import { ThinkingOrb, type OrbState } from 'thinking-orbs'
import type { Activity } from './sprites'

const STATES: Record<Activity, OrbState> = { idle: 'breathing', reading: 'breathing', working: 'working', searching: 'searching', listening: 'listening', happy: 'shaping', asleep: 'breathing' }
export default function Orb({ activity }: { activity: Activity }) {
  return <ThinkingOrb state={STATES[activity]} size={20} paused={activity === 'asleep'} aria-hidden />
}
