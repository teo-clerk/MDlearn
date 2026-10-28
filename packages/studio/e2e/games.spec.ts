import { test, expect } from '@playwright/test'
import { openTutorial } from './helpers'

// The four games of the feature tour, played in a browser: every move is checked on the server and the
// key never reaches the page, so the tests play the way a learner does.
const TOUR = 'feature-tour.md'

test('match: pair everything, check, see each pair marked', async ({ page }) => {
  const ws = await openTutorial(page)
  await page.goto(`/w/${ws}/doc?path=${TOUR}`)
  const game = page.locator('section[aria-label="Match the pairs"]').first()
  await game.scrollIntoViewIfNeeded()
  await expect(game.getByRole('button', { name: 'Check' })).toBeDisabled()
  for (let i = 0; i < 4; i++) {
    await game.locator(`[data-side="l"][data-i="${i}"]`).click()
    await game.locator(`[data-side="r"][data-i="${3 - i}"]`).click()
  }
  await expect(game.locator('.game-badge')).toHaveCount(8)
  await game.getByRole('button', { name: 'Check' }).click()
  await expect(game.getByRole('status')).toContainText(/Right|Nearly right|Not quite/)
  await expect(game.locator('.border-good\\/60, .border-bad\\/50').first()).toBeVisible()
})

test('memory: flip pairs until every one is found; the game submits itself', async ({ page }) => {
  const ws = await openTutorial(page)
  await page.goto(`/w/${ws}/doc?path=${TOUR}`)
  const game = page.locator('section[aria-label="Memory game"]').first()
  await game.scrollIntoViewIfNeeded()
  const down = (side: 'filled-dot' | 'ring') => game.locator(`button.flip-card:not(.is-flipped)[aria-label*="${side}"]`)
  for (let guard = 0; guard < 40 && (await down('filled-dot').count()) > 0; guard++) {
    const left = down('filled-dot').first()
    const label = await left.getAttribute('aria-label')
    for (let k = 0; k < (await down('ring').count()); k++) {
      await game.locator(`button[aria-label="${label}"]`).click()
      await down('ring').nth(k).click()
      await page.waitForTimeout(1200) // a miss turns both cards back after a second
      if ((await game.locator(`button[aria-label="${label}"]`).count()) === 0) break // found: the card stays face up
    }
  }
  await expect(game.getByRole('status')).toContainText(/Right|Nearly right/, { timeout: 10_000 })
  await expect(game.getByText(/4 of 4 pairs/)).toBeVisible()
})

test('sort: choose items and groups from the keyboard', async ({ page }) => {
  const ws = await openTutorial(page)
  await page.goto(`/w/${ws}/doc?path=${TOUR}`)
  const game = page.locator('section[aria-label="Sort into groups"]').first()
  await game.scrollIntoViewIfNeeded()
  await game.locator('li[data-flip] button').first().click()
  for (let k = 0; k < 6; k++) await page.keyboard.press(k % 2 ? '2' : '1')
  await expect(game.getByText('Not sorted yet')).toHaveCount(0)
  await game.getByRole('button', { name: 'Check' }).click()
  await expect(game.getByRole('status')).toContainText(/Right|Nearly right|Not quite/)
})

test('speed round: T and F answer, feedback stays on the statement, the round ends itself', async ({ page }) => {
  const ws = await openTutorial(page)
  await page.goto(`/w/${ws}/doc?path=${TOUR}`)
  const game = page.locator('section[aria-label="Speed round"]').first()
  await game.scrollIntoViewIfNeeded()
  await game.getByRole('button', { name: 'Start the round' }).click()
  const card = game.locator('.game-card')
  for (let k = 0; k < 6; k++) {
    const text = await card.locator('.read').first().innerText()
    await page.keyboard.press(k % 2 ? 'f' : 't')
    await expect(card.getByText(/^(Right|Not quite)$/)).toBeVisible()
    await expect(card.locator('.read').first()).toHaveText(text) // the verdict is about this statement
    await expect(card.getByText(/^(Right|Not quite)$/)).toHaveCount(0, { timeout: 4000 })
  }
  await expect(game.getByRole('status')).toContainText(/Right|Nearly right|Not quite/, { timeout: 6000 })
  await expect(game.getByText(/of 6/)).toBeVisible()
})

test('a study session schedules games like questions', async ({ page }) => {
  const ws = await openTutorial(page)
  const queue = await page.evaluate(async (w) => (await fetch(`/api/w/${w}/study/queue?newCards=20&limit=20`)).json(), ws) as { items: { kind: string }[] }
  expect(new Set(queue.items.map((i) => i.kind))).toEqual(new Set(['quiz', 'match', 'sort', 'speed', 'cloze']))
  await page.goto(`/w/${ws}/study`)
  const options = page.getByRole('radiogroup', { name: 'Options' }).getByRole('radio')
  await expect(options.first()).toBeVisible()
  await expect(options.first()).not.toBeFocused() // a ring on option A read as "already chosen"
  await page.keyboard.press('b')
  await expect(options.nth(1)).toHaveAttribute('aria-checked', 'true')
})

