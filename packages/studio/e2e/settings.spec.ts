import { test, expect } from '@playwright/test'
import { openFolder } from './helpers'
import { accentTokens, contrast } from '../web/lib/accent'

// Settings → Language and Appearance: per device, applied before the first paint, kept across reloads.
const cssVar = (page: import('@playwright/test').Page, name: string) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name)

test('the interface switches to Italian and stays Italian after a reload', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/settings`)
  await page.getByRole('radiogroup', { name: 'Language' }).getByRole('radio', { name: 'Italiano' }).click()
  await expect(page.getByRole('heading', { name: 'Impostazioni', level: 1 })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'it')
  await page.reload()
  await expect(page.getByRole('link', { name: 'Oggi' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Italiano' })).toHaveAttribute('aria-checked', 'true')
  // the command palette, a server error and the help page are Italian too
  await page.keyboard.press('Control+k')
  await expect(page.getByPlaceholder('Cerca documenti, lezioni e testo…')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.goto(`/w/${ws}/doc?path=${encodeURIComponent('.secret/x.md')}`)
  await expect(page.getByRole('alert')).toHaveText(/Quel file è fuori da questa cartella o non è un file Markdown\./)
  await page.goto(`/w/${ws}/help`)
  await expect(page.getByRole('heading', { name: 'Come funziona MDlearn' })).toBeVisible()
})

test('an accent colour recolours buttons and focus in both themes, readably, and survives a reload', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/settings`)
  const before = await cssVar(page, '--accent')
  await page.getByRole('radio', { name: 'Light', exact: true }).click()
  await page.getByRole('radio', { name: 'Blue' }).click()
  const light = accentTokens('blue', 'light')!
  await expect.poll(() => cssVar(page, '--accent')).toBe(light.accent)
  expect(light.accent).not.toBe(before)
  expect(contrast(light['on-accent'], light.accent)).toBeGreaterThanOrEqual(4.5)
  await page.getByRole('radio', { name: 'Dark', exact: true }).click()
  const dark = accentTokens('blue', 'dark')!
  await expect.poll(() => cssVar(page, '--accent')).toBe(dark.accent)
  expect(await cssVar(page, '--focus')).toBe(dark.focus)
  await page.reload()
  await expect.poll(() => cssVar(page, '--accent')).toBe(dark.accent) // theme.js applies it before React runs
  // a hand-picked colour, then back to graphite (the stylesheet default)
  await page.getByLabel('Custom colour').fill('#d63384')
  await expect.poll(() => cssVar(page, '--accent')).toBe(accentTokens('#d63384', 'dark')!.accent)
  await page.getByRole('radio', { name: 'Graphite' }).click()
  await expect.poll(() => cssVar(page, '--accent')).toBe('#e7e6e2')
})
