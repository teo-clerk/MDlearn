import { test, expect } from '@playwright/test'
import { openFolder, RADAR } from './helpers'

test('a math-heavy document renders: headings with numbers, formulas, no raw TeX', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/doc?path=${encodeURIComponent(RADAR)}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('h2[data-num="2"]')).toContainText('radar equation')
  await page.waitForFunction(() => document.querySelectorAll('.katex').length > 0)
  const raw = await page.locator('article .read').evaluate((el) => /\$\$/.test(el.textContent ?? ''))
  expect(raw).toBe(false)
})

test('search jumps to a section', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard shortcut')
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}`)
  await page.keyboard.press('Control+k')
  await page.getByRole('combobox', { name: 'Search' }).fill('radar equation')
  await page.getByRole('option').filter({ hasText: /^§/ }).first().click()
  await expect(page).toHaveURL(/\/doc\?path=/)
})

test('the source view shows the Markdown with line numbers', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop toolbar')
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/doc?path=${encodeURIComponent(RADAR)}`)
  await page.getByRole('button', { name: 'Show Markdown source' }).click()
  await expect(page.getByLabel('Markdown source')).toContainText('# 04. Radar Basics')
})
