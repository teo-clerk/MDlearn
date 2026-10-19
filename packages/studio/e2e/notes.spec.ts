import { test, expect } from '@playwright/test'
import { openFolder, RADAR } from './helpers'

test('select a passage, leave a note, and find it again after a reload', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/doc?path=${encodeURIComponent(RADAR)}`)
  await page.locator('article .read p').first().waitFor()
  await page.evaluate(() => {
    const p = document.querySelector('article .read p')!
    const r = document.createRange(); r.selectNodeContents(p)
    const s = window.getSelection()!; s.removeAllRanges(); s.addRange(r)
    p.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })
  await page.getByRole('toolbar', { name: 'Selected text' }).getByRole('button', { name: 'Note' }).click()
  await page.getByRole('textbox', { name: 'Your note' }).fill('Check this against the derivation.')
  await page.getByRole('button', { name: 'Save note' }).click()
  await expect(page.getByText('Check this against the derivation.')).toBeVisible()
  await page.reload()
  await page.getByRole('tab', { name: /Notes/ }).click()
  await expect(page.getByText('Check this against the derivation.')).toBeVisible()
})
