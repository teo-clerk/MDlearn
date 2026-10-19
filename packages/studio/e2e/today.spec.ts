import { test, expect } from '@playwright/test'
import { openFolder, resetProgress } from './helpers'

test.beforeEach(() => resetProgress())

test('Today shows the session, and a deadline turns into new cards per day', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}`)
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()
  await expect(page.getByText(/to review|new/).first()).toBeVisible()
  await expect(page.getByLabel('Reviews due in the next 7 days')).toBeVisible()
  const date = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10)
  await page.getByLabel('Date').fill(date)
  await page.getByLabel('What the deadline is for').fill('interview')
  await page.getByRole('button', { name: 'Add deadline' }).click()
  await expect(page.getByRole('region', { name: 'Your session' }).getByText(/for interview: \d+ new cards a day finishes by/)).toBeVisible()
  await page.getByRole('button', { name: 'Remove deadline' }).click()
  await expect(page.getByText(/for interview:/)).toHaveCount(0)
})
