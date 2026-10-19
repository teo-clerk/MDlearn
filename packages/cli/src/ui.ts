// Terminal presentation helpers: bold only on a real terminal (NO_COLOR respected), wrapping to the
// window, and words next to every symbol so screen readers and copy-paste keep the meaning.
const tty = process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== 'dumb'
export const bold = (s: string): string => (tty ? `\x1b[1m${s}\x1b[22m` : s)
export const dim = (s: string): string => (tty ? `\x1b[2m${s}\x1b[22m` : s)
export const width = (): number => Math.min(process.stdout.columns || 100, 100)

/** Word-wrap each line to the terminal width, keeping its leading indentation. Code fences are left alone. */
export function wrap(text: string, max = width()): string {
  let inCode = false
  return text.split('\n').map((line) => {
    if (/^\s*```/.test(line)) { inCode = !inCode; return line }
    if (inCode || line.length <= max) return line
    const indent = /^\s*(?:[A-Z0-9]{1,2}\s{2}|Step \d+\. |\d+\. |- )?/.exec(line)![0].replace(/\S/g, ' ')
    const out: string[] = []
    let cur = ''
    for (const word of line.split(/(?<=\S)\s+/)) {
      if (cur && (cur + ' ' + word).length > max) { out.push(cur); cur = indent + word.trimStart() } else cur = cur ? `${cur} ${word}` : word
    }
    out.push(cur)
    return out.join('\n')
  }).join('\n')
}
export const out = (s = ''): void => { process.stdout.write(s + '\n') }
export const fail = (s: string): never => { process.stderr.write(`mdlearn: ${s}\n`); process.exit(2) }
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Closest known word, for "did you mean". */
export function closest(word: string, options: string[]): string | null {
  const d = (a: string, b: string) => {
    const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
    for (let j = 1; j <= b.length; j++) m[0][j] = j
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    return m[a.length][b.length]
  }
  const best = options.map((o) => [o, d(word, o)] as const).sort((x, y) => x[1] - y[1])[0]
  return best && best[1] <= 2 ? best[0] : null
}
