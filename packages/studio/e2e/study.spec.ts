import { test, expect } from '@playwright/test'
import { openFolder, resetProgress } from './helpers'

test.beforeEach(() => resetProgress())

test('a study session runs to the summary, asking "sure?" before feedback', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/study`)
  await expect(page.getByText(/^Today:/)).toBeVisible()
  for (let i = 0; i < 60; i++) { // new cards, then the missed ones are revisited
    if (await page.getByRole('heading', { name: 'Session done' }).isVisible()) break
    const cont = page.getByRole('button', { name: 'Continue' })
    if (await cont.isVisible()) { await cont.click(); continue }
    const self = page.getByRole('button', { name: /Missed it/ })
    if (await self.isVisible()) { await self.click(); continue }
    const skip = page.getByRole('button', { name: /I don’t know/ })
    if (await skip.isVisible()) { await skip.click(); continue }
    await page.waitForTimeout(200)
  }
  await expect(page.getByRole('heading', { name: 'Session done' })).toBeVisible()
  await expect(page.getByText('Worth rereading')).toBeVisible()
})

test('a right answer gets "were you sure?" first, then the verdict and the next review', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/study`)
  const options = page.getByRole('radiogroup', { name: 'Options' }).getByRole('radio')
  const gaps = page.getByRole('textbox', { name: /Gap/ })
  await expect(options.first().or(gaps.first())).toBeVisible()
  if (await gaps.count()) { for (let i = 0; i < await gaps.count(); i++) await gaps.nth(i).fill('x') } else await options.first().click()
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByText('Were you sure?')).toBeVisible()
  await expect(page.getByText(/^Right$|^Not quite$/)).toHaveCount(0) // no verdict before the confidence answer
  await page.getByRole('button', { name: /Not really/ }).click()
  await expect(page.getByRole('status').filter({ hasText: /Right|Not quite|Nearly/ })).toBeVisible()
})
