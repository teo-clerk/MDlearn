import { describe, it, expect } from 'vitest'
import { plainWords, shellPath } from '../web/lib/shell'

describe('a language in a pasted command', () => {
  for (const name of ['Español', 'Português do Brasil', 'العربية', 'हिन्दी', '日本語']) it(`keeps ${name}`, () => expect(plainWords(name)).toBe(name))
  it('keeps nothing a shell could read', () => {
    expect(plainWords('Greek"; x $(y) `z` !\\')).toBe('Greek x y z')
  })
})

describe('a folder in a pasted command', () => {
  it('stays readable when the name is ordinary', () => {
    expect(shellPath('/home/me/Thermo course')).toBe('"/home/me/Thermo course"')
    expect(shellPath('C:\\Users\\me\\Thermo')).toBe('"C:\\Users\\me\\Thermo"')
  })
  for (const name of ['/tmp/$(rm x)', '/tmp/a`b`', '/tmp/a"b', '/tmp/a!b', '/tmp/a\\']) it(`cannot run anything from ${name}`, () => {
    const quoted = shellPath(name)
    expect(quoted.startsWith("'")).toBe(true)
    expect(quoted.slice(1, -1)).toBe(name)
  })
  it('keeps a quote inside a Windows name the way PowerShell reads it', () => {
    expect(shellPath(`C:\\Users\\me\\it's $HOME`)).toBe(`'C:\\Users\\me\\it''s $HOME'`)
  })
  it('keeps a quote inside a name that needs quoting', () => {
    expect(shellPath(`/tmp/it's $HOME`)).toBe(`'/tmp/it'\\''s $HOME'`)
  })
})
