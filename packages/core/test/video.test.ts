import { describe, it, expect } from 'vitest'
import { compile } from '../src/compile'
import { parseDocument } from '../src/document'
import { formatTime, parseTime, parseVideoUrl } from '../src/video'
import { locate, pose } from '../src/tutor'
import type { Block, Lesson } from '../src/ast'

type Video = Extract<Block, { type: 'video' }>
const lesson = (body: string, fileExists?: (p: string) => boolean) =>
  compile(`---\ntitle: Video\n---\n## Card\n\n${body}\n`, { path: 'learn/v.learn.md', ...(fileExists ? { fileExists } : {}) })
const codes = (body: string, fileExists?: (p: string) => boolean) => lesson(body, fileExists).diagnostics.map((d) => d.code)
const videoOf = (body: string, fileExists?: (p: string) => boolean) => (lesson(body, fileExists).lesson as Lesson).cards[0].blocks.find((b): b is Video => b.type === 'video')
const QUIZ = (attrs = '') => `:::quiz${attrs}\nWhich band does Sentinel-1 use?\n- [x] C band\n- [ ] L band\n  > That is ALOS-2.\n- [ ] X band\n  > That is TerraSAR-X.\n:::`

describe('time stamps', () => {
  it('reads m:ss, h:mm:ss, plain seconds and 1m30s', () => {
    expect(parseTime('4:15')).toBe(255)
    expect(parseTime('1:02:03')).toBe(3723)
    expect(parseTime('90')).toBe(90)
    expect(parseTime('90s')).toBe(90)
    expect(parseTime('1m30s')).toBe(90)
    expect(parseTime('1h2m')).toBe(3720)
    expect(parseTime('2.5')).toBe(2.5)
  })
  it('refuses what is not a time', () => {
    for (const bad of ['', 'soon', '4:75', '-3', '1:2:3:4', 'm', '9'.repeat(400), '101h']) expect(parseTime(bad), bad.slice(0, 12)).toBeNull()
    expect(parseTime('100h')).toBe(360000)
  })
  it('writes times the way people read them', () => {
    expect(formatTime(5)).toBe('0:05')
    expect(formatTime(255)).toBe('4:15')
    expect(formatTime(3723)).toBe('1:02:03')
  })
})

