import { test, expect } from '@playwright/test'
import { openFolder } from './helpers'

test('Python blocks run in the browser and share variables', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/doc?path=demo%2Fpython.md`)
  const blocks = page.locator('figure[data-py]')
  await blocks.nth(0).getByRole('button', { name: 'Run this block' }).click()
  await expect(blocks.nth(0).getByText('42', { exact: true })).toBeVisible({ timeout: 90_000 })
  await blocks.nth(1).getByRole('button', { name: 'Run this block' }).click()
  await expect(blocks.nth(1).getByText('82', { exact: true })).toBeVisible()
})

test('a runaway Python block is stopped and the interpreter restarts', async ({ page }) => {
  test.setTimeout(120_000)
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/doc?path=demo%2Fpython.md`)
  const blocks = page.locator('figure[data-py]')
  await blocks.nth(2).getByRole('button', { name: 'Run this block' }).click()
  await expect(blocks.nth(2).getByRole('alert')).toContainText('Python was restarted', { timeout: 60_000 })
  await blocks.nth(0).getByRole('button', { name: 'Run this block' }).click()
  await expect(blocks.nth(0).getByText('42', { exact: true })).toBeVisible({ timeout: 60_000 })
})

test('a Python exercise is graded by the checks that pass in the browser', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/lesson?path=${encodeURIComponent('learn/02-bayes-theorem.learn.md')}`)
  const exercise = page.getByRole('region', { name: 'Exercise' })
  await exercise.scrollIntoViewIfNeeded()
  const box = exercise.getByRole('textbox', { name: /python code/i })
  await box.fill('def posterior(prior, sens, fpr):\n    return 0.5')
  await exercise.getByRole('button', { name: 'Check' }).click()
  await expect(exercise.getByText(/\d of 3 checks pass/)).toBeVisible({ timeout: 90_000 })
  await expect(exercise.locator('code', { hasText: 'assert' }).first()).toBeVisible()
  await exercise.getByRole('button', { name: 'Try again' }).click()
  await exercise.getByRole('textbox', { name: /python code/i }).fill('def posterior(prior, sens, fpr):\n    hit = sens * prior\n    return hit / (hit + fpr * (1 - prior))')
  await exercise.getByRole('button', { name: 'Check' }).click()
  await expect(exercise.getByText('All 3 checks pass.')).toBeVisible({ timeout: 60_000 })
})
