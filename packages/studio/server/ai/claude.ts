// Claude Code as the engine for course jobs, through the Agent SDK with an isolated configuration:
// the person's own Claude Code login, only the MDlearn skills and MCP server, no shell, and every
// write checked by the job manager before it happens.
import { query, type HookCallback, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { execFileSync } from 'node:child_process'
import { accessSync, closeSync, constants, existsSync, openSync, readSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter, dirname, join, isAbsolute, resolve, relative, sep } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { realPath } from '@mdlearn/core/node'
import { UserError } from '../workspaces.js'
import type { AiEngine, JobEvent, JobSpec, RunContext } from './engine.js'

const require = createRequire(import.meta.url)
/** In the desktop app this Node is Electron's: it runs the MCP server as Node only when told to. */
const AS_NODE: Record<string, string> = process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}
const ENV_KEEP = ['ANTHROPIC_API_KEY', 'CLAUDE_CONFIG_DIR', 'HOME', 'PATH', 'USER', 'LANG', 'LC_ALL', 'TERM', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_RUNTIME_DIR', 'TMPDIR']
/** Where Windows keeps the user's folders and its own: without them a program can't find its login, or even reach the network. */
const ENV_KEEP_WINDOWS = ['USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'USERNAME', 'APPDATA', 'LOCALAPPDATA', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432',
  'SystemRoot', 'SystemDrive', 'windir', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP', 'OS', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS']
/** npm leaves a launcher, `claude.cmd`, in the PATH; the program itself is beside it. */
const NPM_PROGRAM = join('node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
const APPEND = `You are MDlearn Studio's course author, working inside the user's notes folder.
Use the mdlearn MCP tools to read source documents (doc_outline, get_section) and to check lessons (lint_lesson).
Write only the files the task names. Never edit the user's source documents. Keep answers short; the user sees your tool calls live.`

export interface ClaudeConfig { path?: string; model: string }
/** A program that may be run, not a launcher script (a mise shim runs mise and prints to stdout). */
export function isProgram(path: string): boolean {
  try {
    if (process.platform !== 'win32') accessSync(path, constants.X_OK)
    const fd = openSync(realpathSync(path), 'r')
    try { const head = Buffer.alloc(2); readSync(fd, head, 0, 2, 0); return head.toString('latin1') !== '#!' } finally { closeSync(fd) }
  } catch { return false }
}

/**
 * The real Claude Code binary: settings, then the SDK's bundled one (absent from the desktop app), then mise,
 * then Claude Code's own installer (~/.local/bin/claude links to it) and the PATH, where on Windows an npm install
 * counts too. Launcher scripts are skipped.
 */
export function resolveClaude(cfg: ClaudeConfig, { platform = process.platform, env = process.env, bundled = true }: { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv; bundled?: boolean } = {}): string | null {
  const exe = platform === 'win32' ? 'claude.exe' : 'claude'
  const home = env.HOME ?? env.USERPROFILE ?? homedir()
  const candidates: string[] = []
  if (cfg.path) candidates.push(cfg.path)
  if (bundled) try { candidates.push(join(dirname(require.resolve(`@anthropic-ai/claude-agent-sdk-${platform}-${process.arch}/package.json`)), exe)) } catch { /* optional dependency missing */ }
  try { const out = execFileSync('mise', ['which', 'claude'], { encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'], env }).trim().split('\n').pop(); if (out) candidates.push(out) } catch { /* no mise */ }
  candidates.push(join(home, '.local/share/mise/installs/claude/latest/claude'), join(home, '.local/bin', exe))
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (!isAbsolute(dir)) continue // not `.` or `bin`
    candidates.push(join(dir, exe))
    if (platform === 'win32' && existsSync(join(dir, 'claude.cmd'))) candidates.push(join(dir, NPM_PROGRAM))
  }
  return candidates.find((p) => p && existsSync(p) && isProgram(p)) ?? null
}
const NO_SKILLS = 'The MDlearn skills plugin is missing from this build.'
export interface ClaudeStatus { available: boolean; version?: string; path?: string; error?: string }
let cachedStatus: { at: number; value: ClaudeStatus } | null = null
export async function claudeStatus(cfg: ClaudeConfig, fresh = false): Promise<ClaudeStatus> {
  if (!fresh && cachedStatus && Date.now() - cachedStatus.at < 60_000) return cachedStatus.value
  const bin = resolveClaude(cfg)
  let value: ClaudeStatus
  if (!skillsPlugin()) value = { available: false, error: NO_SKILLS }
  else if (!bin) value = { available: false, error: 'Claude Code is not installed (https://claude.com/claude-code).' }
  else {
    try { value = { available: true, path: bin, version: execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 8000, env: cleanEnv() }).trim().split(' ')[0] } }
    catch (e) { value = { available: false, path: bin, error: `Claude Code was found but did not start: ${whyNot(e)}` } }
  }
  cachedStatus = { at: Date.now(), value }
  return value
}
/** The first line a program that failed printed, or else why it could not run. */
function whyNot(e: unknown): string {
  const { stderr, message } = e as { stderr?: string | Buffer; message?: string }
  return (String(stderr ?? '').trim() || String(message ?? 'no reason given')).split(/\r?\n/)[0].slice(0, 200)
}
export function cleanEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return Object.fromEntries([...ENV_KEEP, ...ENV_KEEP_WINDOWS].filter((k) => env[k]).map((k) => [k, env[k]!]))
}
/** Claude Code's own words when nobody is logged in. They come as an answer, or as an error from the SDK that quotes it. */
export const loginFailed = (reply: string) => /^(claude code returned an error result:\s*)?(not logged in|invalid api key)\b/i.test(reply.trim())
const notLoggedIn = () => new UserError('engine', 'Claude Code is not logged in on this computer. Open a terminal, run `claude`, log in once, then try again.')
async function* sayingWhenLoggedOut(q: AsyncIterable<SDKMessage>) {
  try { yield* q } catch (e) { throw loginFailed((e as Error).message) ? notLoggedIn() : e }
}
/** Whether MDlearn's tools are out of reach. They may still be starting when Claude reports in: a first start can be slow. */
export const toolsFailed = (servers: { name: string; status: string }[]) => {
  const status = servers.find((s) => s.name === 'mdlearn')?.status
  return status !== 'connected' && status !== 'pending'
}
/**
 * The skills an AI job uses, in `dist/plugin` of this package: in this repository, in a package installed from npm and
 * inside the desktop app, which have no sources around them. Null when a build left them out.
 */
export function skillsPlugin(from = import.meta.dirname): string | null {
  for (let d = from; ; d = dirname(d)) {
    const plugin = join(d, 'dist', 'plugin')
    if (existsSync(join(d, 'package.json')) && existsSync(join(plugin, '.claude-plugin', 'plugin.json'))) return plugin
    if (dirname(d) === d) return null
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
    const plugin = skillsPlugin()
    if (!plugin) throw new Error(NO_SKILLS)
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
        mcpServers: { mdlearn: { type: 'stdio', command: process.execPath, args: [mcpEntry], env: { MDLEARN_ROOT: job.root, MDLEARN_READONLY: '1', ...AS_NODE } } },
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
    for await (const m of sayingWhenLoggedOut(q)) {
      for (const e of toEvents(m, job.root)) ctx.emit(e)
      if (m.type === 'system' && m.subtype === 'init') {
        sessionId = m.session_id
        if (toolsFailed(m.mcp_servers)) throw new Error('The mdlearn tools did not start inside Claude Code.')
      }
      if (m.type === 'result') { ok = m.subtype === 'success' && !m.is_error; summary = 'result' in m ? String(m.result) : (m.errors ?? []).join('; ') }
    }
    if (!ok && loginFailed(summary)) throw notLoggedIn()
    return { ok, summary, ...(sessionId ? { sessionId } : {}) }
  }
}

/**
 * One answer from Claude for a short task (feedback on an explanation): one turn, no tools, no MCP, no access to
 * any folder, run from the temp directory. Returns the final text.
 */
export async function claudeOnce(cfg: ClaudeConfig, req: { system: string; prompt: string; signal?: AbortSignal }): Promise<string> {
  const bin = resolveClaude(cfg)
  if (!bin) throw new Error('Claude Code is not installed or could not be found.')
  const abort = new AbortController()
  req.signal?.addEventListener('abort', () => abort.abort(), { once: true })
  const q = query({
    prompt: req.prompt,
    options: {
      cwd: tmpdir(), pathToClaudeCodeExecutable: bin, env: cleanEnv(), settingSources: [], strictMcpConfig: true, mcpServers: {},
      systemPrompt: req.system, tools: [], allowedTools: [], permissionMode: 'dontAsk', maxTurns: 1, includePartialMessages: false,
      abortController: abort, model: cfg.model,
    },
  })
  for await (const m of sayingWhenLoggedOut(q)) {
    if (m.type !== 'result') continue
    if (m.subtype === 'success' && m.is_error && loginFailed(String(m.result))) throw notLoggedIn()
    if (m.subtype !== 'success' || m.is_error) throw new Error('Claude could not answer just now. Try again, or use the local AI.')
    return String(m.result)
  }
  throw new Error('Claude did not answer.')
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
