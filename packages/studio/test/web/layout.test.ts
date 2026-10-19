import { describe, it, expect } from 'vitest'
import { layoutGraph, pathOf } from '../../web/knowledge/layout'

const n = (path: string) => ({ path, title: path })
describe('map layout', () => {
  it('puts prerequisites to the left of what needs them, and unconnected documents aside', () => {
    const l = layoutGraph([n('a'), n('b'), n('c'), n('lonely')], [{ from: 'a', to: 'b', kind: 'prereq' }, { from: 'b', to: 'c', kind: 'prereq' }])
    const x = (p: string) => l.nodes.find((q) => q.path === p)!.x
    expect(x('a')).toBeLessThan(x('b')); expect(x('b')).toBeLessThan(x('c'))
    expect(l.isolated.map((q) => q.path)).toEqual(['lonely'])
    expect(l.edges).toHaveLength(2); expect(l.width).toBeGreaterThan(0)
  })
  it('survives cycles, self links and links to documents that do not exist', () => {
    const l = layoutGraph([n('a'), n('b')], [{ from: 'a', to: 'b', kind: 'link' }, { from: 'b', to: 'a', kind: 'link' }, { from: 'a', to: 'a', kind: 'link' }, { from: 'a', to: 'ghost', kind: 'link' }])
    expect(l.nodes).toHaveLength(2); expect(l.edges.length).toBeGreaterThanOrEqual(1)
  })
  it('is empty for no documents', () => { expect(layoutGraph([], [])).toMatchObject({ nodes: [], edges: [], isolated: [] }) })
  it('draws a smooth path through the points', () => {
    expect(pathOf([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe('M0,0L10,0')
    expect(pathOf([{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }])).toMatch(/^M0,0Q5,5 /)
    expect(pathOf([])).toBe('')
  })
})

import { neighbourhood } from '../../web/knowledge/layout'
describe('neighbourhood', () => {
  const e = (from: string, to: string, kind: 'link' | 'prereq' = 'prereq') => ({ from, to, kind })
  const edges = [e('a', 'b'), e('b', 'c'), e('c', 'd'), e('d', 'x'), e('z', 'b'), e('q', 'r'), e('c', 'm', 'link'), e('n', 'c', 'link')]
  const names = (es: { from: string; to: string }[]) => es.map((x) => `${x.from}>${x.to}`).sort()
  it('follows prerequisites back and forward from a document, not sideways', () => {
    expect(names(neighbourhood(edges, 'c'))).toEqual(['a>b', 'b>c', 'c>d', 'd>x', 'z>b'])
  })
  it('stops after the given number of steps', () => {
    expect(names(neighbourhood(edges, 'c', { depth: 1 }))).toEqual(['b>c', 'c>d'])
  })
  it('adds the documents it links to and that link to it only when asked', () => {
    expect(names(neighbourhood(edges, 'c', { depth: 1, links: true }))).toEqual(['b>c', 'c>d', 'c>m', 'n>c'])
  })
  it('is empty for a document nothing points at', () => { expect(neighbourhood(edges, 'lonely')).toEqual([]) })
})
