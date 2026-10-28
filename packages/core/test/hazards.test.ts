import { describe, it, expect } from 'vitest'
import { compile } from '../src/compile'
import { stage0 } from '../src/stage0'

const FM = '---\ntitle: T\n---\n'
const codes = (src: string) => compile(FM + src).diagnostics.map((d) => d.code)
const card = (src: string) => compile(FM + '## C\n' + src).lesson!.cards[0]
const prose = (src: string) => JSON.stringify(card(src).blocks)

describe('stage 0 hazards', () => {
  it('text directives are inert: 10:30, 1:99, doi: survive', () => {
    expect(prose('odds 1:99 at 10:30, doi:10.1/x, localhost:3000')).toContain('odds 1:99 at 10:30, doi:10.1/x, localhost:3000')
  })
  it('one-line $$…$$ becomes display math', () => {
    const b = card('$$x^2$$').blocks[0] as any
    expect(b.node.type).toBe('math'); expect(b.node.value).toBe('x^2')
  })
  it('$$\\begin{aligned} on the opening line is kept', () => {
    const b = card('$$\\begin{aligned} a&=b \\\\\n c&=d \\end{aligned}$$').blocks[0] as any
    expect(b.node.type).toBe('math'); expect(b.node.value).toContain('\\begin{aligned}')
  })
  it('currency dollars are escaped (Pandoc rule) and real math survives', () => {
    const s = prose('It costs $5 and $10, while $x^2$ is math.')
    expect(s).toContain('It costs $5 and $10, while ')
    expect(s).toContain('"inlineMath","value":"x^2"')
    expect(codes('It costs $5 and $10.')).toContain('I808')
  })
  it('\\( \\) and \\[ \\] are converted', () => {
    expect(prose('see \\(a+b\\)')).toContain('"inlineMath","value":"a+b"')
    expect(card('\\[\n\\int f\n\\]').blocks[0]).toMatchObject({ node: { type: 'math' } })
  })
  it('--- under a paragraph does not create a heading', () => {
    const c = compile(FM + '## A\nprompt text\n---\nmore\n').lesson!
    expect(c.cards).toHaveLength(1)
    expect(JSON.stringify(c.cards[0].blocks)).not.toContain('"heading"')
  })
  it('fence variants normalise: `::: quiz`, trailing title, attrs before label, MyST, Quarto', () => {
    const q = ':::quiz\nQ?\n- [x] a\n- [ ] b\n:::'
    for (const v of [q.replace(':::quiz', '::: quiz'), q.replace(':::quiz', ':::quiz Pick one')])
      expect(card(v).blocks[0].type).toBe('quiz')
    expect(card(':::tip{fold}[Why?]\nbecause\n:::').blocks[0]).toMatchObject({ type: 'callout', kind: 'tip', fold: true })
    expect(card(':::{note}\nx\n:::').blocks[0]).toMatchObject({ type: 'callout', kind: 'note' })
    expect(card('::: {.callout-warning collapse="true"}\nx\n:::').blocks[0]).toMatchObject({ type: 'callout', kind: 'warning', fold: true })
  })
  it('a ::: line inside a code fence does not close the widget', () => {
    const w = card(':::code\nWrite it.\n```js\nconst s = `\n:::\n`\n```\n:::').blocks[0] as any
    expect(w.type).toBe('code'); expect(w.starter).toContain(':::')
  })
  it('callout inside a widget parses (Pandoc nesting semantics)', () => {
    const w = card(':::steps\nSolve.\n:::tip\nhint box\n:::\n1. a\n2. b\n:::').blocks
    expect(w).toHaveLength(1); expect(w[0].type).toBe('steps')
  })
  it('nested widget is reported and the inner one locked', () => {
    expect(codes('## C\n:::steps\nP\n:::quiz\nQ\n- [x] a\n- [ ] b\n:::\n1. a\n2. b\n:::')).toContain('E106')
  })
  it('mis-indented feedback under `1.` options is reattached', () => {
    const q = card(':::quiz\nQ?\n1. [ ] a\n  > not a\n2. [x] b\n  > yes b\n:::').blocks[0] as any
    expect(q.options.map((o: any) => !!o.feedback)).toEqual([true, true])
  })
  it('unindented > directly under an option is feedback; after a blank line it is the explanation', () => {
    const q = card(':::quiz\nQ?\n- [ ] a\n> not a\n- [x] b\n> yes b\n\n> general\n:::').blocks[0] as any
    expect(q.options[0].feedback).toBeDefined(); expect(q.options[1].feedback).toBeDefined()
    expect(JSON.stringify(q.reveal)).toContain('general')
  })
  it('several questions inside one quiz are split', () => {
    const b = card(':::quiz\nQ1?\n- [x] a\n- [ ] b\n\nQ2?\n- [ ] c\n- [x] d\n:::').blocks
    expect(b.map((x) => x.type)).toEqual(['quiz', 'quiz'])
  })
  it('answer markers are converted to [x]', () => {
    const q = card(':::quiz\nQ?\n- a ✅\n- b\n:::').blocks[0] as any
    expect(q.options[0].correct).toBe(true); expect(JSON.stringify(q.options[0].content)).not.toContain('✅')
  })
  it('truncated output is an error', () => { expect(codes('## C\n```python\nx = 1')).toContain('E109') })
  it('unclosed widget is auto-closed at the next card', () => {
    const l = compile(FM + '## A\n:::quiz\nQ?\n- [x] a\n- [ ] b\n## B\ntext').lesson!
    expect(l.cards.map((c) => c.title)).toEqual(['A', 'B']); expect(l.cards[0].blocks[0].type).toBe('quiz')
  })
  it('```markdown wrapper and chat preamble are removed', () => {
    const r = compile('Sure! Here is your lesson:\n\n```markdown\n---\ntitle: X\n---\n## A\nhi\n```')
    expect(r.lesson!.title).toBe('X'); expect(r.diagnostics.map((d) => d.code)).toEqual(expect.arrayContaining(['I801']))
    expect(compile('Here you go:\n---\ntitle: Y\n---\n## A\nhi').lesson!.title).toBe('Y')
  })
  it('Obsidian syntax is converted', () => {
    const s = prose('see [[Bayes rule|Bayes]] and ![[tree.png]] %%private%%\n\n> [!tip]- Intuition\n> think in counts')
    expect(s).toContain('see Bayes and '); expect(s).toContain('"url":"tree.png"'); expect(s).not.toContain('private')
    expect(card('> [!tip]- Intuition\n> think').blocks[0]).toMatchObject({ type: 'callout', kind: 'tip', fold: true })
  })
  it('| inside math in a table row becomes \\vert', () => {
    expect(prose('| a | b |\n|---|---|\n| $P(A|B)$ | x |')).toContain('P(A\\\\vert B)')
  })
  it('hint labels with unbalanced brackets survive', () => {
    const q = card(':::quiz\nQ?\n- [x] a\n- [ ] b\n::hint[the interval $[0,1)$ matters]\n:::').blocks[0] as any
    expect(JSON.stringify(q.hints)).toContain('[0,1)')
  })
})

