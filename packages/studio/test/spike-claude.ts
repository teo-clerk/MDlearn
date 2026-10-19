// M0 spike: drive the user's Claude Code login through the Agent SDK with an isolated configuration.
// Usage: tsx packages/studio/test/spike-claude.ts <sandbox-root> <out.jsonl>
import { query, type HookCallback } from '@anthropic-ai/claude-agent-sdk'
import { appendFileSync, writeFileSync, realpathSync, existsSync } from 'node:fs'
import { resolve, relative, dirname, join, isAbsolute, basename } from 'node:path'

const [root, outFile] = process.argv.slice(2).map((p) => resolve(p))
const repo = resolve(import.meta.dirname, '../../..')
writeFileSync(outFile, '')
const keep = ['HOME', 'PATH', 'USER', 'LANG', 'TERM', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_RUNTIME_DIR']
const env = Object.fromEntries(keep.filter((k) => process.env[k]).map((k) => [k, process.env[k]!]))
const real = (p: string): string => { try { return realpathSync(p) } catch { const d = dirname(p); return d === p ? p : join(real(d), basename(p)) } }
const writeScope = [real(join(root, 'learn'))]
const guard: HookCallback = async (input) => {
  const ti = (input as { tool_input?: { file_path?: string } }).tool_input
  const target = ti?.file_path ? real(isAbsolute(ti.file_path) ? ti.file_path : resolve(root, ti.file_path)) : ''
  const ok = !!target && target.endsWith('.md') && writeScope.some((s) => { const r = relative(s, target); return !r.startsWith('..') && !isAbsolute(r) })
  console.log(`[guard] ${(input as { tool_name: string }).tool_name} ${target} → ${ok ? 'allow' : 'deny'}`)
  return ok ? {} : { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `MDlearn Studio only lets this job write .md files inside learn/` } }
}
const t0 = Date.now()
const q = query({
  prompt: `Create the file learn/_spike/01-spike.learn.md: a minimal valid MDlearn lesson (frontmatter with title "Spike", level beginner, lang en, one goal) with one card "## The radar equation" containing one sentence and one single-choice :::quiz with two options about how received power scales with range (R^-4 correct, R^-2 wrong, each with feedback). Follow the mdlearn-course skill. Then call the lint_lesson tool on it and fix any E/W. Finally, as a permissions test, try once to write the file ../escape.md with the text "x" and report whether it was allowed. Answer in at most 3 short lines.`,
  options: {
    cwd: root,
    pathToClaudeCodeExecutable: resolve(repo, 'node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude'),
    env,
    settingSources: [],
    plugins: [{ type: 'local', path: resolve(repo, 'packages/studio/dist/plugin'), skipMcpDiscovery: true }],
    mcpServers: { mdlearn: { type: 'stdio', command: process.execPath, args: [resolve(repo, 'packages/mcp/dist/index.js')], env: { MDLEARN_ROOT: root } } },
    strictMcpConfig: true,
    systemPrompt: { type: 'preset', preset: 'claude_code', append: 'You are MDlearn Studio\'s lesson author. Only write Markdown lesson files inside learn/.' },
    tools: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Skill'],
    allowedTools: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Skill', 'mcp__mdlearn__*'],
    disallowedTools: ['Bash', 'WebFetch', 'WebSearch', 'Task', 'NotebookEdit'],
    permissionMode: 'dontAsk',
    hooks: { PreToolUse: [{ matcher: 'Write|Edit|MultiEdit', hooks: [guard] }] },
    includePartialMessages: true,
    model: 'haiku',
    maxTurns: 14,
  },
})
for await (const m of q) {
  appendFileSync(outFile, JSON.stringify(m) + '\n')
  const t = ((Date.now() - t0) / 1000).toFixed(1)
  if (m.type === 'system' && m.subtype === 'init') console.log(`[${t}s] init model=${m.model} apiKeySource=${m.apiKeySource} mcp=${JSON.stringify(m.mcp_servers)} skills=${m.skills?.filter((s: string) => s.includes('mdlearn')).join(',')} plugins=${JSON.stringify(m.plugins)} tools=${m.tools.length} version=${m.claude_code_version}`)
  else if (m.type === 'assistant') for (const b of m.message.content) { if (b.type === 'tool_use') console.log(`[${t}s] tool ${b.name} ${JSON.stringify(b.input).slice(0, 120)}`); else if (b.type === 'text') console.log(`[${t}s] text ${b.text.slice(0, 200)}`) }
  else if (m.type === 'result') console.log(`[${t}s] result ${m.subtype} turns=${m.num_turns} cost=${m.total_cost_usd} denials=${JSON.stringify(m.permission_denials?.map((d) => d.tool_name))} ${'result' in m ? String(m.result).slice(0, 300) : ''}`)
  else if (m.type === 'rate_limit_event') console.log(`[${t}s] rate ${JSON.stringify(m.rate_limit_info)}`)
}
console.log('lesson exists:', existsSync(join(root, 'learn/_spike/01-spike.learn.md')), '· escape exists:', existsSync(resolve(root, '../escape.md')))
