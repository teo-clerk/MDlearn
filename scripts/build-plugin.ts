// Packs the MDlearn skills into a local Claude Code plugin for MDlearn Studio's AI jobs
// (packages/studio/dist/plugin). Files are copied, not linked, so the plugin works from any folder.
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const repo = resolve(import.meta.dirname, '..')
const out = join(repo, 'packages/studio/dist/plugin')
const version = JSON.parse(readFileSync(join(repo, 'packages/studio/package.json'), 'utf8')).version as string
const required = ['docs/AGENT_SKILL.md', 'docs/DSL_SPECIFICATION.md', 'skills/mdlearn-curriculum/SKILL.md', 'skills/mdlearn-tutor/SKILL.md']
const missing = required.filter((f) => !existsSync(join(repo, f)))
if (missing.length) throw new Error(`cannot build the plugin, missing: ${missing.join(', ')}`)
rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, '.claude-plugin'), { recursive: true })
writeFileSync(join(out, '.claude-plugin/plugin.json'), JSON.stringify({
  name: 'mdlearn', version, description: 'Write, convert and check MDlearn interactive lessons.',
}, null, 2))
const skill = (name: string, files: Record<string, string>) => {
  mkdirSync(join(out, 'skills', name), { recursive: true })
  for (const [to, from] of Object.entries(files)) cpSync(join(repo, from), join(out, 'skills', name, to), { dereference: true })
}
skill('mdlearn-course', { 'SKILL.md': 'docs/AGENT_SKILL.md', 'DSL_SPECIFICATION.md': 'docs/DSL_SPECIFICATION.md' })
for (const name of ['mdlearn-curriculum', 'mdlearn-tutor', 'mdlearn-visuals'])
  if (existsSync(join(repo, 'skills', name, 'SKILL.md'))) skill(name, { 'SKILL.md': `skills/${name}/SKILL.md` })
console.log(`plugin written to ${out}`)
