import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Dict } from '../web/i18n'
import it_ from '../web/i18n/it'
import es from '../web/i18n/es'
import fr from '../web/i18n/fr'
import ca from '../web/i18n/ca'

// Every t('…') and tp(n, '…', '…') in the web app, and every fixed UserError message of the server, must be
// translated in every language, with the same {placeholders}. Keys are string literals by convention, so they
// can be collected from the source.
const web = resolve(__dirname, '../web')
const files = readdirSync(web, { recursive: true }).map(String).filter((f) => /\.tsx?$/.test(f) && !f.startsWith('i18n')).map((f) => join(web, f))
const unquote = (s: string) => s.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n')
const STR = String.raw`(['"\x60])((?:\\.|(?!\1)[^\\])*)\1`
const T = new RegExp(String.raw`(?<![\w.])t\(\s*${STR}`, 'g')
const TP = new RegExp(String.raw`(?<![\w.])tp\(\s*[^,()]+(?:\([^()]*\))?\s*,\s*${STR}\s*,\s*${STR.replace('\\1', '\\3')}`, 'g')
const keys = new Map<string, string>() // key → first file using it
const plurals = new Set<string>() // tp keys: `one|other`
const dynamic: string[] = []
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(T)) { if (m[1] === '`' && m[2].includes('${')) dynamic.push(`${f}: ${m[2]}`); else if (!keys.has(unquote(m[2]))) keys.set(unquote(m[2]), f) }
  for (const m of src.matchAll(TP)) { const k = `${unquote(m[2])}|${unquote(m[4])}`; keys.set(k, f); plurals.add(k) }
}
// The server's fixed error messages are translated by the web client too (api/client.ts).
const server = resolve(__dirname, '../server')
const SERVER_MSG = /UserError\(\s*'[\w-]+',\s*'((?:\\.|[^'\\])*)'\s*\)/g
for (const f of readdirSync(server, { recursive: true }).map(String).filter((f) => f.endsWith('.ts'))) {
  for (const m of readFileSync(join(server, f), 'utf8').matchAll(SERVER_MSG)) if (!keys.has(unquote(m[1]))) keys.set(unquote(m[1]), join(server, f))
}
const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
const texts = (e: Dict[string]) => (typeof e === 'string' ? [e] : Object.values(e).filter((x): x is string => !!x))

export const ALL_KEYS = keys
// t() at module level would run before the dictionary loads (main.tsx imports the app first) and stay English.
const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod', 'ClassPrivateMethod'])
async function moduleLevelCalls(): Promise<string[]> {
  const { parse } = await import('@babel/parser')
  const out: string[] = []
  type N = { type?: string; loc?: { start: { line: number } }; callee?: { type: string; name?: string } } & Record<string, unknown>
  for (const f of files) {
    const visit = (n: N | null, inFn: boolean): void => {
      if (!n || typeof n.type !== 'string') return
      const fn = inFn || FN.has(n.type)
      if (!fn && n.type === 'CallExpression' && n.callee?.type === 'Identifier' && (n.callee.name === 't' || n.callee.name === 'tp')) out.push(`${f}:${n.loc!.start.line}`)
      for (const [k, v] of Object.entries(n)) {
        if (k === 'loc' || k.endsWith('Comments')) continue
        if (Array.isArray(v)) v.forEach((c) => visit(c as N, fn)); else if (v && typeof v === 'object') visit(v as N, fn)
      }
    }
    visit(parse(readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['typescript', ...(f.endsWith('x') ? ['jsx' as const] : [])] }).program as unknown as N, false)
  }
  return out
}

// A sentence typed straight into JSX can't reach a dictionary, so it stays English in every language.
const NAMES = new Set(['Claude Code', 'Ctrl K', '/mdlearn:course how vaccines work, beginner', 'claude plugin marketplace update mdlearn'])
async function plainSentences(): Promise<string[]> {
  const { parse } = await import('@babel/parser')
  const out: string[] = []
  type N = { type?: string; value?: string; loc?: { start: { line: number } } } & Record<string, unknown>
  const visit = (f: string, n: N | null): void => {
    if (!n || typeof n !== 'object') return
    if (n.type === 'JSXText' && /\p{L}{2,}\s+\p{L}{2,}/u.test(n.value ?? '') && !NAMES.has(n.value!.trim())) out.push(`${f}:${n.loc?.start.line}: ${n.value!.trim()}`)
    for (const [k, v] of Object.entries(n)) {
      if (k === 'loc' || k.endsWith('Comments')) continue
      if (Array.isArray(v)) v.forEach((c) => visit(f, c as N)); else if (v && typeof v === 'object') visit(f, v as N)
    }
  }
  for (const f of files.filter((x) => x.endsWith('.tsx'))) visit(f, parse(readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] }).program as unknown as N)
  return out
}

describe('interface translations', () => {
  it('has no sentence outside t()', async () => {
    expect(await plainSentences()).toEqual([])
  })
  it('translates when text renders, never at module load', async () => {
    expect(await moduleLevelCalls(), 'wrap the constant in a function').toEqual([])
  })
  it('finds the strings to translate, all written as plain literals', () => {
    expect(keys.size).toBeGreaterThan(200)
    expect(dynamic, 'a t() key built with ${…}: use {placeholders} instead').toEqual([])
  })
  for (const [name, dict] of [['Italian', it_], ['Spanish', es], ['French', fr], ['Catalan', ca]] as const) {
    it(`${name} translates every string, keeping its placeholders`, () => {
      const d = dict as Dict
      const missing = [...keys.keys()].filter((k) => !d[k] || texts(d[k]).some((x) => !x.trim()))
      expect(missing, `${missing.length} missing`).toEqual([])
      const wrong = [...keys.keys()].filter((k) => {
        const want = holes(plurals.has(k) ? k.split('|')[1] : k).replace(/^n,?|,n$|,n,/g, '')
        return texts(d[k]).some((x) => holes(x).replace(/^n,?|,n$|,n,/g, '') !== want)
      })
      expect(wrong, 'placeholders differ').toEqual([])
      const flat = [...plurals].filter((k) => typeof d[k] !== 'object')
      expect(flat, 'counted strings need plural forms ({ one, other })').toEqual([])
    })
  }
})
