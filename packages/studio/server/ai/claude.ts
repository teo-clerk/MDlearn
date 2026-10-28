// Claude Code as the engine for course jobs, through the Agent SDK with an isolated configuration:
// your Claude login (never an API key), only the MDlearn skills and MCP server, no shell, and every
// write checked by the job manager before it happens.
import { query, type HookCallback, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, isAbsolute, resolve, relative, sep } from 'node:path'
import { homedir } from 'node:os'
import { realPath } from '@mdlearn/core/node'
import type { AiEngine, JobEvent, JobSpec, RunContext } from './engine.js'

const require = createRequire(import.meta.url)
const ENV_KEEP = ['HOME', 'PATH', 'USER', 'LANG', 'LC_ALL', 'TERM', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_RUNTIME_DIR', 'TMPDIR']
const APPEND = `You are MDlearn Studio's course author, working inside the user's notes folder.
Use the mdlearn MCP tools to read source documents (doc_outline, get_section) and to check lessons (lint_lesson).
Write only the files the task names. Never edit the user's source documents. Keep answers short; the user sees your tool calls live.`

export interface ClaudeConfig { path?: string; model: string }
/** The real Claude Code binary: settings, then the SDK's bundled one, then mise, then the usual install path. Never the mise shim (it prints to stdout). */
export function resolveClaude(cfg: ClaudeConfig): string | null {
  const candidates: string[] = []
  if (cfg.path) candidates.push(cfg.path)
  try { candidates.push(join(dirname(require.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`)), process.platform === 'win32' ? 'claude.exe' : 'claude')) } catch { /* optional dependency missing */ }
  try { const out = execFileSync('mise', ['which', 'claude'], { encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').pop(); if (out) candidates.push(out) } catch { /* no mise */ }
  candidates.push(join(homedir(), '.local/share/mise/installs/claude/latest/claude'))
  return candidates.find((p) => p && !p.endsWith('/.local/bin/claude') && existsSync(p)) ?? null
}
let cachedStatus: { at: number; value: { available: boolean; version?: string; error?: string } } | null = null
export async function claudeStatus(cfg: ClaudeConfig) {
  if (cachedStatus && Date.now() - cachedStatus.at < 60_000) return cachedStatus.value
  const bin = resolveClaude(cfg)
  let value: { available: boolean; version?: string; error?: string }
  if (!bin) value = { available: false, error: 'Claude Code is not installed (https://claude.com/claude-code).' }
  else {
    try { value = { available: true, version: execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 8000, env: cleanEnv() }).trim().split(' ')[0] } }
    catch { value = { available: false, error: `Claude Code at ${bin} did not start.` } }
  }
  cachedStatus = { at: Date.now(), value }
  return value
}
function cleanEnv(): Record<string, string> {
  return Object.fromEntries(ENV_KEEP.filter((k) => process.env[k]).map((k) => [k, process.env[k]!]))
}
const studioDir = () => {
  for (let d = import.meta.dirname; ; d = dirname(d)) {
    if (existsSync(join(d, 'package.json')) && existsSync(join(d, 'vite.config.ts'))) return d
    if (dirname(d) === d) return resolve(import.meta.dirname, '..', '..')
  }
}

// The mdlearn tools a job may call: reading the folder and checking lessons. Not the tutor's check_answer or
// record_review, which write study history (notes in the folder must not be able to forge it).
const MDLEARN_TOOLS = ['curriculum_status', 'doc_outline', 'get_section', 'search_curriculum', 'plan_lessons', 'lint_lesson', 'read_lesson', 'authoring_guide']
export class ClaudeEngine implements AiEngine {
  name = 'Claude Code'
  constructor(private cfg: ClaudeConfig) {}
  async run(job: JobSpec, ctx: RunContext) {
    const bin = resolveClaude(this.cfg)
    if (!bin) throw new Error('Claude Code is not installed or could not be found.')
    const plugin = join(studioDir(), 'dist', 'plugin')
    if (!existsSync(join(plugin, '.claude-plugin', 'plugin.json'))) throw new Error('The MDlearn skills plugin is missing; run `npm run build -w @mdlearn/studio`.')
    const mcpEntry = join(dirname(require.resolve('@mdlearn/mcp/package.json')), 'dist', 'index.js')
    const rootReal = realPath(job.root)
    const inside = (p: string, base: string) => { const r = relative(base, p); return r === '' || (!r.startsWith(`..${sep}`) && r !== '..' && !isAbsolute(r)) }
    const writeGuard: HookCallback = async (input) => {
      const fp = (input as { tool_input?: { file_path?: string } }).tool_input?.file_path ?? ''
      const abs = isAbsolute(fp) ? fp : resolve(job.root, fp)
      const verdict = ctx.beforeWrite(abs)
      return verdict === 'allow' ? {} : { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: verdict } }
    }
    const readGuard: HookCallback = async (input) => {
      const ti = (input as { tool_input?: { file_path?: string; path?: string } }).tool_input ?? {}
      const p = ti.file_path ?? ti.path
      if (!p) return {}
      const abs = realPath(isAbsolute(p) ? p : resolve(job.root, p))
      return inside(abs, rootReal) || inside(abs, realPath(plugin)) ? {} : { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'Only files inside this folder can be read.' } }
    }
    const abort = new AbortController()
    ctx.signal.addEventListener('abort', () => abort.abort(), { once: true })
    const q = query({
      prompt: job.prompt,
      options: {
        cwd: job.root, pathToClaudeCodeExecutable: bin, env: cleanEnv(), settingSources: [],
        plugins: [{ type: 'local', path: plugin, skipMcpDiscovery: true }],
        mcpServers: { mdlearn: { type: 'stdio', command: process.execPath, args: [mcpEntry], env: { MDLEARN_ROOT: job.root, MDLEARN_READONLY: '1' } } },
        strictMcpConfig: true,
        systemPrompt: { type: 'preset', preset: 'claude_code', append: APPEND },
        tools: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'MultiEdit', 'Skill', 'TodoWrite'],
        allowedTools: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'MultiEdit', 'Skill', 'TodoWrite', ...MDLEARN_TOOLS.map((t) => `mcp__mdlearn__${t}`)],
        disallowedTools: ['Bash', 'WebFetch', 'WebSearch', 'Task', 'NotebookEdit'],
        permissionMode: 'dontAsk',
        hooks: { PreToolUse: [{ matcher: 'Write|Edit|MultiEdit', hooks: [writeGuard] }, { matcher: 'Read|Glob|Grep', hooks: [readGuard] }] },
        includePartialMessages: false,
        abortController: abort,
        maxTurns: job.maxTurns,
        model: job.model ?? this.cfg.model,
        ...(job.resume ? { resume: job.resume } : {}),
      },
    })
    let summary = '', ok = false, sessionId: string | undefined
    for await (const m of q) {
      for (const e of toEvents(m, job.root)) ctx.emit(e)
      if (m.type === 'system' && m.subtype === 'init') {
        sessionId = m.session_id
        if (!m.mcp_servers.some((s) => s.name === 'mdlearn' && s.status === 'connected')) throw new Error('The mdlearn tools did not start inside Claude Code.')
      }
      if (m.type === 'result') { ok = m.subtype === 'success' && !m.is_error; summary = 'result' in m ? String(m.result) : (m.errors ?? []).join('; ') }
    }
    return { ok, summary, ...(sessionId ? { sessionId } : {}) }
  }
}

/** SDK messages → what the user sees in the job log. */
export function toEvents(m: SDKMessage, root: string): JobEvent[] {
  const rel = (p?: string) => (p ? (isAbsolute(p) ? relative(root, p) : p).split(sep).join('/') : undefined)
  switch (m.type) {
    case 'system':
      if (m.subtype === 'init') return [{ kind: 'session', sessionId: m.session_id }, { kind: 'status', status: 'running', message: `Claude Code ${m.claude_code_version} · ${m.model}` }]
      return []
    case 'assistant': {
      const out: JobEvent[] = []
      for (const b of m.message.content) {
        if (b.type === 'text' && b.text.trim()) out.push({ kind: 'text', text: b.text.trim() })
        if (b.type === 'tool_use') {
          const input = b.input as Record<string, unknown>
          const path = rel((input.file_path ?? input.path) as string | undefined)
          const label = toolLabel(b.name, input, path)
          if (label) out.push({ kind: 'tool', label, ...(path ? { path } : {}) })
        }
      }
      return out
    }
    case 'result':
      return [{ kind: 'usage', turns: m.num_turns, ...(typeof m.total_cost_usd === 'number' ? { costUsd: m.total_cost_usd } : {}), durationMs: m.duration_ms },
        ...(m.permission_denials ?? []).map((d) => ({ kind: 'denied' as const, tool: d.tool_name, reason: 'not allowed' }))]
    case 'rate_limit_event': {
      const info = m.rate_limit_info as { status?: string; rateLimitType?: string; utilization?: number }
      return info.status && info.status !== 'allowed' ? [{ kind: 'limit', message: `Claude usage ${info.status.replace('_', ' ')}${info.rateLimitType ? ` (${info.rateLimitType.replace('_', '-')} window)` : ''}` }] : []
    }
    default: return []
  }
}
function toolLabel(name: string, input: Record<string, unknown>, path?: string): string | null {
  switch (name) {
    case 'Read': return `Reading ${path}`
    case 'Write': return `Writing ${path}`
    case 'Edit': case 'MultiEdit': return `Editing ${path}`
    case 'Glob': case 'Grep': return `Searching ${String(input.pattern ?? '')}`
    case 'Skill': return `Using the ${String(input.skill ?? '').replace(/^mdlearn:/, '')} skill`
    case 'TodoWrite': return null
    case 'mcp__mdlearn__get_section': return `Reading §${String(input.section ?? '')} of ${String(input.doc ?? '')}`
    case 'mcp__mdlearn__doc_outline': return `Reading the outline of ${String(input.doc ?? '')}`
    case 'mcp__mdlearn__lint_lesson': return `Checking ${String(input.path ?? '')}`
    case 'mcp__mdlearn__plan_lessons': return `Planning lessons for ${String(input.doc ?? '')}`
    default: return name.startsWith('mcp__mdlearn__') ? name.replace('mcp__mdlearn__', '').replace(/_/g, ' ') : name
  }
}
