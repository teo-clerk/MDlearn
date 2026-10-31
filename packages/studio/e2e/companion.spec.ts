import { test, expect } from '@playwright/test'
import { openFolder } from './helpers'

const pick = async (page: import('@playwright/test').Page, ws: string, name: string) => {
  await page.goto(`/w/${ws}/settings`)
  await page.getByRole('radiogroup', { name: 'Companion' }).getByRole('radio', { name }).click()
}

test('the companion is off until you choose one, and says what it shows', async ({ page }) => {
  const problems: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()) })
  page.on('pageerror', (e) => problems.push(String(e)))
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}`)
  await expect(page.locator('[data-companion]')).toHaveCount(0)

  await pick(page, ws, 'Pixel')
  const pet = page.locator('[data-companion="pixel"]')
  await expect(pet.locator('svg.pet')).toBeVisible()
  await expect(pet.getByRole('status')).toHaveText('Ready')
  await pet.getByRole('button').click()
  await expect(page.getByRole('dialog', { name: 'Right now' })).toContainText('No AI job running')
  await page.keyboard.press('Escape')

  await pick(page, ws, 'Orb')
  const orb = page.locator('[data-companion="orb"]')
  await expect(orb.locator('canvas')).toBeVisible()
  await expect(orb.getByRole('status')).toHaveText('Ready')
  expect(problems).toEqual([])
  await pick(page, ws, 'Off')
  await expect(page.locator('[data-companion]')).toHaveCount(0)
})

test('it shows real work, and leaves questions alone', async ({ page }) => {
  const ws = await openFolder(page)
  await pick(page, ws, 'Pixel')
  await page.goto(`/w/${ws}/study`)
  await expect(page.getByRole('heading').or(page.getByText(/card|question/i)).first()).toBeVisible()
  await expect(page.locator('[data-companion]')).toHaveCount(0)
  await page.goto(`/w/${ws}/exam`)
  await expect(page.locator('[data-companion]')).toHaveCount(0)
  await page.goto(`/w/${ws}/today`)
  await expect(page.locator('[data-companion]')).toBeVisible()
  await expect(page.locator('[data-companion]').getByRole('status')).toHaveText('Ready')
  await page.route(`**/api/w/${ws}/ai/jobs`, (r) => r.fulfill({ json: [{ id: 'j', ws, recipe: 'custom', title: 'Tidy the lesson', status: 'running', engine: 'x', created: 1, files: [], lint: [] }] }))
  await page.reload()
  await expect(page.locator('[data-companion]').getByRole('status')).toHaveText('Working on your lessons')
  await page.locator('[data-companion]').getByRole('button').click()
  await expect(page.getByRole('dialog', { name: 'Right now' }).getByRole('link', { name: 'Tidy the lesson' })).toBeVisible()
  await page.unroute(`**/api/w/${ws}/ai/jobs`)
  await pick(page, ws, 'Off')
})

test('it stands still under reduced motion, and stays off a phone', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const ws = await openFolder(page)
  await pick(page, ws, 'Pixel')
  await page.goto(`/w/${ws}/today`)
  const frame = page.locator('.pet-a')
  expect(await frame.evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('[data-companion]')).toBeHidden()
  await pick(page, ws, 'Off')
})
