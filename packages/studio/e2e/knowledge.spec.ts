import { test, expect } from '@playwright/test'
import { openFolder } from './helpers'

test('the formula sheet lists formulas, searches them and opens them in context', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/formulas`)
  await expect(page.getByRole('heading', { name: 'Formulas', level: 1 })).toBeVisible()
  await expect(page.getByText(/\d+ formulas? in this folder/)).toBeVisible({ timeout: 20_000 })
  await page.getByLabel('Search formulas').fill('received power')
  const card = page.getByRole('listitem').filter({ hasText: 'Radar terms' }).first()
  await expect(card).toBeVisible()
  await expect(page.getByText(/\d+ formulas? match/)).toBeVisible()
  await card.getByRole('link', { name: 'Open in the document' }).click()
  await expect(page).toHaveURL(/doc\?path=demo%2Fradar-terms\.md/)
  await expect(page.getByRole('heading', { name: /Basics/ })).toBeVisible()
})

test('the glossary shows definitions with their source', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/glossary`)
  const term = page.getByRole('term').filter({ hasText: 'Backscatter' })
  await expect(term).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('definition').filter({ hasText: 'power returned toward the radar' })).toBeVisible()
  await page.getByLabel('Search the glossary').fill('zzzzzz')
  await expect(page.getByText('No term matches')).toBeVisible()
})

test('a defined term is underlined once per document and explained on hover', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/doc?path=demo%2Fradar-terms.md`)
  const terms = page.locator('.read .term')
  await expect(terms.first()).toBeVisible({ timeout: 20_000 })
  // defined in section 1 and not underlined where defined: its next mention is underlined, once for the whole document
  await expect(terms).toHaveCount(1)
  await terms.first().hover()
  await expect(page.getByRole('tooltip')).toContainText('power returned toward the radar', { timeout: 5000 })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: /Stop underlining defined terms/ }).click()
  await expect(terms).toHaveCount(0)
})

test('links tab shows what a document points to and what points to it, and links preview on hover', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/doc?path=demo%2Fvisuals.md`)
  await page.getByRole('tab', { name: /^Links/ }).click()
  await expect(page.getByRole('region', { name: 'Pointed to by' }).getByText('Radar terms')).toBeVisible({ timeout: 20_000 })
  await page.goto(`/w/${ws}/doc?path=demo%2Fradar-terms.md`)
  await page.getByRole('link', { name: 'the visuals' }).hover()
  await expect(page.getByRole('tooltip')).toContainText('Visuals', { timeout: 5000 })
})

test('the map shows what a document builds on and what surrounds it', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/doc?path=demo%2Fradar-terms.md`)
  await page.getByRole('tab', { name: /^Links/ }).click()
  await page.getByRole('link', { name: 'Show on the map' }).click()
  await expect(page).toHaveURL(/map\?doc=demo%2Fradar-terms\.md/)
  await expect(page.getByText(/Around/)).toBeVisible()
  await page.getByLabel('Include links').check()
  await expect(page.getByRole('link', { name: /Visuals/ })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('link', { name: 'Whole folder' }).click()
  await expect(page.getByRole('heading', { name: 'Map', level: 1 })).toBeVisible()
  await expect(page.getByLabel('Include links')).toHaveCount(0)
})
