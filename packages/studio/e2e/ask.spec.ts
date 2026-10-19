import { test, expect } from '@playwright/test'
import { openFolder } from './helpers'

test('ask the whole folder: an answer with its sources, which open in their document', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/ask`)
  await expect(page.getByRole('heading', { name: 'Ask', level: 1 })).toBeVisible()
  await page.getByLabel('Your question').fill('What does backscatter mean for a radar?')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  const answer = page.getByRole('article', { name: 'What does backscatter mean for a radar?' })
  await expect(answer.getByText('Backscatter is the power returned toward the radar').first()).toBeVisible({ timeout: 20_000 })
  const source = answer.getByRole('list', { name: 'Sources' }).getByRole('link', { name: /Radar terms/ })
  await expect(source).toBeVisible()
  // the answer is still there after a reload (history)
  await page.reload()
  await expect(page.getByRole('article', { name: 'What does backscatter mean for a radar?' })).toBeVisible()
  await page.getByRole('list', { name: 'Sources' }).getByRole('link', { name: /Radar terms/ }).click()
  await expect(page).toHaveURL(/doc\?path=demo%2Fradar-terms\.md/)
})

test('an answer can be kept as a note on the passage, and the palette hands over a question', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/ask?q=${encodeURIComponent('Explain backscatter and roughness to me')}`)
  const answer = page.getByRole('article', { name: 'Explain backscatter and roughness to me' })
  await expect(answer.getByText('Backscatter is the power returned').first()).toBeVisible({ timeout: 20_000 })
  await answer.getByRole('button', { name: 'Keep this answer as a note on this passage' }).first().click()
  await expect(answer.getByRole('button', { name: 'Saved as a note' })).toBeVisible()
  await page.goto(`/w/${ws}/doc?path=demo%2Fradar-terms.md`)
  await page.getByRole('tab', { name: /^Notes/ }).click()
  await expect(page.getByText('Explain backscatter and roughness to me').first()).toBeVisible()
})
