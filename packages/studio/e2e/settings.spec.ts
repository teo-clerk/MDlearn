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

test('Local AI: a recommended model is downloaded with progress, used, set aside, and removed', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/settings#local-ai`)
  const section = page.locator('#local-ai')
  await expect(section.getByText(/This computer:/)).toBeVisible()
  await expect(section.getByText('Ollama 0.17.4')).toBeVisible()
  const row = section.getByRole('listitem').filter({ hasText: 'qwen3:4b' })
  await expect(row).toContainText('Light: good answers on a computer with 8 GB of memory.')
  await row.getByRole('button', { name: 'Download' }).click()
  await expect(section.getByRole('progressbar', { name: 'Download progress' })).toBeVisible()
  await expect(section.getByText(/Downloading qwen3:4b/)).toBeVisible()
  await row.getByRole('button', { name: 'Use' }).click({ timeout: 10_000 })
  const inUse = section.getByRole('radiogroup', { name: 'The model Studio answers with' })
  await expect(inUse.getByRole('radio', { name: /qwen3:4b/ })).toBeChecked()
  await expect(row.getByText('In use')).toBeVisible()
  // back to the default, then the downloaded model goes
  await inUse.getByRole('radio', { name: /qwen3:8b/ }).click()
  await expect(inUse.getByRole('radio', { name: /qwen3:8b/ })).toBeChecked()
  page.once('dialog', (d) => void d.accept())
  await section.getByRole('button', { name: 'Remove qwen3:4b' }).click()
  await expect(inUse.getByRole('radio', { name: /qwen3:4b/ })).toHaveCount(0)
  await expect(row.getByRole('button', { name: 'Download' })).toBeVisible()
  await expect(inUse.getByRole('radio')).not.toHaveCount(0)
  await expect(section.getByText(/embeddinggemma/)).toHaveCount(0) // the search model is not a choice for answers
})
