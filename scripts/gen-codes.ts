import { CODES, severityOf, type Code } from '../packages/core/src/registry.ts'
const groups: [string, RegExp][] = [['Structure & frontmatter', /^.1\d\d$/], ['Quiz, order & games', /^.2\d\d$/], ['Cloze & blanks', /^.3\d\d$/], ['Explain & steps', /^.4\d\d$/], ['Code', /^.5\d\d$/], ['Pedagogy & item writing (heuristics)', /^.6\d\d$/], ['Math', /^.7\d\d$/], ['Normalisation (auto-repairs)', /^.8\d\d$/], ['Visual blocks', /^.9\d\d$/]]
for (const [title, re] of groups) {
  console.log(`\n**${title}**\n\n| Code | Severity | Rule | Meaning |\n|---|---|---|---|`)
  for (const [k, v] of Object.entries(CODES).filter(([k]) => re.test(k)).sort(([a], [b]) => a.slice(1).localeCompare(b.slice(1)))) {
    const d = v as { rule: string; summary: string; fix?: string }
    console.log(`| ${k} | ${severityOf(k as Code)} | \`${d.rule}\` | ${d.summary.replace(/\|/g, '\\|')}${d.fix ? ' ' + d.fix.replace(/\|/g, '\\|') : ''} |`)
  }
}
