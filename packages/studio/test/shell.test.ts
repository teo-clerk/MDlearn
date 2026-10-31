import { describe, it, expect } from 'vitest'
import { shellPath } from '../web/lib/shell'

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
  it('keeps a quote inside a name that needs quoting', () => {
    expect(shellPath(`/tmp/it's $HOME`)).toBe(`'/tmp/it'\\''s $HOME'`)
  })
})
