import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, chmodSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { isProgram, resolveClaude } from '../server/ai/claude'

describe('finding Claude Code', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mdl-claude-'))
  const program = join(dir, 'claude-real'), script = join(dir, 'claude-shim'), link = join(dir, 'claude-link')
  writeFileSync(program, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0])); chmodSync(program, 0o755)
  writeFileSync(script, '#!/bin/bash\nmise use -g claude\n'); chmodSync(script, 0o755)
  symlinkSync(program, link)
  it('takes a program, or a link to one (Claude Code\'s installer), never a launcher script', () => {
    expect(isProgram(program)).toBe(true)
    expect(isProgram(link)).toBe(true)
    expect(isProgram(script)).toBe(false)
    expect(isProgram(join(dir, 'missing'))).toBe(false)
  })
  it('the path in the settings comes first; a script there is skipped', () => {
    expect(resolveClaude({ path: link, model: 'sonnet' })).toBe(link)
    expect(resolveClaude({ path: script, model: 'sonnet' })).not.toBe(script)
  })
})
