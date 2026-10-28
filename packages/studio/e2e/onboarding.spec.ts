import { test, expect } from '@playwright/test'
import { openFolder, post } from './helpers'

// First run: the welcome tour shows once; Help replays it and opens the tutorial.
test('the welcome tour shows on first run, can be skipped, and stays away', async ({ page }) => {
  await page.goto('/')
  await post(page, '/api/onboarding', { tourDone: false })
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}`)
  const tour = page.getByRole('dialog', { name: 'Welcome to MDlearn Studio' })
  await expect(tour).toBeVisible()
  await page.getByRole('button', { name: 'Show me' }).click()
  await expect(page.getByRole('dialog', { name: 'Your notes' })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('dialog', { name: 'Today' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('Help: "?" opens it, the tour replays, the tutorial opens', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}`)
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible() // the app (and its shortcuts) has started
  await page.keyboard.press('?')
  await expect(page).toHaveURL(new RegExp(`/w/${ws}/help`))
  await expect(page.getByRole('heading', { name: 'Writing interactive notes' })).toBeVisible()
  await page.getByRole('button', { name: 'Replay the tour' }).click()
  await expect(page.getByRole('dialog', { name: 'Welcome to MDlearn Studio' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.goto(`/w/${ws}/help`)
  await page.getByRole('button', { name: 'Open the tutorial' }).click()
  await expect(page.getByRole('heading', { name: /Start here/, level: 1 })).toBeVisible()
  await expect(page.locator('nav[aria-label="Path"]')).toContainText('MDlearn Tutorial')
})
