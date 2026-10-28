import { describe, it, expect } from 'vitest'
import { buildGraph, emphasis, linkEmphasis, matchesQuery, memoryTone, neighboursOf, nodeVal, adjacency, DEFAULT_FILTERS, type GraphView } from '../../web/knowledge/graph'
import type { MapNode, MapResponse } from '../../shared/types'

const node = (path: string, extra: Partial<MapNode> = {}): MapNode => ({ path, title: path.toUpperCase(), words: 100, lessons: 0, seen: 0, memory: null, lessonList: [], ...extra })
const e = (from: string, to: string, kind: 'link' | 'prereq' = 'prereq') => ({ from, to, kind })
const data = (nodes: MapNode[], edges: MapResponse['edges']) => ({ nodes, edges })
const ids = (g: { nodes: { id: string }[] }) => g.nodes.map((n) => n.id).sort()
const pairs = (g: { links: { source: string; target: string; kind: string }[] }) => g.links.map((l) => `${l.source}>${l.target}:${l.kind}`).sort()

describe('graph data', () => {
  const folder = data([node('a'), node('b'), node('c'), node('d'), node('lonely')], [e('a', 'b'), e('b', 'c'), e('c', 'd', 'link'), e('d', 'c', 'link'), e('a', 'a', 'link'), e('a', 'ghost')])

  it('draws every document and connection of the folder, one line per linked pair', () => {
    const g = buildGraph(folder, DEFAULT_FILTERS)
    expect(ids(g)).toEqual(['a', 'b', 'c', 'd', 'lonely'])
    expect(pairs(g)).toEqual(['a>b:prereq', 'b>c:prereq', 'c>d:link'])
    expect(g.nodes.find((n) => n.id === 'b')!.degree).toBe(2)
  })
  it('drops a plain link where a prerequisite already joins the two documents', () => {
    const g = buildGraph(data([node('a'), node('b')], [e('a', 'b'), e('b', 'a', 'link')]), DEFAULT_FILTERS)
    expect(pairs(g)).toEqual(['a>b:prereq'])
  })
  it('filters links, prerequisites and documents without connections', () => {
    expect(pairs(buildGraph(folder, { ...DEFAULT_FILTERS, links: false }))).toEqual(['a>b:prereq', 'b>c:prereq'])
    expect(pairs(buildGraph(folder, { ...DEFAULT_FILTERS, prereqs: false }))).toEqual(['c>d:link'])
    expect(ids(buildGraph(folder, { ...DEFAULT_FILTERS, orphans: false }))).toEqual(['a', 'b', 'c', 'd'])
    // without links, d has nothing left
    expect(ids(buildGraph(folder, { ...DEFAULT_FILTERS, links: false, orphans: false }))).toEqual(['a', 'b', 'c'])
  })
  it('adds each document’s lessons as small nodes when asked', () => {
    const withLessons = data([node('a', { lessons: 1, lessonList: [{ path: 'learn/a/01.learn.md', title: 'One' }] }), node('b')], [e('a', 'b')])
    expect(ids(buildGraph(withLessons, DEFAULT_FILTERS))).toEqual(['a', 'b'])
    const g = buildGraph(withLessons, { ...DEFAULT_FILTERS, lessons: true })
    expect(g.nodes.find((n) => n.id === 'learn/a/01.learn.md')).toMatchObject({ kind: 'lesson', title: 'One', doc: 'a' })
    expect(pairs(g)).toContain('a>learn/a/01.learn.md:lesson')
  })
  it('around one document: everything within the chosen number of steps, in either direction', () => {
    const chain = data([node('a'), node('b'), node('c'), node('d'), node('x')], [e('a', 'b'), e('b', 'c'), e('c', 'd', 'link')])
    expect(ids(buildGraph(chain, DEFAULT_FILTERS, { path: 'b', depth: 1 }))).toEqual(['a', 'b', 'c'])
    expect(ids(buildGraph(chain, DEFAULT_FILTERS, { path: 'b', depth: 2 }))).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(buildGraph(chain, { ...DEFAULT_FILTERS, links: false }, { path: 'b', depth: 3 }))).toEqual(['a', 'b', 'c'])
    // a document with no connections is still drawn on its own
    expect(ids(buildGraph(chain, DEFAULT_FILTERS, { path: 'x', depth: 2 }))).toEqual(['x'])
    expect(ids(buildGraph(chain, DEFAULT_FILTERS, { path: 'missing', depth: 2 }))).toEqual([])
  })
  it('returns fresh objects, so the drawing library can move them without touching the input', () => {
    const g1 = buildGraph(folder, DEFAULT_FILTERS), g2 = buildGraph(folder, DEFAULT_FILTERS)
    expect(g1.nodes[0]).not.toBe(g2.nodes[0])
    expect(g1.links[0]).not.toBe(g2.links[0])
  })
  it('lists what a document builds on, leads to, links with, and its lessons', () => {
    const g = buildGraph(data([node('a'), node('b', { lessons: 1, lessonList: [{ path: 'l.learn.md', title: 'L' }] }), node('c'), node('d')], [e('a', 'b'), e('b', 'c'), e('d', 'b', 'link')]), { ...DEFAULT_FILTERS, lessons: true })
    expect(neighboursOf(g, 'b')).toEqual({ buildsOn: ['a'], leadsTo: ['c'], linked: ['d'], lessons: ['l.learn.md'] })
    expect(adjacency(g).get('b')).toEqual(new Set(['a', 'c', 'd', 'l.learn.md']))
  })
})

