import { describe, it, expect } from 'vitest'
import { splitBundle, safeBundlePath, fixMessage, coursePrompt, compile } from '../src/index.js'
import { MAX_BUNDLE_FILES } from '../src/authoring.js'

const LESSON = (title: string) => `---\ntitle: ${title}\nlevel: beginner\n---\n\n## A card\n\nText.\n`

describe('chat bundles', () => {
  it('splits files after `<!-- file: -->` lines, inside fences, and ignores the chat around them', () => {
    const answer = `Here is your course!

<!-- file: tides/course.md -->
~~~~markdown
# Tides
~~~~

<!-- file: tides/01-why-tides.learn.md -->
~~~~markdown
${LESSON('Why tides')}
:::code
Write \`f\`.
\`\`\`python
def f(): ...
\`\`\`
\`\`\`python test
assert f() is None
\`\`\`
:::
~~~~
Hope this helps.`
    const files = splitBundle(answer)
    expect(files.map((f) => f.path)).toEqual(['tides/course.md', 'tides/01-why-tides.learn.md'])
    expect(files[1].content).toContain('```python test') // code fences inside the file survive
    expect(files[1].content).not.toContain('~~~~')
    expect(files[1].content).not.toContain('Hope this helps')
  })
  it('takes the last closing fence when the chat wrapped a file in the same backtick fence it uses inside', () => {
    const files = splitBundle('<!-- file: a.learn.md -->\n```markdown\n---\ntitle: A\n---\n## C\n```js\nx\n```\n```\n')
    expect(files[0].content).toContain('```js\nx\n```')
  })
  it('reads raw files between markers and a lone lesson without markers', () => {
    expect(splitBundle(`<!-- file: one.learn.md -->\n${LESSON('One')}\n<!-- file: two.md -->\n${LESSON('Two')}`).map((f) => f.path)).toEqual(['one.learn.md', 'two.learn.md'])
    expect(splitBundle(LESSON('Plate Tectonics 101'))).toMatchObject([{ path: 'plate-tectonics-101.learn.md' }])
  })
  it('keeps paths inside the folder and makes them lessons', () => {
    expect(safeBundlePath('../etc/passwd')).toBeNull()
    expect(safeBundlePath('/abs/x.learn.md')).toBe('abs/x.learn.md')
    expect(safeBundlePath('C:\\notes\\Intro Lesson.md')).toBe('C-/notes/Intro-Lesson.learn.md')
    expect(safeBundlePath('`intro`')).toBe('intro.learn.md')
    expect(safeBundlePath('a/b/c/d/e.learn.md')).toBeNull()
    expect(splitBundle(`<!-- file: x.learn.md -->\n${LESSON('A')}\n<!-- file: x.learn.md -->\n${LESSON('B')}`).map((f) => f.path)).toEqual(['x.learn.md', 'x-2.learn.md'])
  })
  it('stays fast on hostile input: no backtracking on long lines, a cap on the number of files', () => {
    const spaces = ' '.repeat(400_000)
    for (const evil of [`<!-- file: a${spaces}x\n${LESSON('A')}`, `title:${spaces}x\n## A`, `<!-- file: a.learn.md -->\n\`\`\`${spaces}x\n${LESSON('A')}`]) {
      const t0 = performance.now()
      splitBundle(evil)
      expect(performance.now() - t0).toBeLessThan(500)
    }
    const many = (n: number) => Array.from({ length: n }, () => `<!-- file: a.learn.md -->\n${LESSON('A')}`).join('\n')
    const t0 = performance.now()
    expect(splitBundle(many(MAX_BUNDLE_FILES)).at(-1)!.path).toBe(`a-${MAX_BUNDLE_FILES}.learn.md`)
    expect(performance.now() - t0).toBeLessThan(500)
    expect(() => splitBundle(many(MAX_BUNDLE_FILES + 1))).toThrow(/at most 100/)
  })
  it('asks the chat to fix only the flagged lines', () => {
    const bad = compile('---\ntitle: T\n---\n## A\n:::quiz\nQ?\n- [ ] a\n- [ ] b\n:::\n')
    const msg = fixMessage([{ path: 'a.learn.md', diagnostics: bad.diagnostics }, { path: 'ok.learn.md', diagnostics: [] }])
    expect(msg).toMatch(/Fix only the lines named/)
    expect(msg).toContain('<!-- file: a.learn.md -->')
    expect(msg).toMatch(/- \d+:\d+ E\d+/)
    expect(msg).not.toContain('ok.learn.md')
    expect(fixMessage([{ path: 'ok.learn.md', diagnostics: [] }])).toBe('')
  })
})

describe('course prompt', () => {
  it('works with and without notes, and names the right way to save', () => {
    const none = coursePrompt({ topic: 'Tides', minutes: 30 })
    expect(none).toMatch(/no notes/)
    expect(none).toMatch(/save_lesson/)
    expect(none).toContain('tides/01-slug.learn.md')
    const notes = coursePrompt({ topic: 'Tides', notes: 'notes/tides.md', save: 'write', language: 'Italian' })
    expect(notes).toMatch(/notes\/tides\.md/)
    expect(notes).toMatch(/lint_lesson/)
    expect(notes).toMatch(/Italian/)
  })
  it('holds a course to the language asked for, and to the language of its material otherwise', () => {
    expect(coursePrompt({ topic: 'Tides', classFiles: 'sources', language: 'Spanish' })).toContain('Write everything in Spanish, whatever language the sources are in')
    expect(coursePrompt({ topic: 'Tides', language: 'Spanish' })).toContain('Write everything in Spanish')
    expect(coursePrompt({ topic: 'Tides', classFiles: 'sources' })).toContain('Write in the language of the files')
    expect(coursePrompt({ topic: 'Tides' })).toContain('Write in the language of this request')
  })
})
