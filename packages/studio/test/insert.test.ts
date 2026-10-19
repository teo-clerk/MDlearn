import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { insertAfterQuote } from '../server/insert'

const file = (text: string) => { const f = join(mkdtempSync(join(tmpdir(), 'mdl-ins-')), 'doc.md'); writeFileSync(f, text); return f }
describe('inserting a block after a passage', () => {
  it('goes after the paragraph that holds the quote, even when the quote spans math', () => {
    const f = file('# T\n\nFirst paragraph.\n\nThe $R^{-4}$ is now visible: one $R^{-2}$ going out,\none coming back.\n\nLast.\n')
    const r = insertAfterQuote(f, 'The R−4 is now visible: one R−2 going out, one coming back.', ':::plot\n$$y=x$$\n- $x$ in [0,1]\n:::')
    const out = readFileSync(f, 'utf8')
    expect(out).toBe('# T\n\nFirst paragraph.\n\nThe $R^{-4}$ is now visible: one $R^{-2}$ going out,\none coming back.\n\n:::plot\n$$y=x$$\n- $x$ in [0,1]\n:::\n\nLast.\n')
    expect(r.line).toBe(8)
  })
  it('refuses when the file changed since it was loaded', () => {
    const f = file('# T\n\nText here.\n')
    expect(() => insertAfterQuote(f, 'Text here.', 'x', statSync(f).mtimeMs - 5000)).toThrow(/changed/)
  })
  it('refuses when the passage is not found', () => {
    expect(() => insertAfterQuote(file('# T\n'), 'nowhere to be seen', 'x')).toThrow(/not be found/)
  })
})
