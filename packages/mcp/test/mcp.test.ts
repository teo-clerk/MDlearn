import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { cpSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const server = resolve(__dirname, '../dist/index.js')
let client: Client
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean }
  return { text: r.content[0].text, isError: !!r.isError, json: () => JSON.parse(r.content[0].text) }
}

beforeAll(async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'mdl-mcp-'))
  cpSync(resolve(__dirname, '../../core/test/fixtures/curriculum'), root, { recursive: true })
  client = new Client({ name: 'test', version: '0' })
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [server], env: { ...process.env, MDLEARN_ROOT: root } as Record<string, string> }))
}, 30000)
afterAll(async () => { await client?.close() })

describe('mdlearn MCP server', () => {
  it('lists the tools', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['check_answer', 'curriculum_status', 'doc_outline', 'get_hint', 'get_section', 'lint_lesson', 'plan_lessons', 'present_item', 'progress_report', 'read_lesson', 'record_review', 'search_curriculum', 'study_queue'])
  })
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
