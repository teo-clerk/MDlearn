import { test, expect } from '@playwright/test'
import { openFolder } from './helpers'

test('plot, formula, animation and a runaway simulation', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/doc?path=demo%2Fvisuals.md`)
  const curve = page.locator('figure svg path').first()
  await expect(curve).toBeVisible()
  const before = await curve.getAttribute('d')
  const slider = page.getByRole('slider').first()
  await slider.focus()
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowRight')
  expect(await curve.getAttribute('d')).not.toBe(before)
  await page.getByRole('button', { name: /speed of light/ }).hover()
  await expect(page.locator('.formula-explained')).toHaveAttribute('data-active', '1')
  await page.getByRole('button', { name: 'Next step' }).click()
  await expect(page.locator('span.tabular', { hasText: /^Step/ })).toHaveText('Step 2 of 2')
  await expect(page.getByText('stopped responding')).toBeVisible({ timeout: 15_000 })
  expect(await page.evaluate(() => 21 * 2)).toBe(42) // the page itself stayed responsive
})
