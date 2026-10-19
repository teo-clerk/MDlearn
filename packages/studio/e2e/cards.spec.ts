import { test, expect } from '@playwright/test'
import { openFolder, resetProgress, RADAR } from './helpers'

test.beforeEach(() => resetProgress())

test('select a passage, hide a word, and the card joins your study queue', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/doc?path=${encodeURIComponent(RADAR)}`)
  await page.locator('article .read p').first().waitFor()
  await page.evaluate(() => {
    const p = [...document.querySelectorAll('article .read p')].find((x) => /received power falls/i.test(x.textContent ?? ''))!
    const r = document.createRange(); r.selectNodeContents(p)
    const s = window.getSelection()!; s.removeAllRanges(); s.addRange(r)
    p.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })
  await page.getByRole('toolbar', { name: 'Selected text' }).getByRole('button', { name: 'Card' }).click()
  await expect(page.getByRole('group', { name: 'Passage' })).toBeVisible()
  await page.getByRole('group', { name: 'Passage' }).getByRole('button', { name: 'falls' }).click()
  await expect(page.getByText('1 blank')).toBeVisible()
  await page.getByRole('textbox', { name: 'Card title' }).fill('My range card')
  await page.getByRole('button', { name: 'Save card' }).click()
  await expect(page.getByText('Card saved')).toBeVisible()
  const plan = await page.request.get(`/api/w/${ws}/study/queue?limit=50&newCards=20`).then((r) => r.json() as Promise<{ items: { cardTitle: string }[] }>)
  expect(plan.items.map((i) => i.cardTitle)).toContain('My range card')
})
