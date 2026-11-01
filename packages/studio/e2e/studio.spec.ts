import { test, expect } from '@playwright/test'
import { openFolder } from './helpers'

test('an AI job (demo engine) writes a lesson that passes the checks, and can be undone', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/studio`)
  await page.getByRole('tab', { name: 'Something else' }).click()
  await page.getByRole('textbox', { name: 'What should Claude do?' }).fill('Write a short demo lesson')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByText('checks pass')).toBeVisible({ timeout: 20_000 })
  const file = (await page.getByRole('link', { name: /\.learn\.md$/ }).first().innerText()).trim()
  await page.getByRole('button', { name: 'Undo all changes' }).click()
  await expect(page.getByText(/^Undone:/)).toBeVisible()
  const r = await page.request.get(`/api/w/${ws}/lesson?path=${encodeURIComponent(file)}`)
  expect(r.status()).toBe(404)
})