describe('blanks', () => {
  it('blank content is never parsed as markdown: emphasis, | inside parens, directives', () => {
    const c = card(':::cloze\nCompute {{2*3*4}} and {{P(E|H)}} at {{10:30}}.\n:::').blocks[0] as any
    expect(c.blanks.map((b: any) => b.answers)).toEqual([['2*3*4'], ['P(E|H)'], ['10:30']])
  })
  it('alternatives, tolerance and Anki form', () => {
    const c = card(':::cloze\n{{posterior|a posteriori}} {{0.0594±0.0005}} {{c1::prior::before data}}\n:::').blocks[0] as any
    expect(c.blanks[0]).toMatchObject({ kind: 'text', answers: ['posterior', 'a posteriori'] })
    expect(c.blanks[1]).toMatchObject({ kind: 'number', tol: { abs: 0.0005 } })
    expect(c.blanks[2]).toMatchObject({ answers: ['prior'], hint: 'before data' })
  })
  it('math blanks use balanced braces (Anki }} bug) and become MathLive placeholders', () => {
    const c = card(':::cloze\n$$B = {{\\frac{\\mu_0 I}{2\\pi r}}}$$\n:::').blocks[0] as any
    expect(c.blanks[0]).toMatchObject({ kind: 'math', answers: ['\\frac{\\mu_0 I}{2\\pi r}'] })
    expect(JSON.stringify(c.body)).toContain('\\\\placeholder[b0]{}')
  })
  it('a numeric answer inside math is a number blank', () => {
    const c = card(':::cloze\n$P(+) = {{0.0594}}$\n:::').blocks[0] as any
    expect(c.blanks[0].kind).toBe('number')
  })
  it('stray blanks outside cloze/steps never show the answer', () => {
    const s = prose('The {{posterior}} is updated.')
    expect(s).not.toContain('posterior'); expect(s).toContain('strayBlank')
    expect(codes('## C\nThe {{posterior}} is updated.')).toContain('W305')
  })
  it('TeX grouping {{x}} in math outside widgets is untouched', () => {
    expect(prose('$\\frac{{a}}{b}$')).toContain('\\\\frac{{a}}{b}')
  })
})

