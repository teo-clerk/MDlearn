import { test, expect } from '@playwright/test'
import { openFolder, RADAR } from './helpers'

test('a cheat sheet collects formulas and terms, and can add key ideas', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/doc?path=demo%2Flong-sheet.md`)
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: /Cheat sheet/ }).click()
  await expect(page).toHaveURL(/sheet\?path=demo%2Flong-sheet\.md/)
  await expect(page.getByRole('heading', { name: 'Long sheet', level: 1 })).toBeVisible()
  const first = page.getByRole('region', { name: /First part/ })
  await expect(first.getByText('effective area')).toBeVisible()
  await expect(first.locator('.katex')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeVisible()
  await page.getByRole('button', { name: 'Add key ideas' }).click()
  await expect(first.getByText('Received power falls with the fourth power of range.')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Rewrite key ideas' })).toBeVisible()
})

test('the study cards of a document download as an Anki deck', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/doc?path=${encodeURIComponent(RADAR)}`)
  await page.getByRole('button', { name: 'More' }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /Export the study cards to Anki/ }).click()])
  expect(download.suggestedFilename()).toMatch(/^mdlearn-.+\.apkg$/)
  const path = await download.path()
  const { statSync } = await import('node:fs')
  expect(statSync(path).size).toBeGreaterThan(1000)
})
