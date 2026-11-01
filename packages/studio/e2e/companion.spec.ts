import { test, expect } from '@playwright/test'
import { openFolder } from './helpers'

const pick = async (page: import('@playwright/test').Page, ws: string, name: string) => {
  await page.goto(`/w/${ws}/settings`)
  await page.getByRole('radiogroup', { name: 'Companion' }).getByRole('radio', { name }).click()
}

test('the companion is there from the start, says what it shows, and stays off once you turn it off', async ({ page }) => {
  const problems: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()) })
  page.on('pageerror', (e) => problems.push(String(e)))
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}`)
  await expect(page.locator('[data-companion="pixel"]')).toBeVisible()
  await expect(page.locator('[data-companion]').getByRole('button').first()).toHaveAttribute('title', 'Ask about your course')
  await expect(page.locator('[data-companion]').getByRole('status')).toHaveAttribute('aria-live', 'off') // it is on for everyone: a screen reader should not hear each change

  await pick(page, ws, 'Pixel')
  const pet = page.locator('[data-companion="pixel"]')
  await expect(pet.locator('svg.pet')).toBeVisible()
  await expect(pet.getByRole('status')).toHaveText('Ready')
  await pet.getByRole('button').click()
  await expect(page.getByRole('dialog', { name: 'Companion' })).toContainText('No AI job running')
  await page.keyboard.press('Escape')

  await pick(page, ws, 'Orb')
  const orb = page.locator('[data-companion="orb"]')
  await expect(orb.locator('canvas')).toBeVisible()
  await expect(orb.getByRole('status')).toHaveText('Ready')
  expect(problems).toEqual([])
  await pick(page, ws, 'Off')
  await expect(page.locator('[data-companion]')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('radiogroup', { name: 'Companion' })).toBeVisible()
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
  await expect(page.getByRole('dialog', { name: 'Companion' }).getByRole('link', { name: 'Tidy the lesson' })).toBeVisible()
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

test('you can ask it about your course, and it keeps the conversation while you read', async ({ page }) => {
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(String(e)))
  const ws = await openFolder(page)
  await pick(page, ws, 'Pixel')
  await page.goto(`/w/${ws}/doc?path=demo%2Fradar-terms.md`)
  const toggle = page.locator('[data-companion]').getByRole('button').first()
  await toggle.click()
  const panel = page.getByRole('dialog', { name: 'Companion' })
  const field = panel.getByLabel('Your question')
  await expect(field).toBeFocused()
  await field.fill('What does backscatter mean for a radar?')
  await page.keyboard.press('Enter')
  const answer = panel.getByRole('article', { name: 'What does backscatter mean for a radar?' })
  await expect(answer.getByText('Backscatter is the power returned').first()).toBeVisible({ timeout: 20_000 })
  await expect(answer.getByRole('list', { name: 'Sources' }).getByRole('link', { name: /Radar terms/ })).toBeVisible()
  await expect(field).toBeFocused()
  await expect(field).toHaveValue('')

  // it stays out of the way, and the conversation is there when you come back
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(toggle).toBeFocused()
  await toggle.click()
  await expect(answer).toBeVisible()
  await panel.getByRole('button', { name: 'New conversation' }).click()
  await expect(answer).toBeHidden()
  await expect(panel.getByText('It knows the page you are on.')).toBeVisible()
  await page.keyboard.press('Escape')
  await pick(page, ws, 'Off')
  expect(problems).toEqual([])
})

test('the panel fits beside the reading column, and goes away for questions', async ({ page }) => {
  const ws = await openFolder(page)
  await pick(page, ws, 'Pixel')
  await page.goto(`/w/${ws}/today`)
  await page.locator('[data-companion]').getByRole('button').first().click()
  const panel = page.getByRole('dialog', { name: 'Companion' })
  const box = (await panel.boundingBox())!
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  expect(await panel.evaluate((el) => { const r = el.getBoundingClientRect(); return (document.elementFromPoint(r.left + r.width - 8, r.top + 8) as HTMLElement).closest('[role=dialog]') !== null })).toBe(true) // nothing lies over it
  await page.goto(`/w/${ws}/study`)
  await expect(panel).toBeHidden()
  await page.goto(`/w/${ws}/today`)
  await pick(page, ws, 'Off')
})