describe('drawing helpers', () => {
  it('colours a document by how well it is remembered, like the map’s dots', () => {
    expect(memoryTone({ memory: null, seen: 0 })).toBe('none')
    expect(memoryTone({ memory: 0.9, seen: 0 })).toBe('none')
    expect(memoryTone({ memory: 0.9, seen: 3 })).toBe('good')
    expect(memoryTone({ memory: 0.7, seen: 3 })).toBe('warn')
    expect(memoryTone({ memory: 0.2, seen: 3 })).toBe('bad')
  })
  it('grows nodes with the words, gently, and keeps lessons small', () => {
    const doc = (words: number) => nodeVal({ kind: 'doc', words })
    expect(doc(0)).toBe(1)
    expect(doc(2500)).toBeGreaterThan(doc(400))
    expect(doc(1e7)).toBe(12)
    expect(nodeVal({ kind: 'lesson', words: 5000 })).toBeLessThan(1)
  })
  it('finds titles regardless of case and accents', () => {
    expect(matchesQuery('Équation du radar', 'equation')).toBe(true)
    expect(matchesQuery('Radar', '  RAD ')).toBe(true)
    expect(matchesQuery('Radar', 'sonar')).toBe(false)
    expect(matchesQuery('Radar', '')).toBe(false)
  })
  it('lights the hovered or chosen document with its neighbours and dims the rest', () => {
    const adj = new Map([['a', new Set(['b'])], ['b', new Set(['a'])], ['c', new Set<string>()]])
    const view = (v: Partial<GraphView>): GraphView => ({ hover: null, selected: null, focus: null, matches: null, adjacency: adj, ...v })
    expect(emphasis(view({}), 'a')).toBe('normal')
    expect(emphasis(view({ hover: 'a' }), 'b')).toBe('lit')
    expect(emphasis(view({ hover: 'a' }), 'c')).toBe('dim')
    // hovering wins over the chosen document
    expect(emphasis(view({ selected: 'c', hover: 'a' }), 'c')).toBe('dim')
    expect(emphasis(view({ selected: 'c' }), 'c')).toBe('lit')
    expect(emphasis(view({ matches: new Set(['c']) }), 'c')).toBe('lit')
    expect(emphasis(view({ matches: new Set(['c']) }), 'a')).toBe('dim')
    expect(linkEmphasis(view({ hover: 'a' }), 'a', 'b')).toBe('lit')
    expect(linkEmphasis(view({ hover: 'a' }), 'b', 'c')).toBe('dim')
    expect(linkEmphasis(view({}), 'b', 'c')).toBe('normal')
  })
})
