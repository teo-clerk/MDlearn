import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { cpSync, mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const server = resolve(__dirname, '../dist/index.js')
let client: Client
let root: string
const connect = async (env: Record<string, string>, cwd?: string) => {
  const c = new Client({ name: 'test', version: '0' })
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('MDLEARN_') && k !== 'CLAUDE_PROJECT_DIR')) as Record<string, string>
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [server], env: { ...base, ...env }, ...(cwd ? { cwd } : {}) }))
  return c
}
const callOn = async (c: Client, name: string, args: Record<string, unknown> = {}) => {
  const r = (await c.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean }
  return { text: r.content[0].text, isError: !!r.isError, json: () => JSON.parse(r.content[0].text) }
}
const call = (name: string, args: Record<string, unknown> = {}) => callOn(client, name, args)
const GOOD = '---\ntitle: Tides\nlevel: beginner\n---\n## Why tides\n\nThe Moon pulls the near side of the ocean harder than the far side.\n\n:::cloze\nTides are driven mainly by the {{Moon}}.\n:::\n'

beforeAll(async () => {
  root = mkdtempSync(resolve(tmpdir(), 'mdl-mcp-'))
  cpSync(resolve(__dirname, '../../core/test/fixtures/curriculum'), root, { recursive: true })
  client = await connect({ MDLEARN_ROOT: root })
}, 30000)
afterAll(async () => { await client?.close() })

