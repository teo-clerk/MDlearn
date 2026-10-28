import { test, expect, type Page } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { openFolder, fakePagePort, testRoot, RADAR } from './helpers'

const openDialog = async (page: Page, ws: string) => {
  await page.goto(`/w/${ws}`)
  await page.getByRole('button', { name: 'Import…' }).click()
  return page.getByRole('dialog', { name: 'Import' })
}

test('import a web page, then read it', async ({ page }) => {
  const ws = await openFolder(page)
  const dialog = await openDialog(page, ws)
  await dialog.getByRole('radio', { name: /Web page/ }).click()
  await dialog.getByLabel('Address').fill(`http://127.0.0.1:${fakePagePort()}/page`)
  await dialog.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(dialog.getByText('Imported.')).toBeVisible({ timeout: 20_000 })
  await dialog.getByRole('link', { name: /imports\/an-imported-article\.md/ }).click()
  await expect(page.getByRole('heading', { name: 'An imported article', level: 1 })).toBeVisible()
  await expect(page.locator('.katex').first()).toBeVisible()
  expect(readFileSync(join(testRoot(), 'imports/an-imported-article.md'), 'utf8')).toContain('$E = mc^2$')
})

test('import a notebook and a PDF from files', async ({ page }) => {
  const ws = await openFolder(page)
  let dialog = await openDialog(page, ws)
  await dialog.getByRole('radio', { name: /Notebook/ }).click()
  await dialog.getByLabel(/Choose a Notebook file/).setInputFiles({ name: 'lab.ipynb', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ cells: [{ cell_type: 'markdown', source: '# Lab\n\nText.' }, { cell_type: 'code', source: 'print(1)', outputs: [{ output_type: 'stream', text: '1\n' }] }] })) })
  await dialog.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(dialog.getByText('Imported.')).toBeVisible()
  expect(existsSync(join(testRoot(), 'imports/lab.md'))).toBe(true)
  await dialog.getByRole('button', { name: 'Import another' }).click()
  await dialog.getByRole('radio', { name: /PDF/ }).click()
  await dialog.getByLabel(/Choose a PDF file/).setInputFiles(resolve(import.meta.dirname, '../test/fixtures/sample.pdf'))
  await dialog.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(dialog.getByText(/2 pages/).first()).toBeVisible({ timeout: 30_000 })
  expect(existsSync(join(testRoot(), 'imports/speckle-and-multi-looking.md'))).toBe(true)
  dialog = page.getByRole('dialog', { name: 'Import' })
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(dialog).toHaveCount(0)
})

test('a deck exported to Anki imports back as a lesson you can study', async ({ page }) => {
  const ws = await openFolder(page)
  const apkg = await page.request.get(`/api/w/${ws}/export/anki?scope=${encodeURIComponent(RADAR)}`)
  expect(apkg.status()).toBe(200)
  const dialog = await openDialog(page, ws)
  await dialog.getByRole('radio', { name: /Anki/ }).click()
  await dialog.getByLabel(/Choose a Anki deck file/).setInputFiles({ name: 'radar.apkg', mimeType: 'application/octet-stream', buffer: await apkg.body() })
  await dialog.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(dialog.getByText(/\d+ cards in \d+ lessons/)).toBeVisible({ timeout: 20_000 })
  await expect(dialog.getByRole('link', { name: /learn\/imports\/.+\.learn\.md/ }).first()).toBeVisible()
  await expect(dialog.getByRole('link', { name: 'Study' })).toBeVisible()
})

test('a file that is not what it says is refused with a message', async ({ page }) => {
  const ws = await openFolder(page)
  const dialog = await openDialog(page, ws)
  await dialog.getByRole('radio', { name: /Notebook/ }).click()
  await dialog.getByLabel(/Choose a Notebook file/).setInputFiles({ name: 'x.ipynb', mimeType: 'application/json', buffer: Buffer.from('nope') })
  await dialog.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Jupyter notebook')
})

test('import lessons a chat wrote: checked first, saved in a new folder, errors become a fix request', async ({ page }) => {
  const ws = await openFolder(page)
  const dialog = await openDialog(page, ws)
  const lesson = (title: string, extra = '') => `---\ntitle: ${title}\nlevel: beginner\n---\n\n## The idea\n\nTides follow the Moon.\n\n:::cloze\nTides follow the {{Moon}}.\n:::\n${extra}`
  const answer = `Sure! Here is your course.

<!-- file: tides/course.md -->
~~~~markdown
# Tides
~~~~

<!-- file: tides/01-why.learn.md -->
~~~~markdown
${lesson('Why tides')}
~~~~

<!-- file: tides/02-broken.learn.md -->
~~~~markdown
${lesson('Broken', '\n## A quiz\n\n:::quiz\nWhich?\n- [ ] a\n- [ ] b\n:::\n')}
~~~~`
  await dialog.getByLabel("The chat's whole answer").fill(answer)
  const files = dialog.getByRole('list', { name: 'Files in the answer' })
  await expect(files).toContainText('tides/01-why.learn.md')
  await expect(files).toContainText('1 card')
  await expect(files).toContainText('1 error')
  await expect(dialog.getByRole('button', { name: 'Copy the fix request' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('1 lesson in tides/')
  await expect(dialog.getByRole('status')).toContainText('tides/02-broken.learn.md was not saved')
  await dialog.getByRole('link', { name: 'tides/01-why.learn.md' }).click()
  await expect(page.getByRole('heading', { name: 'Why tides' })).toBeVisible()
})
