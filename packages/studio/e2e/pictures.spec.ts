import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openFolder, testRoot } from './helpers'

// a real 1×1 PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

test('a web picture waits for a click, comes through the app, opens larger, and the choice can be taken back', async ({ page }) => {
  const refused: string[] = [], outside: string[] = []
  page.on('console', (m) => { if (/Content Security Policy/.test(m.text())) refused.push(m.text()) })
  await page.route((url) => url.hostname.endsWith('example.org'), (route) => { outside.push(route.request().url()); return route.fulfill({ status: 200, body: '' }) })
  const ws = await openFolder(page)
  writeFileSync(join(testRoot(), 'demo/more-web-pictures.md'), '# More\n\n![Another document](https://pictures.example.org/a.png?d=secret)\n')
  await page.goto(`/w/${ws}/doc?path=demo%2Fweb-pictures.md`)

  await expect(page.getByText('A tide gauge')).toBeVisible()
  await expect(page.getByRole('img', { name: 'A tide gauge' })).toHaveCount(0)
  await expect(page.getByRole('img', { name: 'A chart in HTML' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Show pictures from pictures.example.org' }).first().click()

  const gauge = page.getByRole('img', { name: 'A tide gauge' })
  await expect(gauge).toBeVisible()
  await expect.poll(() => gauge.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0)
  const html = page.getByRole('img', { name: 'A chart in HTML' })
  await expect.poll(() => html.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0)

  await expect(page.getByText('A lost picture')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open the picture' })).toHaveAttribute('href', 'https://pictures.example.org/gone.png')

  await gauge.click()
  const zoom = page.getByRole('dialog', { name: 'A tide gauge' })
  await expect(zoom).toBeVisible()
  await expect(zoom.getByText('A tide gauge')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(zoom).toBeHidden()

  await gauge.focus()
  await page.keyboard.press('Enter')
  await expect(zoom).toBeVisible()
  await zoom.click()
  await expect(zoom).toBeHidden()

  await page.reload()
  await expect(page.getByRole('img', { name: 'A tide gauge' })).toBeVisible()

  await page.goto(`/w/${ws}/doc?path=demo%2Fmore-web-pictures.md`)
  await expect(page.getByRole('button', { name: 'Show pictures from pictures.example.org' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Another document' })).toHaveCount(0)

  await page.goto(`/w/${ws}/settings`)
  await page.getByRole('button', { name: 'Forget them' }).click()
  await page.goto(`/w/${ws}/doc?path=demo%2Fweb-pictures.md`)
  await expect(page.getByRole('button', { name: 'Show pictures from pictures.example.org' }).first()).toBeVisible()
  await expect(page.getByRole('img', { name: 'A tide gauge' })).toHaveCount(0)

  expect(refused).toEqual([])
  expect(outside).toEqual([])
})

test('nothing in a document reaches the web by itself', async ({ page }) => {
  // a route only sees what really leaves the browser: a request the page policy stops never gets this far
  const outside: string[] = []
  await page.route((url) => url.hostname.endsWith('example.org'), (route) => { outside.push(route.request().url()); return route.fulfill({ status: 200, body: '' }) })
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/doc?path=demo%2Fweb-tricks.md`)
  await expect(page.getByText('A cell')).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(outside).toEqual([])
})

test('a picture pasted into the editor is saved in the folder and shows in the preview', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/edit?path=demo%2Fpicture-notes.md`)
  const source = page.getByRole('textbox', { name: /Markdown source/ })
  await source.click()
  await page.keyboard.press('Control+End')
  await source.evaluate((el, png) => {
    const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0))
    const data = new DataTransfer(); data.items.add(new File([bytes], 'screenshot.png', { type: 'image/png' }))
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, PNG)
  await expect(source).toContainText('![describe this picture](../assets/picture-notes/image')
  await page.keyboard.type('A pasted slide')
  await expect(source).toContainText('![A pasted slide](../assets/picture-notes/image')
  const shown = page.getByRole('region', { name: 'Preview' }).getByRole('img', { name: 'A pasted slide' })
  await expect.poll(() => shown.evaluate((i: HTMLImageElement) => i.naturalWidth), { timeout: 10_000 }).toBeGreaterThan(0)
})
