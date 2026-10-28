import { test, expect, type Page } from '@playwright/test'
import { openFolder, post, resetProgress } from './helpers'

test.beforeEach(() => resetProgress())

/** Mark every card as studied once, so an exam can ask about it. */
async function studyAll(page: Page, ws: string) {
  await page.goto(`/w/${ws}/progress`)
  const plan = await page.request.get(`/api/w/${ws}/study/queue?newCards=20&limit=50`).then((r) => r.json() as Promise<{ items: { cardKey: string }[] }>)
  for (const i of plan.items) await post(page, `/api/w/${ws}/study/record`, { cardKey: i.cardKey, outcome: { correct: true, sure: true } })
  return plan.items.length
}
/** Answer whatever the question is with something (not necessarily right). */
async function scribble(page: Page) {
  const q = page.getByRole('article')
  const options = q.getByRole('radiogroup', { name: 'Options' }).getByRole('radio')
  const gaps = q.getByRole('textbox')
  await expect(q.getByRole('group', { name: /how sure are you/ })).toBeVisible()
  if (await options.count()) await options.last().click()
  for (let i = 0; i < await gaps.count(); i++) await gaps.nth(i).fill('zzz')
}

test('a mock exam holds the marks to the end, then shows every answer and feeds the confidence check', async ({ page }) => {
  const ws = await openFolder(page)
  const studied = await studyAll(page, ws)
  await page.goto(`/w/${ws}/exam`)
  await page.getByRole('radiogroup', { name: 'Time limit' }).getByRole('radio', { name: 'None' }).click()
  await page.getByRole('button', { name: 'Start the exam' }).click()
  const total = Number((await page.getByRole('heading', { name: /^Question 1 of \d+$/ }).textContent())!.match(/of (\d+)/)![1])
  expect(total).toBeGreaterThanOrEqual(Math.min(5, studied))
  for (let i = 1; i <= total; i++) {
    await expect(page.getByRole('heading', { name: `Question ${i} of ${total}` })).toBeVisible()
    await scribble(page)
    await expect(page.getByText(/^Right$|^Not quite$|^Nearly/)).toHaveCount(0) // nothing is marked during the exam
    await page.getByRole('button', { name: /^Sure/ }).click()
  }
  await expect(page.getByRole('heading', { name: 'Your marks' })).toBeVisible()
  await expect(page.getByText(new RegExp(`of ${total} right`))).toBeVisible()
  await expect(page.getByRole('heading', { name: 'By lesson' })).toBeVisible()
  const rows = page.getByRole('listitem').filter({ has: page.locator('details') })
  await expect(rows).toHaveCount(total)
  await expect(page.getByRole('status').filter({ hasText: 'Not quite' }).first()).toBeVisible() // a missed question is open with its answer

  // every answer was "sure": the wrong ones are the ones worth studying
  await page.getByRole('link', { name: 'Progress' }).last().click()
  const conf = page.getByRole('region', { name: 'Confidence check' })
  await expect(conf.getByRole('table', { name: 'Answers by confidence and result' })).toBeVisible()
  await conf.getByRole('button', { name: /^Review (this card|these \d+ cards)$/ }).click()
  await expect(page.getByRole('heading', { name: 'Cards you were sure about, but missed' })).toBeVisible()
})

test('time up hands the paper in as it stands', async ({ page }) => {
  const ws = await openFolder(page)
  await studyAll(page, ws)
  await page.clock.install()
  await page.goto(`/w/${ws}/exam`)
  await page.getByRole('radiogroup', { name: 'Time limit' }).getByRole('radio', { name: '10 min' }).click()
  await page.getByRole('button', { name: 'Start the exam' }).click()
  await expect(page.getByRole('timer')).toHaveText('10:00 left')
  await page.clock.runFor(9 * 60_000 + 1000)
  await expect(page.getByRole('timer')).toHaveText('0:59 left')
  await page.clock.runFor(60_000)
  await expect(page.getByRole('heading', { name: 'Your marks' })).toBeVisible()
  await expect(page.getByText(/\d+ not answered/)).toBeVisible()
})
