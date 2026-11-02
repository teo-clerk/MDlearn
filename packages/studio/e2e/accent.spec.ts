import { expect, test } from '@playwright/test'
import { openFolder } from './helpers'

// The accent is a promise: pick a colour and the app wears it. These read what the browser paints, not the settings.
const css = (el: import('@playwright/test').Locator, prop: string) => el.evaluate((n, p) => getComputedStyle(n).getPropertyValue(p), prop)
const channels = (color: string) => (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
const isRose = (color: string) => { const [r, g, b] = channels(color); return r > g + 20 && r > b + 10 }

test('an accent colour reaches the interface, stays after a reload and can be undone', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}`)
  const today = page.getByRole('link', { name: 'Today' })
  const graphite = await css(today, 'background-color')

  await page.goto(`/w/${ws}/settings`)
  const accents = page.getByRole('radiogroup', { name: 'Accent colour' })
  await accents.getByRole('radio', { name: 'Rose' }).click()
  await expect.poll(() => css(page.getByRole('radio', { name: 'Match system', exact: true }), 'border-top-color').then(isRose)).toBe(true)
  expect(await css(page.getByRole('checkbox', { name: /Colour in notes/ }), 'accent-color').then(isRose)).toBe(true)

  await page.goto(`/w/${ws}`)
  await expect.poll(() => css(today, 'background-color')).not.toBe(graphite)
  expect(isRose(await css(today, 'background-color'))).toBe(true)
  expect(isRose(await css(today.locator('svg'), 'color'))).toBe(true)

  await page.reload()
  await expect.poll(() => css(today, 'background-color').then(isRose)).toBe(true)

  await page.getByRole('radio', { name: 'Theme: Dark' }).click()
  await expect.poll(() => css(today, 'background-color').then(isRose)).toBe(true)
  await page.getByRole('radio', { name: 'Theme: Light' }).click()

  await page.goto(`/w/${ws}/settings`)
  await accents.getByRole('radio', { name: 'Graphite' }).click()
  await page.goto(`/w/${ws}`)
  await expect.poll(() => css(today, 'background-color')).toBe(graphite)
})

test('the main button on the start page wears the accent', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => { localStorage.setItem('mdl-accent', '#b95568'); localStorage.setItem('mdl-accent-vars', JSON.stringify({ '--accent-l': '#b95568', '--accent-d': '#e27a8c', '--on-accent-l': '#ffffff', '--on-accent-d': '#191919' })) })
  await page.reload()
  const start = page.getByRole('link', { name: /Make a course/ })
  await expect.poll(() => css(start, 'background-color').then(isRose)).toBe(true)
})
