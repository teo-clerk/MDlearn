// MDlearn for other assistants, written to packages/studio/dist/integrations/:
//   claude-plugin/       a Claude Code marketplace with the `mdlearn` plugin: the four skills, /mdlearn:course and
//                        /mdlearn:study, and the MCP server as one self-contained file (no repo or node_modules needed)
//   mdlearn-skill.zip    a skill to upload to Claude.ai (Settings → Capabilities → Skills), with a bundled linter
//   MDLEARN_PROMPT.md    the prompt for ChatGPT, Gemini or any chat without tools (from docs/CHAT_PROMPT.md)
//   MDLEARN_GUIDE.md     the full guide to attach as a knowledge file (method + DSL specification)
// Install the plugin: claude plugin marketplace add <…>/integrations/claude-plugin && claude plugin install mdlearn@mdlearn
import { build } from 'esbuild'
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { zipSync } from 'fflate'
import { coursePrompt } from '../packages/core/src/authoring.ts'

const repo = resolve(import.meta.dirname, '..')
const out = join(repo, 'packages/studio/dist/integrations')
const version = JSON.parse(readFileSync(join(repo, 'packages/mcp/package.json'), 'utf8')).version as string
const read = (f: string) => readFileSync(join(repo, f), 'utf8')
const description = 'Turn any topic or your notes into interactive MDlearn lessons (spaced repetition, retrieval practice, worked examples), and study them with a tutor.'
const PROMPT_MARK = '<!-- prompt starts -->'
const chatPrompt = () => {
  const doc = read('docs/CHAT_PROMPT.md')
  if (!doc.includes(PROMPT_MARK)) throw new Error(`docs/CHAT_PROMPT.md has no "${PROMPT_MARK}" line`)
  return doc.slice(doc.indexOf(PROMPT_MARK) + PROMPT_MARK.length).trim() + '\n'
}
// ESM bundle of CommonJS dependencies: give them a require()
const banner = { js: "import { createRequire as __mdlRequire } from 'node:module'; const require = __mdlRequire(import.meta.url);" }
const bundle = (entry: string, outfile: string) => build({ entryPoints: [join(repo, entry)], outfile, bundle: true, platform: 'node', format: 'esm', target: 'node20', banner, legalComments: 'none', logLevel: 'warning' })

rmSync(out, { recursive: true, force: true })

// ---------------------------------------------------------------- Claude Code marketplace + plugin
const market = join(out, 'claude-plugin'), plugin = join(market, 'mdlearn')
mkdirSync(join(market, '.claude-plugin'), { recursive: true })
writeFileSync(join(market, '.claude-plugin/marketplace.json'), JSON.stringify({
  name: 'mdlearn', owner: { name: 'MDlearn' }, description: 'MDlearn: interactive lessons from any topic or notes.',
  plugins: [{ name: 'mdlearn', source: './mdlearn', description, version, category: 'learning' }],
}, null, 2))
mkdirSync(join(plugin, '.claude-plugin'), { recursive: true })
writeFileSync(join(plugin, '.claude-plugin/plugin.json'), JSON.stringify({ name: 'mdlearn', version, description, author: { name: 'MDlearn' } }, null, 2))
writeFileSync(join(plugin, '.mcp.json'), JSON.stringify({ mcpServers: { mdlearn: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/mcp/server.mjs'] } } }, null, 2))
await bundle('packages/mcp/src/index.ts', join(plugin, 'mcp/server.mjs'))
const guideFiles = { method: 'docs/AGENT_SKILL.md', spec: 'docs/DSL_SPECIFICATION.md', visuals: 'skills/mdlearn-visuals/SKILL.md', tutor: 'skills/mdlearn-tutor/SKILL.md', curriculum: 'skills/mdlearn-curriculum/SKILL.md' }
mkdirSync(join(plugin, 'mcp/guide'), { recursive: true })
for (const [part, from] of Object.entries(guideFiles)) cpSync(join(repo, from), join(plugin, 'mcp/guide', `${part}.md`))
writeFileSync(join(plugin, 'mcp/guide/chat.md'), chatPrompt())
const skill = (name: string, files: Record<string, string>) => {
  mkdirSync(join(plugin, 'skills', name), { recursive: true })
  for (const [to, from] of Object.entries(files)) cpSync(join(repo, from), join(plugin, 'skills', name, to), { dereference: true })
}
skill('mdlearn-course', { 'SKILL.md': 'docs/AGENT_SKILL.md', 'DSL_SPECIFICATION.md': 'docs/DSL_SPECIFICATION.md' })
for (const name of ['mdlearn-curriculum', 'mdlearn-tutor', 'mdlearn-visuals']) skill(name, { 'SKILL.md': `skills/${name}/SKILL.md` })
mkdirSync(join(plugin, 'commands'), { recursive: true })
writeFileSync(join(plugin, 'commands/course.md'), `---
description: Create an MDlearn course on any topic, from your notes or from general knowledge
argument-hint: <topic> [level, language, minutes, notes path]
---
The request: $ARGUMENTS
If it names a level, language, length or a notes file or folder, use those instead of the defaults below.

${coursePrompt({ topic: 'the topic of the request', save: 'tool' })}
`)
writeFileSync(join(plugin, 'commands/study.md'), `---
description: Study your MDlearn lessons now (spaced repetition, one question at a time)
argument-hint: [lesson or topic]
---
Run an MDlearn study session on: $ARGUMENTS (everything that is due when this is empty). Use the mdlearn-tutor skill and the mdlearn tools (study_queue → present_item → check_answer → record_review), one card at a time.
`)

// ---------------------------------------------------------------- Claude.ai skill (zip)
const zipDir = join(out, 'skill'), skillDir = join(zipDir, 'mdlearn-course')
mkdirSync(join(skillDir, 'scripts'), { recursive: true })
writeFileSync(join(skillDir, 'SKILL.md'), read('docs/AGENT_SKILL.md').replace(
  '6. **Validate.**',
  '6. **Validate.** If you can run code, run `node scripts/lint.mjs <files>` (next to this file) and fix every `E`/`W` line.',
))
cpSync(join(repo, 'docs/DSL_SPECIFICATION.md'), join(skillDir, 'DSL_SPECIFICATION.md'))
await bundle('scripts/lint-entry.ts', join(skillDir, 'scripts/lint.mjs'))
// zipped here, not by a `zip` command (Windows has none); names inside always use /
const entries: Record<string, Uint8Array> = {}
for (const f of readdirSync(skillDir, { recursive: true, withFileTypes: true })) {
  if (f.isFile()) entries[['mdlearn-course', ...relative(skillDir, join(f.parentPath, f.name)).split(sep)].join('/')] = readFileSync(join(f.parentPath, f.name))
}
writeFileSync(join(out, 'mdlearn-skill.zip'), zipSync(entries, { level: 9 }))
rmSync(zipDir, { recursive: true, force: true })

// ---------------------------------------------------------------- chats without tools
writeFileSync(join(out, 'MDLEARN_PROMPT.md'), chatPrompt())
writeFileSync(join(out, 'MDLEARN_GUIDE.md'), `# MDlearn guide (attach this file to a chat, a Custom GPT or a Project)

${read('docs/AGENT_SKILL.md').replace(/^---\n[\s\S]*?\n---\n+/, '')}

---

${read('docs/DSL_SPECIFICATION.md')}`)

if (!existsSync(join(plugin, 'mcp/server.mjs'))) throw new Error('the MCP bundle was not written')
console.log(`integrations written to ${out}`)
