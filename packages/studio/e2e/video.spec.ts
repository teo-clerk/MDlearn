import { test, expect } from '@playwright/test'
import { openFolder } from './helpers'

const DOC = 'demo%2Fvideo.md'

test('a local clip pauses for its question, then a note goes back to its moment', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/doc?path=${DOC}`)
  const player = page.locator('figure[data-video]').first()
  const video = player.locator('video')
  await expect(player.getByText('Blue clip')).toBeVisible()
  await expect(video).toHaveAttribute('src', /asset\?path=demo%2Fclips%2Fclip\.webm$/)
  // the question waits for its moment: only its chip is shown
  await expect(page.getByText('Which colour fills the screen?')).toHaveCount(0)
  await expect(player.getByRole('button', { name: 'Question at 0:02' })).toBeVisible()

  await video.evaluate((v: HTMLVideoElement) => { v.muted = true; return v.play() })
  const panel = page.getByRole('group', { name: 'Question at 0:02' })
  await expect(panel.getByText('The video paused here for a question.')).toBeVisible({ timeout: 10_000 })
  await expect(panel).toBeFocused()
  const paused = await video.evaluate((v: HTMLVideoElement) => ({ paused: v.paused, t: v.currentTime }))
  expect(paused.paused).toBe(true)
  expect(paused.t).toBeGreaterThanOrEqual(2)
  expect(paused.t).toBeLessThan(3.5)

  await panel.getByRole('radio', { name: /Blue/ }).click()
  await panel.getByRole('button', { name: 'Check' }).click()
  await expect(panel.getByText('Right')).toBeVisible()
  await panel.getByRole('button', { name: 'Continue the video' }).click()
  await expect(panel).toHaveCount(0)
  await expect.poll(() => video.evaluate((v: HTMLVideoElement, from) => !v.paused && v.currentTime > from, paused.t)).toBe(true) // playing again

  // a note on the current moment, then back to it
  await video.evaluate((v: HTMLVideoElement) => { v.currentTime = 4 })
  await player.getByRole('button', { name: /^Note at 0:0[34]$/ }).click()
  await page.getByRole('textbox', { name: 'Your note' }).fill('The colour never changes.')
  await page.getByRole('button', { name: 'Save note' }).click()
  await expect(page.getByText('The colour never changes.')).toBeVisible()
  await video.evaluate((v: HTMLVideoElement) => { v.pause(); v.currentTime = 0 })
  await page.getByRole('button', { name: /^Play the video from 0:0[34]$/ }).click()
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThanOrEqual(3)
})

test('captions and seeking work: the clip is served in ranges', async ({ page }) => {
  const ws = await openFolder(page)
  const r = await page.request.get(`/api/w/${ws}/asset?path=demo%2Fclips%2Fclip.webm`, { headers: { range: 'bytes=0-99' } })
  expect(r.status()).toBe(206)
  expect(r.headers()['content-range']).toMatch(/^bytes 0-99\/\d+$/)
  await page.goto(`/w/${ws}/doc?path=${DOC}`)
  const track = page.locator('figure[data-video] video track')
  await expect(track).toHaveAttribute('kind', 'captions')
  await expect.poll(() => track.evaluate((el: HTMLTrackElement) => el.readyState)).toBe(2) // loaded
})

test('a YouTube video loads nothing from YouTube until Play', async ({ page }) => {
  const contacted: string[] = []
  await page.route(/youtube|ytimg|googlevideo/, (route) => { contacted.push(route.request().url()); return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>player</title>' }) })
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/doc?path=${DOC}`)
  const player = page.locator('figure[data-video]').nth(1)
  await expect(player.getByText('Plays from YouTube. Nothing is loaded from YouTube until you press Play.')).toBeVisible()
  await expect(player.locator('iframe')).toHaveCount(0)
  await expect(player.getByRole('link', { name: 'Open on YouTube' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=60s')
  expect(contacted).toEqual([])
  await player.getByRole('button', { name: 'Play' }).click()
  const frame = player.locator('iframe')
  await expect(frame).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?.*start=60&end=120/)
  await expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
  await expect.poll(() => contacted.length).toBeGreaterThan(0)
  expect(contacted.every((u) => u.startsWith('https://www.youtube-nocookie.com/'))).toBe(true)
})
