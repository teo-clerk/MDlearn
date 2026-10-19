import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { outlineDoc, sectionText, planLessons, findSection, idPrefixFor } from '../src/importer'

const md = readFileSync(resolve(__dirname, 'fixtures/curriculum/00_FOUNDATIONS/04_radar.md'), 'utf8')
const o = outlineDoc(md, '00_FOUNDATIONS/04_radar.md')

describe('importer', () => {
  it('reads the house-style front matter', () => {
    expect(o).toMatchObject({ title: 'Radar Basics', docNo: '04', kind: 'concept', track: 'Foundations', timeMin: 120, difficulty: 3, level: 'intermediate' })
    expect(o.prerequisites).toEqual([{ label: '03_optics.md', href: '03_optics.md' }])
    expect(o.objectives).toHaveLength(2)
    expect(o.objectives[0]).toContain('distinguish $\\sigma^0$')
    expect(o.deliverable).toContain('F-M4')
  })
  it('finds numbered sections, roles, and ignores # inside code', () => {
    expect(o.sections.map((s) => s.num ?? s.anchor)).toEqual(['1', '2', '2.1', 'bridge-to-what-you-already-know--it-is-an-inverse-square-law-twice', '3', '4'])
    expect(o.sections.find((s) => s.num === '4')!.role).toBe('lookup')
    expect(o.sections[3].role).toBe('bridge')
  })
  it('section text is exact and survives $$ on content lines', () => {
    const s = sectionText(md, o, '§2')!
    expect(s.text.startsWith('## 2. The radar equation')).toBe(true)
    expect(s.text).toContain('### 2.1 Derivation')
    expect(s.text).not.toContain('## 3.')
    expect(findSection(o, 'range resolution')!.num).toBe('3')
  })
  it('plans companion lessons and skips look-up sections', () => {
    const plan = planLessons(o, { targetWords: 30 })
    expect(plan.flatMap((p) => p.sections)).not.toContain('4')
    expect(plan[0].id.startsWith('f04-01-')).toBe(true)
    expect(idPrefixFor({ path: '01_FLOOD_SAR/docs/03_dem.md' })).toBe('p1-03')
  })
})
describe('plan ids', () => {
  it('ids and file names contain only [a-z0-9-]', () => {
    const doc = '# 01. X\n\n## 2. Oblateness, $J_2$ and Sun-synchronous orbit\n\ntext\n'
    const p = planLessons(outlineDoc(doc, '00_FOUNDATIONS/01_orbits.md'))
    expect(p[0].id).toMatch(/^[a-z0-9][a-z0-9-]*$/)
    expect(p[0].file).toMatch(/^[a-z0-9-]+\.learn\.md$/)
  })
})
