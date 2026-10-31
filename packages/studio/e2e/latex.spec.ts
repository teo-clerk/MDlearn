import { test, expect } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { openFolder, testRoot } from './helpers'

test('a LaTeX document is written, compiled to a PDF, fixed from its error line, and saved next to the file', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}`)
  await page.getByRole('button', { name: 'New note' }).click()
  const dialog = page.getByRole('dialog', { name: 'New note' })
  await dialog.getByRole('radio', { name: 'LaTeX document' }).click()
  await expect(dialog.getByLabel(/File name/)).toHaveValue('untitled.tex')
  await dialog.getByLabel(/File name/).fill('paper/radar-notes')
  await dialog.getByRole('button', { name: 'Create and edit' }).click()
  await expect(page).toHaveURL(/latex\?path=paper%2Fradar-notes\.tex/)
  await expect(page.locator('.cm-content')).toContainText('\\documentclass[11pt]{article}')
  await expect(page.getByRole('treeitem', { name: 'Radar notes' })).toBeVisible() // listed under LaTeX, by its \title

  // compile: the stand-in engine makes a one-page PDF, drawn by pdf.js
  await page.getByRole('button', { name: 'Compile' }).click()
  await expect(page.getByRole('img', { name: 'Page 1 of 1' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /Compiled in/ })).toBeVisible()

  // an error: its line and a hint come back; a click goes to that line
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.type('\\oops here\n')
  await page.keyboard.press('ControlOrMeta+s')
  const problem = page.getByRole('button', { name: /radar-notes\.tex:\d+ Undefined control sequence/ })
  await expect(problem).toBeVisible()
  await expect(page.getByText('A command is misspelled, or its package is not loaded with \\usepackage.')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Page 1 of 1' })).toBeVisible() // the last good PDF stays
  const line = Number((await problem.textContent())!.match(/:(\d+)/)![1])
  await page.locator('.cm-content').press('ControlOrMeta+Home')
  await problem.click()
  await expect(page.locator('.cm-activeLine')).toContainText('\\oops here')
  expect(readFileSync(join(testRoot(), 'paper/radar-notes.tex'), 'utf8').split('\n')[line - 1]).toContain('\\oops') // saved before compiling

  // fixed, compiled, saved as paper/radar-notes.pdf
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  await page.keyboard.press('Backspace')
  await page.getByRole('button', { name: 'Compile' }).click()
  await expect(page.getByRole('status').filter({ hasText: /Compiled in/ })).toBeVisible()
  await page.getByRole('button', { name: 'PDF', exact: true }).first().click()
  await page.getByRole('menuitem', { name: /Save the PDF next to the file/ }).click()
  await expect(page.getByText('Saved paper/radar-notes.pdf next to the .tex file.')).toBeVisible()
  expect(readFileSync(join(testRoot(), 'paper/radar-notes.pdf'), 'latin1')).toContain('Radar notes')
  expect(errors).toEqual([])
})

test('LaTeX files open from the command palette, and a chapter file compiles its main document', async ({ page }) => {
  const ws = await openFolder(page)
  await page.request.post(`/api/w/${ws}/files/create`, { headers: { 'x-mdl': '1' }, data: { path: 'thesis/main.tex', text: '\\documentclass{article}\n\\title{My thesis}\n\\begin{document}\n\\input{ch1}\n\\end{document}\n' } })
  await page.request.post(`/api/w/${ws}/files/create`, { headers: { 'x-mdl': '1' }, data: { path: 'thesis/ch1.tex', text: '% !TEX root = main.tex\n\\section{One}\n' } })
  await page.goto(`/w/${ws}`)
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByRole('combobox').fill('ch1')
  await page.getByRole('option', { name: /thesis\/ch1/ }).click()
  await expect(page).toHaveURL(/latex\?path=thesis%2Fch1\.tex/)
  await page.getByRole('button', { name: 'Compile' }).click()
  await expect(page.getByRole('img', { name: 'Page 1 of 1' })).toBeVisible()
  expect(existsSync(join(testRoot(), 'thesis/ch1.pdf'))).toBe(false) // nothing is written into the folder unless asked
  // /edit on a .tex file goes to the LaTeX page
  await page.goto(`/w/${ws}/edit?path=thesis%2Fmain.tex`)
  await expect(page).toHaveURL(/latex\?path=thesis%2Fmain\.tex/)
})
