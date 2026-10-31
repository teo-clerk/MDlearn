import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const cli = (...args: string[]) => spawnSync(process.execPath, [resolve(__dirname, '../dist/index.js'), ...args], { encoding: 'utf8' })

describe('mdlearn in a terminal', () => {
  it('says its version', () => {
    const { version } = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')) as { version: string }
    expect(cli('--version').stdout.trim()).toBe(version)
    expect(cli('-v').stdout.trim()).toBe(version)
  })
  it('explains a mistyped option instead of crashing', () => {
    const r = cli('--verson')
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/^mdlearn: Unknown option '--verson'\. Run "mdlearn" for the list\.\n$/)
  })
})
