import { test, expect } from '@playwright/test'
import { openFolder } from './helpers'

// a real 1×1 PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

test('a document shows pictures from the web, says when one is gone, and opens them larger', async ({ page }) => {
  const refused: string[] = []
  page.on('console', (m) => { if (/Content Security Policy/.test(m.text())) refused.push(m.text()) })
  await page.route('https://pictures.example.org/**', (route) => (route.request().url().endsWith('/gone.png')
    ? route.fulfill({ status: 404, body: 'gone' })
    : route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(PNG, 'base64') })))
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/doc?path=demo%2Fweb-pictures.md`)

  const gauge = page.getByRole('img', { name: 'A tide gauge' })
  await expect(gauge).toBeVisible()
  await expect.poll(() => gauge.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0)
  await expect(gauge).toHaveAttribute('referrerpolicy', 'no-referrer')
  const html = page.getByRole('img', { name: 'A chart in HTML' })
  await expect.poll(() => html.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0)
  await expect(html).toHaveAttribute('referrerpolicy', 'no-referrer')

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
  expect(refused).toEqual([])
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
