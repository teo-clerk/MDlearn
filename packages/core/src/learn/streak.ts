// Study streak over a day summary: a day counts when you studied and cleared what was due; a day with
// nothing due and no study is neutral; a day with cards left due breaks the streak.
export interface Day { date: string /* YYYY-MM-DD, local */; due: number; cleared: boolean; studied?: number }
export function reviewStreak(days: Day[]): number {
  let streak = 0
  for (const d of [...days].sort((a, b) => b.date.localeCompare(a.date))) {
    const active = (d.studied ?? 0) > 0
    if (!d.due && !active) continue // neutral
    if (active && (d.cleared || !d.due)) { streak++; continue }
    break
  }
  return streak
}
