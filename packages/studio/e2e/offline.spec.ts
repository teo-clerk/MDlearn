import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { openFolder, resetProgress, testRoot } from './helpers'

test.beforeEach(() => resetProgress())

test('a pack is studied with no connection, and the answers reach the computer when it is back', async ({ page, context }) => {
  const ws = await openFolder(page)
  await page.goto(`/offline/${ws}`)
  await page.getByRole('radio', { name: '1 day' }).click()
  await page.getByRole('button', { name: 'Take offline' }).click()
  await expect(page.getByRole('heading', { name: /^\d+ cards? now$/ })).toBeVisible()

  await context.setOffline(true)
  await expect(page.getByRole('status').filter({ hasText: 'No connection' })).toBeVisible()
  const card = page.getByRole('article')
  await card.getByRole('button', { name: 'I don’t know, show me' }).click()
  const selfCheck = card.getByRole('button', { name: 'Missed it' })
  if (await selfCheck.isVisible().catch(() => false)) await selfCheck.click() // an explanation: you rate yourself
  await expect(card.getByText(/^again$/)).toBeVisible() // marked and rated on the device
  await expect(page.getByText('1 answer to sync')).toBeVisible()
  await card.getByRole('button', { name: 'Continue' }).click()

  await context.setOffline(false)
  await expect(page.getByRole('status').filter({ hasText: 'Synced' })).toBeVisible()
  const progress = JSON.parse(readFileSync(join(testRoot(), 'learn/.mdlearn/progress.json'), 'utf8')) as { reviews: { id: string; rating: number }[] }
  expect(progress.reviews).toEqual([expect.objectContaining({ id: expect.stringMatching(/^off:/), rating: 1 })])

  // the pack stays on the device: the home-screen address opens it again
  await page.goto('/offline')
  await expect(page).toHaveURL(new RegExp(`/offline/${ws}$`))
  await expect(page.getByRole('heading', { name: /cards? now$|^Done for now$/ })).toBeVisible()
  await page.getByRole('button', { name: 'Remove from this device' }).click()
  await expect(page.getByRole('button', { name: 'Take offline' })).toBeVisible()
})

test('the page can be added to a home screen', async ({ page }) => {
  const r = await page.request.get('/manifest.webmanifest')
  expect(r.headers()['content-type']).toBe('application/manifest+json')
  expect(await r.json()).toMatchObject({ start_url: '/offline', display: 'standalone' })
  expect((await page.request.get('/icon-192.png')).headers()['content-type']).toBe('image/png')
})