describe('fail-closed', () => {
  it('quiz without a correct option is locked, not leaked', () => {
    const b = card(':::quiz\nQ?\n- [ ] a\n- [ ] b\n:::').blocks[0]
    expect(b).toMatchObject({ type: 'unavailable', codes: ['E202'] })
  })
  it('unknown container is locked', () => {
    expect(card(':::flashcard\nanswer: 42\n:::').blocks[0]).toMatchObject({ type: 'unavailable', codes: ['E103'] })
  })
  it('stray task lists never expose checked state', () => {
    expect(prose('- [x] secret\n- [ ] other')).not.toContain('checked')
  })
  it('safe html renders, unsafe html is removed and reported; comments are silent annotations', () => {
    expect(prose('10<sup>-3</sup> <!-- fix: was 10^3 -->')).toContain('"tag":"sup"')
    expect(prose('10<sup>-3</sup> <!-- fix: was 10^3 -->')).not.toContain('fix: was')
    expect(codes('## C\n10<sup>-3</sup>')).not.toContain('E107')
    expect(codes('## C\n<script>alert(1)</script>')).toContain('E107')
    expect(codes('## C\n<b onclick="x()">hi</b>')).toContain('E107')
    expect(codes('## C\nok <!-- added: x -->')).not.toContain('E107')
  })
  it('javascript: links are neutralised', () => { expect(prose('[x](javascript:alert(1))')).toContain('"url":""') })
})

describe('frontmatter & structure', () => {
  it('maps synonyms and validates', () => {
    const r = compile('---\ntitle: T\nobjectives: [a, b]\ntime: 12 min\n---\n## C\nx')
    expect(r.lesson!.goals).toEqual(['a', 'b']); expect(r.lesson!.time).toBe(12)
  })
  it('YAML-escaped TeX in double quotes is rejected', () => {
    expect(compile('---\ntitle: T\nmacros:\n  \\R: "\\frac"\n---\n## C\nx').diagnostics.map((d) => d.code)).toContain('E101')
    expect(compile("---\ntitle: T\nmacros:\n  \\R: '\\mathbb{R}'\n---\n## C\n$\\R$").diagnostics.map((d) => d.code)).not.toContain('E701')
  })
  it('### cards are promoted when no ## exists', () => {
    const r = compile(FM + '### A\nx\n### B\ny'); expect(r.lesson!.cards).toHaveLength(2)
  })
  it('KaTeX errors and untrusted commands are reported', () => {
    expect(codes('## C\n$\\frac{a}$')).toContain('E701')
    expect(codes('## C\n$\\href{http://x}{y}$')).toContain('E703')
    expect(codes('## C\n$\\\\frac{a}{b}$')).toContain('W702')
  })
  it('stage 0 maps diagnostics to original lines', () => {
    const r = stage0('---\ntitle: T\n---\n## A\nIt costs $5.')
    expect(r.diagnostics[0]).toMatchObject({ code: 'I808', line: 5 })
  })
})

