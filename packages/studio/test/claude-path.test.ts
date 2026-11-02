import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { claudeStatus, cleanEnv, isProgram, loginFailed, resolveClaude, skillsPlugin, toolsFailed } from '../server/ai/claude'

describe('finding Claude Code', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mdl-claude-'))
  const program = join(dir, 'claude-real'), script = join(dir, 'claude-shim'), link = join(dir, 'claude-link')
  writeFileSync(program, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0])); chmodSync(program, 0o755)
  writeFileSync(script, '#!/bin/bash\nmise use -g claude\n'); chmodSync(script, 0o755)
  symlinkSync(program, link)
  const notRunnable = join(dir, 'claude-plain'); writeFileSync(notRunnable, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0])); chmodSync(notRunnable, 0o644)
  it('takes a program, or a link to one (Claude Code\'s installer), never a launcher script', () => {
    expect(isProgram(program)).toBe(true)
    expect(isProgram(link)).toBe(true)
    expect(isProgram(script)).toBe(false)
    expect(isProgram(join(dir, 'missing'))).toBe(false)
  })
  it.skipIf(process.platform === 'win32')('skips a file that may not be run', () => {
    expect(isProgram(notRunnable)).toBe(false)
  })
  it('the path in the settings comes first; a script there is skipped', () => {
    expect(resolveClaude({ path: link, model: 'sonnet' })).toBe(link)
    expect(resolveClaude({ path: script, model: 'sonnet' })).not.toBe(script)
  })
})

describe('Claude Code on Windows', () => {
  const windows = { USERPROFILE: 'C:\\Users\\me', APPDATA: 'C:\\Users\\me\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local', SystemRoot: 'C:\\Windows', ComSpec: 'C:\\Windows\\system32\\cmd.exe', PATHEXT: '.EXE;.CMD', TEMP: 'C:\\Temp', TMP: 'C:\\Temp' }
  it('keeps what it needs to find its login and to reach the network', () => {
    expect(cleanEnv({ ...windows, PATH: 'C:\\bin' })).toEqual({ ...windows, PATH: 'C:\\bin' })
  })
  it('leaves out everything else, such as another program\'s secrets', () => {
    expect(cleanEnv({ ...windows, GITHUB_TOKEN: 'x', AWS_SECRET_ACCESS_KEY: 'y' })).toEqual(windows)
  })
  it('keeps a Claude Code profile in its own folder', () => {
    expect(cleanEnv({ CLAUDE_CONFIG_DIR: '/tmp/profile' })).toEqual({ CLAUDE_CONFIG_DIR: '/tmp/profile' })
  })
  it('finds the program behind the launcher npm leaves in the PATH', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mdl-npm-'))
    const bin = join(dir, 'node_modules/@anthropic-ai/claude-code/bin')
    mkdirSync(bin, { recursive: true })
    writeFileSync(join(dir, 'claude.cmd'), '@ECHO off\r\nnode %*\r\n')
    writeFileSync(join(bin, 'claude.exe'), Buffer.from([0x4d, 0x5a, 0, 0])); chmodSync(join(bin, 'claude.exe'), 0o755)
    expect(resolveClaude({ model: 'sonnet' }, { platform: 'win32', env: { PATH: dir, HOME: dir }, bundled: false })).toBe(join(bin, 'claude.exe'))
  })
  it('never takes the launcher itself', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mdl-npm-'))
    writeFileSync(join(dir, 'claude.cmd'), '@ECHO off\r\n')
    expect(resolveClaude({ model: 'sonnet' }, { platform: 'win32', env: { PATH: dir, HOME: dir }, bundled: false })).toBeNull()
  })
})

describe('the skills an AI job needs', () => {
  /** A package as npm and the desktop app ship it: compiled under dist, and no vite.config.ts. */
  function shipped() {
    const pkg = join(mkdtempSync(join(tmpdir(), 'mdl-ship-')), 'node_modules/@mdlearn/studio')
    mkdirSync(join(pkg, 'dist/server/ai'), { recursive: true })
    mkdirSync(join(pkg, 'dist/plugin/.claude-plugin'), { recursive: true })
    writeFileSync(join(pkg, 'package.json'), '{"name":"@mdlearn/studio"}')
    writeFileSync(join(pkg, 'dist/plugin/.claude-plugin/plugin.json'), '{}')
    return pkg
  }
  it('are found in a package installed from npm or inside the desktop app', () => {
    const pkg = shipped()
    expect(skillsPlugin(join(pkg, 'dist/server/ai'))).toBe(join(pkg, 'dist/plugin'))
  })
  it('are found from this repository too', () => {
    expect(skillsPlugin()).toMatch(/studio[\\/]dist[\\/]plugin$/)
  })
  it('say so when they are really missing', () => {
    expect(skillsPlugin(mkdtempSync(join(tmpdir(), 'mdl-none-')))).toBeNull()
  })
})

describe('when Claude Code cannot do the job', () => {
  it('knows the words of a missing login', () => {
    expect(loginFailed('Not logged in · Please run /login')).toBe(true)
    expect(loginFailed('Invalid API key · Fix external API key')).toBe(true)
    expect(loginFailed('Claude Code returned an error result: Not logged in · Please run /login')).toBe(true)
    expect(loginFailed('Done: wrote 13 lessons about logging in to a server.')).toBe(false)
  })
  it('lets MDlearn\'s tools finish starting on a slow computer', () => {
    expect(toolsFailed([{ name: 'mdlearn', status: 'pending' }])).toBe(false)
    expect(toolsFailed([{ name: 'mdlearn', status: 'connected' }])).toBe(false)
  })
  it('stops when they failed, or never came', () => {
    expect(toolsFailed([{ name: 'mdlearn', status: 'failed' }])).toBe(true)
    expect(toolsFailed([])).toBe(true)
  })
})

// CI on Windows installs the real Claude Code with npm, with no login: it must be found, start, and answer that it has none.
describe.runIf(process.env.MDLEARN_REAL_CLAUDE)('the real Claude Code, installed with npm', () => {
  it('is found, starts with the clean environment, and can tell it has no login', async () => {
    const bin = resolveClaude({ model: 'sonnet' }, { bundled: false }) // the desktop app ships without the SDK's own copy
    expect(bin).toMatch(/claude-code[\\/]bin[\\/]claude\.exe$/)
    expect(await claudeStatus({ model: 'sonnet' })).toMatchObject({ available: true })
    const reply = spawnSync(bin!, ['-p', 'say ok', '--output-format', 'json'], { encoding: 'utf8', timeout: 60_000, env: cleanEnv() })
    expect(loginFailed(JSON.parse(reply.stdout).result)).toBe(true)
  }, 120_000)
})
