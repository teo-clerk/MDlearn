import { test, expect } from '@playwright/test'
import { openFolder } from './helpers'

test('build courses for several documents at once, then take them back', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/studio`)
  await page.getByRole('tab', { name: 'Whole folder' }).click()
  const list = page.getByRole('list', { name: 'Documents without lessons' })
  await expect(list).toBeVisible()
  await page.getByRole('button', { name: 'None', exact: true }).click()
  await list.getByRole('checkbox', { name: /Radar terms/ }).check()
  await list.getByRole('checkbox', { name: /Long sheet/ }).check()
  await page.getByText('Haiku', { exact: true }).click()
  await page.getByRole('button', { name: 'Build 2 courses' }).click()
  await expect(page).toHaveURL(/studio\?batch=/)
  await expect(page.getByRole('heading', { name: 'Courses for 2 documents' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /Finished · 2 of 2 done · haiku/ })).toBeVisible({ timeout: 30_000 })
  const jobs = page.getByRole('list', { name: 'Documents' }).getByRole('link', { name: 'Job' })
  await expect(jobs).toHaveCount(2)
  // each document has its own job, which can be undone so the demo folder stays as it was
  const hrefs = await jobs.evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href')!))
  for (const href of hrefs) {
    const id = new URL(href, 'http://x').searchParams.get('job')!
    const r = await page.evaluate(async ([w, j]) => (await fetch(`/api/w/${w}/ai/jobs/${j}/undo`, { method: 'POST', headers: { 'x-mdl': '1', 'content-type': 'application/json' }, body: '{}' })).json(), [ws, id])
    expect((r as { removed: string[] }).removed.length).toBeGreaterThan(0)
  }
  await page.getByRole('link', { name: 'Job' }).first().click()
  await expect(page.getByText('undone')).toBeVisible()
})