describe('time estimate', () => {
  it('adds widget minutes even when prose blocks come first', () => {
    const r = compile(FM + '## A\nSome text.\n:::explain\nWhy?\n> - because\n:::\n## B\nMore text.\n:::code\nDo it.\n```js\nx\n```\n:::')
    expect(r.lesson!.timeEstimate).toBeGreaterThanOrEqual(5)
  })
})

describe('blank edge cases from the skill evaluation', () => {
  it('a blank directly inside a TeX group: \\sqrt{{{4.08}}}', () => {
    const c = card(':::cloze\n$t = \\sqrt{{{4.08}}}$\n:::').blocks[0] as any
    expect(c.blanks[0]).toMatchObject({ kind: 'number', answers: ['4.08'] })
    expect(JSON.stringify(c.body)).toContain('\\\\sqrt{\\\\placeholder[b0]{}}')
    expect(codes('## C\n:::cloze\n$t = \\sqrt{{{4.08}}}$\n:::')).not.toContain('E701')
  })
  it('numeric alternatives are not trivial blanks', () => {
    expect(codes('## C\n:::cloze\nAbout {{30-32|30|32}} ATP.\n:::')).not.toContain('W304')
  })
})
describe('trivial blanks', () => {
  it('a short alternative next to a real word is fine; only trivial blanks warn', () => {
    expect(codes('## C\n:::cloze\nThe final acceptor is {{oxygen|O2}}.\n:::')).not.toContain('W304')
    expect(codes('## C\n:::cloze\nThis is {{the}} cell.\n:::')).toContain('W304')
  })
})

describe('review fixes (compiler)', () => {
  it('{#id} pins a widget id; identical widgets are de-duplicated', () => {
    const b = card(':::cloze{#mine}\n{{a1}} x\n:::\n:::quiz\nQ?\n- [x] a\n- [ ] b\n:::\n:::quiz\nQ?\n- [x] a\n- [ ] b\n:::').blocks as any[]
    expect(b[0].id).toBe('c/mine'); expect(b[2].id).toBe(b[1].id + '-1')
  })
  it('an unknown frontmatter key is ignored, not fatal', () => {
    const r = compile('---\ntitle: T\nauthor: me\nlevel: expert\n---\n## C\nx')
    expect(r.lesson!.title).toBe('T')
    expect(r.diagnostics.map((d) => d.code)).toEqual(expect.arrayContaining(['I817', 'E101']))
    expect(r.diagnostics.map((d) => d.code)).not.toContain('E102')
  })
  it('widgets before the first card are locked (W609)', () => {
    const r = compile(FM + ':::quiz\nQ?\n- [x] a\n- [ ] b\n:::\n## C\nx')
    expect(r.lesson!.intro[0]).toMatchObject({ type: 'unavailable', codes: ['W609'] })
  })
  it('images allow only https or relative URLs', () => {
    expect(prose('![a](http://x/y.png) ![b](https://x/y.png) ![c](img/z.png)')).toMatch(/"url":"".*"url":"https:\/\/x\/y.png".*"url":"img\/z.png"/)
  })
})
describe('card titles keep inline math for display', () => {
  it('id is the plain slug, title keeps $…$', () => {
    const c = compile(FM + '## Why $\\gamma^0$ for terrain\nx').lesson!.cards[0]
    expect(c.title).toBe('Why $\\gamma^0$ for terrain')
    expect(c.id).toBe('why-gamma0-for-terrain')
  })
})
