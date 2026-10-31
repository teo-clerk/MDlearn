// What the companion shows comes from what is really happening, never from a score: a job, an answer on its way,
// a teach-back, the end of a session. It stays out of the way of questions.
import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { useJobs } from '../api/queries'
import { useStream } from '../state/stream'
import { useUi } from '../state/ui'
import type { Activity } from './sprites'
import { t } from '../i18n'

const AWAY_MS = 5 * 60_000
const WAKE_EVENTS = ['pointerdown', 'keydown', 'wheel'] as const

function useAway() {
  const [away, setAway] = useState(false)
  useEffect(() => {
    let timer: number | undefined
    const wake = () => { setAway(false); clearTimeout(timer); timer = window.setTimeout(() => setAway(true), AWAY_MS) }
    wake()
    for (const e of WAKE_EVENTS) window.addEventListener(e, wake, { passive: true })
    return () => { clearTimeout(timer); for (const e of WAKE_EVENTS) window.removeEventListener(e, wake) }
  }, [])
  return away
}

export const activityLabel = (a: Activity) => ({
  idle: t('Ready'), reading: t('Reading with you'), working: t('Working on your lessons'), searching: t('Thinking'),
  listening: t('Listening'), happy: t('Session done'), asleep: t('Resting'),
}[a])

export function useActivity(ws: string): { activity: Activity; hidden: boolean } {
  const [location] = useLocation()
  const jobs = useJobs(ws)
  const thinking = useStream((s) => Object.keys(s.text).some((id) => !s.done[id]))
  const happy = useUi((u) => u.sessionDone)
  const away = useAway()
  const running = jobs.data?.some((j) => j.status === 'running' || j.status === 'queued')
  const asking = /\/(study|exam)(\/|$)/.test(location)
  const activity: Activity = happy ? 'happy' : running ? 'working' : thinking ? 'searching' : /\/teach(\/|$)/.test(location) ? 'listening' : away ? 'asleep' : /\/(doc|lesson)$/.test(location) ? 'reading' : 'idle'
  return { activity, hidden: asking && !happy }
}