describe('video addresses', () => {
  it('knows YouTube in its usual forms, with a start time', () => {
    for (const url of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ', 'https://youtube.com/embed/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'https://m.youtube.com/shorts/dQw4w9WgXcQ'])
      expect(parseVideoUrl(url)?.source, url).toEqual({ kind: 'youtube', id: 'dQw4w9WgXcQ' })
    expect(parseVideoUrl('https://youtu.be/dQw4w9WgXcQ?t=1m30s')?.start).toBe(90)
    expect(parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42')?.start).toBe(42)
  })
  it('knows Vimeo, with the hash of an unlisted video', () => {
    expect(parseVideoUrl('https://vimeo.com/76979871')?.source).toEqual({ kind: 'vimeo', id: '76979871' })
    expect(parseVideoUrl('https://vimeo.com/76979871/abcdef1234')?.source).toEqual({ kind: 'vimeo', id: '76979871', hash: 'abcdef1234' })
    expect(parseVideoUrl('https://player.vimeo.com/video/76979871?h=abcdef1234')?.source).toEqual({ kind: 'vimeo', id: '76979871', hash: 'abcdef1234' })
  })
  it('takes relative video files, and nothing else', () => {
    expect(parseVideoUrl('clips/my_clip.mp4')?.source).toEqual({ kind: 'file', path: 'clips/my_clip.mp4' })
    expect(parseVideoUrl('../media/talk.webm')?.source).toEqual({ kind: 'file', path: '../media/talk.webm' })
    for (const bad of ['https://example.com/clip.mp4', 'javascript:alert(1)//.mp4', 'file:///etc/clip.mp4', '/abs/clip.mp4', 'clip.avi', 'notes.md', 'https://www.youtube.com/watch?v=short', 'https://vimeo.com/abc'])
      expect(parseVideoUrl(bad), bad).toBeNull()
  })
})

describe('::video in a lesson', () => {
  it('compiles a local clip with its segment, title and captions, keeping the file name as written', () => {
    const v = videoOf('::video[clips/my_clip.mp4]{start=2:00 end=6:30 title="Speckle, explained" captions=clips/my_clip.vtt}', () => true)!
    expect(v).toMatchObject({ source: { kind: 'file', path: 'clips/my_clip.mp4' }, start: 120, end: 390, title: 'Speckle, explained', captions: 'clips/my_clip.vtt', checkpoints: [] })
    expect(v.id).toMatch(/^card\//)
  })
  it('compiles a YouTube link, taking its t= as the start', () => {
    expect(videoOf('::video[https://youtu.be/dQw4w9WgXcQ?t=30]')).toMatchObject({ source: { kind: 'youtube', id: 'dQw4w9WgXcQ' }, start: 30 })
  })
  it('turns a question after it with {at=…} into a checkpoint', () => {
    const r = lesson(`::video[https://youtu.be/dQw4w9WgXcQ]{end=10:00}\n\n${QUIZ('{at=4:15}')}`)
    const blocks = (r.lesson as Lesson).cards[0].blocks
    const v = blocks.find((b): b is Video => b.type === 'video')!
    const quiz = blocks.find((b) => b.type === 'quiz') as { id: string }
    expect(v.checkpoints).toEqual([{ at: 255, widget: quiz.id }])
    expect(r.diagnostics.filter((d) => d.code[0] !== 'I')).toEqual([])
  })
  it('tells a surface that cannot play it which video and time a question comes from', () => {
    const l = lesson(`::video[https://youtu.be/dQw4w9WgXcQ]{title="Speckle"}\n\n${QUIZ('{at=4:15}')}`).lesson as Lesson
    const quiz = l.cards[0].blocks.find((b) => b.type === 'quiz') as { id: string }
    expect(pose(locate([l], quiz.id)!).video).toEqual({ title: 'Speckle', at: '4:15', link: 'https://youtu.be/dQw4w9WgXcQ?t=255' })
  })
  it('reports a bad address, a missing file, a bad time and a misplaced checkpoint', () => {
    expect(codes('::video[https://example.com/clip.mp4]')).toContain('E928')
    expect(codes('::video[]')).toContain('E928')
    expect(codes('::video[gone.mp4]', () => false)).toContain('E929')
    expect(codes('::video[clip.mp4]{captions=gone.vtt}', (p) => p.endsWith('.mp4'))).toContain('E929')
    expect(codes('::video[https://youtu.be/dQw4w9WgXcQ]{start=soon}')).toContain('E930')
    expect(codes('::video[https://youtu.be/dQw4w9WgXcQ]{start=5:00 end=1:00}')).toContain('E930')
    expect(codes(`::video[https://youtu.be/dQw4w9WgXcQ]{start=1:00 end=2:00}\n\n${QUIZ('{at=3:00}')}`)).toContain('W931')
    expect(codes(QUIZ('{at=1:00}'))).toContain('W932')
    expect(codes(`::video[https://youtu.be/dQw4w9WgXcQ]{start=1:00}\n\n${QUIZ('{at=1:00}')}`)).toContain('W931') // playback starts there
    expect(codes(`::video[https://youtu.be/dQw4w9WgXcQ]\n\n${QUIZ('{at=0}')}`)).toContain('W931')
    expect(codes(`::video[https://youtu.be/dQw4w9WgXcQ]\n\n${QUIZ('{at=later}')}`)).toContain('E930')
  })
  it('suggests captions for a local clip only', () => {
    expect(codes('::video[clip.mp4]', () => true)).toContain('I933')
    expect(codes('::video[https://youtu.be/dQw4w9WgXcQ]')).not.toContain('I933')
  })
  it('keeps a video out of questions', () => {
    const r = lesson(':::quiz\nWatch first.\n\n::video[https://youtu.be/dQw4w9WgXcQ]\n\n- [x] Yes\n- [ ] No\n  > No.\n:::')
    expect(r.diagnostics.map((d) => d.code)).toContain('W918')
  })
  it('counts a clip with a known length in the time estimate', () => {
    const short = (lesson('Text.').lesson as Lesson).timeEstimate
    const long = (lesson('::video[https://youtu.be/dQw4w9WgXcQ]{start=0 end=12:00}').lesson as Lesson).timeEstimate
    expect(long - short).toBeGreaterThanOrEqual(11)
  })
})

describe('videos in any Markdown', () => {
  it('embeds a paragraph that is only a video image, and links one inside a sentence', () => {
    const d = parseDocument('# Notes\n\n![The talk](https://youtu.be/dQw4w9WgXcQ)\n\nSee ![this clip](clips/a_b.mp4) later.\n', { fileExists: () => true })
    expect(d.blocks.find((b) => b.type === 'video')).toMatchObject({ source: { kind: 'youtube', id: 'dQw4w9WgXcQ' }, title: 'The talk' })
    const text = JSON.stringify(d.blocks.filter((b) => b.type === 'prose'))
    expect(text).toContain('"value":"this clip"')
    expect(text).not.toContain('"type":"image"')
    expect(text).not.toContain('"url":"clips/a_b.mp4"') // a file in a sentence cannot play there, and a plain link to it would not open
    const online = JSON.stringify(parseDocument('See ![the talk](https://vimeo.com/76979871) later.\n').blocks)
    expect(online).toContain('"type":"link","url":"https://vimeo.com/76979871"')
  })
  it('pauses for questions in a document section, but not for those of the next section', () => {
    const d = parseDocument(`# Notes\n\n## One\n\n::video[https://youtu.be/dQw4w9WgXcQ]\n\nSome text.\n\n${QUIZ('{at=0:30}')}\n\n## Two\n\n${QUIZ('{at=0:40}')}\n`)
    const v = d.blocks.find((b) => b.type === 'video') as Video
    expect(v.checkpoints.map((c) => c.at)).toEqual([30])
    expect(d.diagnostics.map((x) => x.code)).toContain('W932')
  })
  it('compiles ::video in documents too', () => {
    const d = parseDocument('# Notes\n\n::video[https://vimeo.com/76979871]{title="A talk"}\n')
    expect(d.blocks.find((b) => b.type === 'video')).toMatchObject({ source: { kind: 'vimeo', id: '76979871' }, title: 'A talk' })
  })
})