describe('mdlearn MCP server', () => {
  it('lists the tools', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['authoring_guide', 'check_answer', 'curriculum_status', 'doc_outline', 'get_hint', 'get_section', 'lint_lesson', 'plan_lessons', 'present_item', 'progress_report', 'read_lesson', 'record_review', 'save_lesson', 'search_curriculum', 'study_queue'])
  })
  it('serves the authoring guide: the method, the spec by section, the visuals skill', async () => {
    expect((await call('authoring_guide')).text).toMatch(/## Steps/)
    const toc = (await call('authoring_guide', { part: 'spec' })).text
    expect(toc).toMatch(/§8\.12 Games/)
    expect((await call('authoring_guide', { part: 'spec', section: '8.3' })).text).toMatch(/^### 8\.3 `cloze`/)
    expect((await call('authoring_guide', { part: 'visuals' })).text).not.toMatch(/^---/) // skill frontmatter stripped
  })
  it('saves lint-clean lessons inside the folder only, never over existing files unless asked', async () => {
    const ok = await call('save_lesson', { path: 'tides/01-why-tides.learn.md', content: GOOD })
    expect(ok.text).toMatch(/✓ saved tides\/01-why-tides\.learn\.md · 1 cards/)
    expect(readFileSync(resolve(root, 'tides/01-why-tides.learn.md'), 'utf8')).toBe(GOOD)
    expect((await call('save_lesson', { path: 'tides/01-why-tides.learn.md', content: GOOD })).text).toMatch(/already exists/)
    expect((await call('save_lesson', { path: 'tides/01-why-tides.learn.md', content: GOOD, overwrite: true })).isError).toBe(false)
    const replaced = await call('save_lesson', { path: 'tides/01-why-tides.learn.md', content: GOOD.replace('## Why tides', '## Why the sea rises'), overwrite: true })
    expect(replaced.text).toMatch(/0 cards kept their progress · 1 new · 1 removed/)
    expect(replaced.text).not.toMatch(/Studied cards/)
    await call('save_lesson', { path: 'tides/01-why-tides.learn.md', content: GOOD, overwrite: true })
    const bad = await call('save_lesson', { path: 'tides/02-bad.learn.md', content: '---\ntitle: B\n---\n## A\n:::quiz\nQ?\n- [ ] a\n- [ ] b\n:::\n' })
    expect(bad.isError).toBe(true); expect(bad.text).toMatch(/not saved.*\n.*E202/)
    expect(existsSync(resolve(root, 'tides/02-bad.learn.md'))).toBe(false)
    expect((await call('save_lesson', { path: '../outside.learn.md', content: GOOD })).isError).toBe(true)
    expect((await call('save_lesson', { path: '00_FOUNDATIONS/04_radar.md', content: 'x', overwrite: true })).text).toMatch(/Only notes with `study: true`/)
    expect((await call('save_lesson', { path: 'tides/course.md', content: '# Tides\n\n1. Why tides\n' })).text).toMatch(/✓ saved tides\/course\.md/)
    expect((await call('save_lesson', { path: 'tides/course.md', content: '# Mine', overwrite: true })).text).toMatch(/never replaced/)
  })
  it('offers ready-made prompts and the guide as resources', async () => {
    const { prompts } = await client.listPrompts()
    expect(prompts.map((p) => p.name).sort()).toEqual(['companion_lessons', 'create_course', 'study'])
    const course = await client.getPrompt({ name: 'create_course', arguments: { topic: 'Tides', minutes: '30' } })
    const body = (course.messages[0].content as { text: string }).text
    expect(body).toMatch(/Create an MDlearn course on: Tides/); expect(body).toMatch(/save_lesson/); expect(body).toMatch(/no notes/)
    const study = await client.getPrompt({ name: 'study', arguments: { scope: 'radar' } })
    expect((study.messages[0].content as { text: string }).text).toMatch(/present_item/)
    const { resources } = await client.listResources()
    expect(resources.map((r) => r.uri).sort()).toEqual(['mdlearn://guide/chat', 'mdlearn://guide/method', 'mdlearn://guide/spec'])
    const chat = await client.readResource({ uri: 'mdlearn://guide/chat' })
    expect((chat.contents[0] as { text: string }).text).toMatch(/<!-- file: path -->/)
  })
  it('works in a folder with no curriculum (the project folder), and read-only for hosts that guard writes', async () => {
    const empty = mkdtempSync(resolve(tmpdir(), 'mdl-mcp-empty-'))
    const c = await connect({ CLAUDE_PROJECT_DIR: empty, MDLEARN_ROOT: '${CLAUDE_PROJECT_DIR}' }) // unexpanded variable: ignored
    expect((await callOn(c, 'curriculum_status')).json()).toMatchObject({ root: empty, docs: [] })
    expect((await callOn(c, 'save_lesson', { path: 'a/01-a.learn.md', content: GOOD })).text).toMatch(/✓ saved/)
    await c.close()
    const ro = await connect({ MDLEARN_ROOT: empty, MDLEARN_READONLY: '1' })
    expect((await ro.listTools()).tools.map((t) => t.name)).not.toContain('save_lesson')
    expect(((await ro.getPrompt({ name: 'create_course', arguments: { topic: 'X' } })).messages[0].content as { text: string }).text).toMatch(/lint_lesson/)
    await ro.close()
  }, 30000)
  it('curriculum tools read the real documents', async () => {
    expect((await call('curriculum_status')).json().docs[0]).toMatchObject({ doc: '00_FOUNDATIONS/04_radar.md', existing: 1 })
    expect((await call('doc_outline', { doc: '04_radar' })).json().timeMin).toBe(120)
    expect((await call('get_section', { doc: '04_radar', section: '§3' })).text).toContain('## 3. Range resolution')
    expect((await call('get_section', { doc: '04_radar', section: '9.9' })).isError).toBe(true)
    expect((await call('search_curriculum', { query: 'inverse-square' })).json()[0]).toMatchObject({ doc: '00_FOUNDATIONS/04_radar.md' })
    expect((await call('plan_lessons', { doc: '04_radar', targetWords: 30 })).json()[0].source).toBe('../../../00_FOUNDATIONS/04_radar.md')
  })
  it('lint reports unresolved ::read references and accepts unsaved content', async () => {
    const path = 'learn/00_FOUNDATIONS/04_radar/01-radar-equation.learn.md'
    expect((await call('lint_lesson', { path })).text).toMatch(/E111 read-unresolved/)
    const ok = await call('lint_lesson', { path, content: '---\ntitle: T\nsource: ../../../00_FOUNDATIONS/04_radar.md\n---\n## A\n::read[§2]\n\ntext' })
    expect(ok.text).toMatch(/✓ no errors/)
    expect((await call('lint_lesson', { path: '../../etc/passwd' })).isError).toBe(true)
  })
  it('tutor loop: queue → present (no leak) → check → record → report', async () => {
    const q = (await call('study_queue')).json()
    const quizItem = q.find((x: { kind: string }) => x.kind === 'quiz')
    const posed = (await call('present_item', { widgetId: quizItem.widgetId })).json()
    expect(posed.question).not.toMatch(/Right:|limits azimuth/)
    const line = posed.question.split('\n').find((l: string) => /bandwidth/.test(l))
    const res = (await call('check_answer', { widgetId: quizItem.widgetId, answer: line.trim()[0], sure: true })).json()
    expect(res.correct).toBe(true)
    const rec = (await call('record_review', { cardKey: quizItem.cardKey, correct: true, sure: true })).json()
    expect(rec.rating).toBe('solid'); expect(rec.say).toMatch(/^solid: /)
    const rep = (await call('progress_report')).json()
    expect(rep.totals.seen).toBe(1)
    expect((await call('record_review', { cardKey: 'nope/x', correct: true })).isError).toBe(true)
  })
})
