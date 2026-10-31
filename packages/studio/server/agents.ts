// Any coding assistant can write lessons in a folder, because the folder carries the instructions: AGENTS.md (read by
// Codex, OpenCode, Pi and others) and .agents/skills/ (the Agent Skills location they share). Claude Code gets there
// through CLAUDE.md. Nothing outside the folder changes, and only when someone asks for it. The MCP tools are extra:
// the server is copied to a fixed place, because an installed app's own path can change, and the person adds it.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { inRoot } from '@mdlearn/core/node'
import { UserError } from './workspaces.js'
import type { McpSetup, PreparedFolder } from '../shared/types.js'

const OURS = '<!-- mdlearn folder -->'
export const READ_THE_SKILL = 'To write MDlearn lessons, follow .agents/skills/mdlearn-course/SKILL.md.'

const inside = (root: string, rel: string) => {
  const abs = inRoot(root, rel)
  if (!abs) throw new UserError('path', 'That location is outside this folder.')
  return abs
}

/** Copy the instructions in. The skills follow the app's version; an AGENTS.md or CLAUDE.md someone wrote stays as it is. */
export function prepareFolder(root: string, source: string): PreparedFolder {
  if (!existsSync(join(source, 'AGENTS.md'))) throw new UserError('not-found', 'The integrations are missing; run `npm run build -w @mdlearn/studio`.')
  const skills = inside(root, '.agents/skills')
  mkdirSync(dirname(skills), { recursive: true })
  cpSync(join(source, 'skills'), skills, { recursive: true, force: true })
  const written = ['.agents/skills/'], kept: string[] = []
  const agents = inside(root, 'AGENTS.md')
  if (existsSync(agents) && !readFileSync(agents, 'utf8').startsWith(OURS)) kept.push('AGENTS.md')
  else { writeFileSync(agents, readFileSync(join(source, 'AGENTS.md'))); written.push('AGENTS.md') }
  const claude = inside(root, 'CLAUDE.md')
  if (existsSync(claude)) { if (!readFileSync(claude, 'utf8').includes('@AGENTS.md')) kept.push('CLAUDE.md') }
  else { writeFileSync(claude, '@AGENTS.md\n'); written.push('CLAUDE.md') }
  return { written, kept }
}

/** Copy the one-file MCP server to ~/.mdlearn/mcp and say where it is. */
export function installMcp(plugin: string, home = homedir()): string {
  const from = join(plugin, 'mdlearn', 'mcp'), to = join(home, '.mdlearn', 'mcp')
  if (!existsSync(join(from, 'server.mjs'))) throw new UserError('not-found', 'The integrations are missing; run `npm run build -w @mdlearn/studio`.')
  mkdirSync(to, { recursive: true })
  cpSync(from, to, { recursive: true, force: true })
  return join(to, 'server.mjs')
}

/** How each assistant adds a local MCP server. MDlearn prints these and never edits another app's settings. */
export const mcpCommands = (server: string): McpSetup['commands'] => ({
  codex: `codex mcp add mdlearn -- node "${server}"`,
  pi: `pi mcp add mdlearn -- node "${server}"`,
  opencode: JSON.stringify({ mcp: { mdlearn: { type: 'local', command: ['node', server], enabled: true } } }, null, 2),
})
