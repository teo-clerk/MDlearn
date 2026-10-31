import { describe, it, expect } from 'vitest'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { workspace, sourceDocs } from '@mdlearn/core/node'
import { installMcp, mcpCommands, prepareFolder } from '../server/agents'

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
function source() {
  const dir = tmp('mdl-agent-src-')
  mkdirSync(join(dir, 'skills/mdlearn-course'), { recursive: true })
  writeFileSync(join(dir, 'AGENTS.md'), '<!-- mdlearn folder -->\n# Course\n')
  writeFileSync(join(dir, 'skills/mdlearn-course/SKILL.md'), '---\nname: mdlearn-course\ndescription: x\n---\n')
  return dir
}

describe('getting a folder ready for any assistant', () => {
  it('does not write through a link left in the skills folder', () => {
    const root = tmp('mdl-agents-'), outside = tmp('mdl-outside-')
    writeFileSync(join(outside, 'mine.txt'), 'keep')
    mkdirSync(join(root, '.agents/skills'), { recursive: true })
    symlinkSync(outside, join(root, '.agents/skills/mdlearn-course'))
    prepareFolder(root, source())
    expect(readdirSync(outside)).toEqual(['mine.txt'])
    expect(lstatSync(join(root, '.agents/skills/mdlearn-course')).isSymbolicLink()).toBe(false)
  })
  it('writes the instructions and the skills', () => {
    const root = tmp('mdl-agent-')
    expect(prepareFolder(root, source())).toEqual({ written: ['.agents/skills/', 'AGENTS.md', 'CLAUDE.md'], kept: [] })
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toContain('# Course')
    expect(readFileSync(join(root, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\n')
    expect(existsSync(join(root, '.agents/skills/mdlearn-course/SKILL.md'))).toBe(true)
  })
  it('never replaces instructions someone wrote', () => {
    const root = tmp('mdl-agent-')
    writeFileSync(join(root, 'AGENTS.md'), '# My own rules\n')
    writeFileSync(join(root, 'CLAUDE.md'), '# Mine too\n')
    expect(prepareFolder(root, source()).kept).toEqual(['AGENTS.md', 'CLAUDE.md'])
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toBe('# My own rules\n')
    expect(readFileSync(join(root, 'CLAUDE.md'), 'utf8')).toBe('# Mine too\n')
  })
  it('updates its own AGENTS.md when run again', () => {
    const root = tmp('mdl-agent-'), from = source()
    prepareFolder(root, from)
    writeFileSync(join(from, 'AGENTS.md'), '<!-- mdlearn folder -->\n# Newer\n')
    expect(prepareFolder(root, from).kept).toEqual([])
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toContain('# Newer')
  })
  it('refuses a link that leads out of the folder', () => {
    const root = tmp('mdl-agent-'), outside = tmp('mdl-outside-')
    symlinkSync(outside, join(root, '.agents'))
    expect(() => prepareFolder(root, source())).toThrow(/outside this folder/)
    expect(existsSync(join(outside, 'skills'))).toBe(false)
  })
  it('keeps assistant instructions out of the notes', () => {
    const root = tmp('mdl-agent-')
    prepareFolder(root, source())
    writeFileSync(join(root, 'notes.md'), '# Notes\n')
    mkdirSync(join(root, 'week1'))
    writeFileSync(join(root, 'week1/CLAUDE.md'), '# A note that happens to have this name\n')
    expect(sourceDocs(workspace(root)).map((p) => p.slice(root.length + 1))).toEqual(['notes.md', 'week1/CLAUDE.md'])
  })
})

describe('the MCP tools for other assistants', () => {
  it('copies the server to a fixed place and gives each assistant its command', () => {
    const plugin = tmp('mdl-plugin-'), home = tmp('mdl-home-')
    mkdirSync(join(plugin, 'mdlearn/mcp/guide'), { recursive: true })
    writeFileSync(join(plugin, 'mdlearn/mcp/server.mjs'), '// server')
    writeFileSync(join(plugin, 'mdlearn/mcp/guide/method.md'), 'guide')
    const server = installMcp(plugin, home)
    expect(server).toBe(join(home, '.mdlearn/mcp/server.mjs'))
    expect(existsSync(join(home, '.mdlearn/mcp/guide/method.md'))).toBe(true)
    const c = mcpCommands('/h/.mdlearn/mcp/server.mjs')
    expect(c.codex).toBe('codex mcp add mdlearn -- node "/h/.mdlearn/mcp/server.mjs"')
    expect(c.pi).toBe('pi mcp add mdlearn -- node "/h/.mdlearn/mcp/server.mjs"')
    expect(JSON.parse(c.opencode).mcp.mdlearn).toEqual({ type: 'local', command: ['node', '/h/.mdlearn/mcp/server.mjs'], enabled: true })
  })
})
