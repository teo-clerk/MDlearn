import { test, expect, type Page } from '@playwright/test'
import { readFileSync, writeFileSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { openFolder, testRoot } from './helpers'

const EDITABLE = 'demo/editable.md'
const typeAtEnd = async (page: Page, text: string) => {
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(text)
}

test('edit a document: the preview follows, Save writes the file, History keeps the old text', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/doc?path=${encodeURIComponent(EDITABLE)}`)
  await page.getByRole('link', { name: 'Edit this file' }).click()
  await expect(page).toHaveURL(/edit\?path=demo%2Feditable\.md/)
  await expect(page.locator('.cm-content')).toContainText('First paragraph.')
  await typeAtEnd(page, '\n\n## 1. Added section\n\nSecond paragraph with $x^2$.')
  await expect(page.getByRole('region', { name: 'Preview' }).getByRole('heading', { name: /Added section/ })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('status').filter({ hasText: 'Unsaved changes' })).toBeVisible()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible()
  expect(readFileSync(join(testRoot(), EDITABLE), 'utf8')).toContain('## 1. Added section')
  await page.getByRole('button', { name: 'History' }).click()
  await expect(page.getByRole('menuitem')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('heading', { name: /Added section/ })).toBeVisible()
})

test('Ctrl+S saves; a change made elsewhere is noticed instead of overwritten', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/edit?path=${encodeURIComponent(EDITABLE)}`)
  await expect(page.locator('.cm-content')).toContainText('First paragraph.')
  await typeAtEnd(page, '\nMine.')
  const file = join(testRoot(), EDITABLE)
  writeFileSync(file, `${readFileSync(file, 'utf8')}\nSomeone else.\n`)
  utimesSync(file, new Date(), new Date(Date.now() + 4000))
  await page.keyboard.press('Control+s')
  const alert = page.getByRole('alert').filter({ hasText: 'changed on disk' })
  await expect(alert).toBeVisible()
  expect(readFileSync(file, 'utf8')).toContain('Someone else.')
  expect(readFileSync(file, 'utf8')).not.toContain('Mine.')
  await alert.getByRole('button', { name: 'Load the file as it is now' }).click()
  await expect(page.locator('.cm-content')).toContainText('Someone else.')
  await expect(page.locator('.cm-content')).not.toContainText('Mine.')
})

test('a lesson shows its problems under the editor, and Insert adds a question', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/edit?path=${encodeURIComponent('learn/02-bayes-theorem.learn.md')}`)
  await expect(page.locator('.cm-content')).toContainText('Bayes')
  await expect(page.getByRole('region', { name: 'Preview' }).getByText(/cards/).first()).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Insert' }).click()
  await page.getByRole('menuitem', { name: /Multiple choice/ }).click()
  await expect(page.locator('.cm-content')).toContainText(':::quiz')
  await typeAtEnd(page, '\n:::quiz\nBroken\n:::\n')
  await expect(page.getByRole('button', { name: /\d+ errors?/ })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: /\d+ errors?/ }).click()
  await expect(page.getByRole('button', { name: /line \d+/ }).first()).toBeVisible()
  // nothing was saved
  expect(readFileSync(join(testRoot(), 'learn/02-bayes-theorem.learn.md'), 'utf8')).not.toContain('Broken')
})

test('a new note is created from the sidebar and opens in the editor', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}`)
  await page.getByRole('button', { name: 'New note' }).click()
  const dialog = page.getByRole('dialog', { name: 'New note' })
  await dialog.getByLabel(/File name/).fill('notes/from-e2e.md')
  await dialog.getByRole('button', { name: 'Create and edit' }).click()
  await expect(page).toHaveURL(/edit\?path=notes%2Ffrom-e2e\.md/)
  await expect(page.locator('.cm-content')).toContainText('From e2e')
  expect(readFileSync(join(testRoot(), 'notes/from-e2e.md'), 'utf8')).toBe('# From e2e\n\n')
  // a second note with the same name is refused
  await page.goto(`/w/${ws}`)
  await page.getByRole('button', { name: 'New note' }).click()
  await page.getByRole('dialog').getByLabel(/File name/).fill('notes/from-e2e.md')
  await page.getByRole('dialog').getByRole('button', { name: 'Create and edit' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('already exists')
})
