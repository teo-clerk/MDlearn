/** The source numbers an answer cites like [2], once each in order of first appearance; numbers that are not sources are ignored. */
export function citedNumbers(answer: string, count: number): number[] {
  const out: number[] = []
  for (const m of answer.matchAll(/\[(\d{1,2})\]/g)) { const n = Number(m[1]); if (n >= 1 && n <= count && !out.includes(n)) out.push(n) }
  return out
}
