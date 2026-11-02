import { test, expect } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { openFolder, testRoot } from './helpers'

const fixture = (name: string) => resolve(import.meta.dirname, '../test/fixtures/class', name)
const LESSON = `---
title: Heat engines
level: beginner
lang: en
goals: [Explain the Carnot limit]
---

## The Carnot limit

No engine between two temperatures beats a reversible one.

:::quiz
What limits an engine's efficiency?

- [x] The two temperatures
  > Right: only they set the limit.
- [ ] The fuel
  > The fuel sets the power, not the limit.
:::
`
const fresh = () => `Course ${Date.now().toString(36)}`
async function bringFiles(page: import('@playwright/test').Page, name: string) {
  await page.goto('/')
  await page.getByRole('link', { name: /Make a course/ }).click()
  await expect(page.getByRole('heading', { name: 'Make a course' })).toBeVisible()
  await page.getByLabel('What do you want to learn?').fill(name)
  await page.getByLabel('Choose files').setInputFiles([fixture('Lecture 3.pptx'), fixture('Handout 2.docx')])
  await page.getByRole('button', { name: 'Continue' }).click()
  const read = page.getByRole('list', { name: 'What was read' })
  await expect(read.getByText('3 slides, 1 picture')).toBeVisible()
  await expect(read.getByText('text read, 1 picture')).toBeVisible()
}

test('a first-time user gets a course from a coding assistant, and studies it', async ({ page }) => {
  await bringFiles(page, fresh())
  await page.getByRole('radio', { name: /My coding assistant/ }).click()
  await page.getByRole('button', { name: 'Get the folder ready' }).click()
  await page.getByRole('tab', { name: 'Codex' }).click()
  const command = page.getByText(/codex "Make the MDlearn course on .+, following AGENTS\.md\."/)
  await expect(command).toBeVisible()
  await page.getByRole('tab', { name: 'Pi' }).click()
  await expect(page.getByText(/pi "Make the MDlearn course/)).toBeVisible()
  await page.getByLabel('Language of the course').fill('Greek"; $(x)')
  await expect(page.getByText(/following AGENTS\.md\. Write it in Greek x\."/)).toBeVisible()
  await page.getByLabel('Language of the course').clear()
  const root = /cd "([^"]+)"/.exec(await page.locator('code').first().innerText())![1]

  // the assistant works in the folder: what it wrote there shows up by itself
  await expect(page.getByText('The course appears here as it is written.')).toBeVisible()
  expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toContain('MDlearn course folder')
  writeFileSync(join(root, 'course.md'), '# Heat engines\n\nWhat limits an engine.\n')
  writeFileSync(join(root, '01-heat-engines.learn.md'), LESSON)
  await expect(page.getByRole('status').filter({ hasText: '1 lesson' })).toContainText('1 card', { timeout: 10_000 })
  await page.getByRole('link', { name: 'Start studying' }).click()
  await expect(page.getByText("What limits an engine's efficiency?")).toBeVisible({ timeout: 10_000 })
})

test('Claude can write the course from here', async ({ page }) => {
  await bringFiles(page, fresh())
  await page.getByRole('radio', { name: /Claude, from here/ }).click()
  await page.getByLabel('Anything it should know? (optional)').fill('The exam covers chapter 3')
  await page.getByRole('button', { name: 'Write the course' }).click()
  await expect(page).toHaveURL(/studio\?job=/)
})

test('a chat can write it too: the prompt is there, and so is the way back', async ({ page }) => {
  await bringFiles(page, fresh())
  await page.getByRole('radio', { name: /A chat/ }).click()
  await expect(page.getByRole('button', { name: 'Copy the prompt' })).toBeVisible()
  await page.getByRole('button', { name: 'Import from a chat…' }).click()
  await expect(page.getByRole('dialog', { name: 'Import' }).getByLabel("The chat's whole answer")).toBeVisible()
})

test('class files dropped on the first page go straight to making a course', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('heading', { name: 'MDlearn Studio' }).evaluate((el, bytes) => {
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'Lecture 3.pptx'))
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }))
  }, [...readFileSync(fixture('Lecture 3.pptx'))])
  await expect(page.getByRole('heading', { name: 'Make a course' })).toBeVisible()
  await expect(page.getByText('Lecture 3.pptx')).toBeVisible()
  await expect(page.getByLabel('What do you want to learn?')).toHaveValue('Lecture 3')
})

test('an old PowerPoint is kept and the person is told what to do', async ({ page }) => {
  await page.goto('/start')
  await page.getByLabel('What do you want to learn?').fill(fresh())
  await page.getByLabel('Choose files').setInputFiles({ name: 'week1.ppt', mimeType: 'application/vnd.ms-powerpoint', buffer: Buffer.from('old') })
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText(/Save it as \.pptx or \.docx/)).toBeVisible()
})

test('a week in: change the course, reorder it, and keep what you studied', async ({ page, request }) => {
  await page.goto('/start')
  const name = fresh()
  await page.getByLabel('What do you want to learn?').fill(name)
  await page.getByLabel('Choose files').setInputFiles(fixture('Lecture 3.pptx'))
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('radio', { name: /My coding assistant/ }).click()
  await page.getByRole('button', { name: 'Get the folder ready' }).click()
  const root = /cd "([^"]+)"/.exec(await page.locator('code').first().innerText())![1]
  writeFileSync(join(root, 'course.md'), '# Heat engines\n\nWhat limits an engine.\n')
  writeFileSync(join(root, '01-heat-engines.learn.md'), LESSON)
  writeFileSync(join(root, '02-pumps.learn.md'), LESSON.replace('title: Heat engines', 'title: Heat pumps').replace('The Carnot limit', 'Pump cycle'))
  const ws = /ws=([^&]+)/.exec(page.url())![1]
  await expect(page.getByRole('status').filter({ hasText: '2 lessons' })).toBeVisible({ timeout: 10_000 })

  // a week of study
  const cardKey = 'heat-engines/the-carnot-limit'
  const headers = { 'x-mdl': '1', 'content-type': 'application/json' }
  expect((await request.post(`/api/w/${ws}/study/record`, { headers, data: { cardKey, outcome: { correct: true, help: 'none', sure: true } } })).ok()).toBe(true)

  await page.goto(`/w/${ws}/doc?path=course.md`)
  const lessons = page.getByRole('list', { name: 'Lessons' })
  await expect(lessons.getByRole('listitem')).toHaveCount(2)
  await expect(lessons.getByRole('listitem').first()).toContainText('1/1')

  // the order changes, the progress stays
  await page.getByRole('button', { name: 'Move Heat pumps up' }).click()
  await expect(lessons.getByRole('listitem').first()).toContainText('Heat pumps')
  await expect(lessons.getByRole('listitem').nth(1)).toContainText('1/1')

  // an outside edit renames the studied card
  writeFileSync(join(root, '02-heat-engines.learn.md'), LESSON.replace('The Carnot limit', 'The Carnot efficiency limit'))
  await expect(page.getByRole('heading', { name: '1 card you studied is gone' })).toBeVisible({ timeout: 10_000 })
  await page.getByLabel('Reconnect the carnot limit').selectOption({ label: 'The Carnot efficiency limit' })
  await expect(page.getByRole('heading', { name: '1 card you studied is gone' })).toBeHidden()
  await expect(lessons.getByRole('listitem').nth(1)).toContainText('1/1')

  // an AI changes it, and says what happened to the cards
  await page.getByRole('button', { name: 'Change this course' }).click()
  await page.getByLabel('What should change?').fill('Add a card on heat pumps')
  await page.getByRole('button', { name: 'Change the course' }).click()
  await expect(page.getByRole('region', { name: 'What happened to your cards' })).toContainText('2 cards kept their progress', { timeout: 10_000 })

  // and it can move to another language the same way
  await page.goto(`/w/${ws}/doc?path=course.md`)
  await page.getByRole('button', { name: 'Translate this course' }).click()
  await page.getByLabel('Translate into').fill('Spanish')
  await page.getByRole('button', { name: 'Translate the course' }).click()
  await expect(page.getByRole('region', { name: 'What happened to your cards' })).toContainText('kept their progress', { timeout: 10_000 })
})

test('colour means something, and can be turned off', async ({ page }) => {
  const ws = await openFolder(page)
  writeFileSync(join(testRoot(), 'colour.md'), `# Colour

The base rate fallacy is the mistake of ignoring how common something is.

:::note
A note.
:::

:::warning
A warning.
:::
`)
  await page.goto(`/w/${ws}/doc?path=colour.md`)
  const warning = page.locator('.callout-warning')
  await expect(warning).toBeVisible()
  await expect(warning.locator('svg.callout-icon')).toBeVisible()
  const tone = (l: typeof warning) => l.evaluate((el) => getComputedStyle(el.querySelector('svg')!).color)
  const blue = await tone(page.locator('.callout-note')), amber = await tone(warning)
  expect(blue).not.toBe(amber)

  // one click on a selection: no text needed, and the note leads somewhere
  await page.getByText('The base rate fallacy').evaluate((el) => {
    const range = document.createRange(); range.setStart(el.firstChild!, 4); range.setEnd(el.firstChild!, 21)
    getSelection()!.removeAllRanges(); getSelection()!.addRange(range)
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })
  await page.getByRole('toolbar', { name: 'Selected text' }).getByRole('button', { name: 'Confusing' }).click()
  await expect(page.getByText('Highlighted: Confusing')).toBeVisible()
  await page.goto(`/w/${ws}/today`)
  const list = page.getByRole('region', { name: 'Confusing passages' })
  await list.getByRole('link', { name: 'base rate fallacy' }).click()
  await expect(page).toHaveURL(/note=/)
  await expect(page.getByRole('article', { name: 'Note' }).getByText('Confusing')).toBeVisible()

  // off: the hues go grey, the icons stay
  await page.goto(`/w/${ws}/settings`)
  await page.getByRole('checkbox', { name: /Colour in notes/ }).uncheck()
  await page.goto(`/w/${ws}/doc?path=colour.md`)
  await expect(warning.locator('svg.callout-icon')).toBeVisible()
  expect(await tone(page.locator('.callout-note'))).toBe(await tone(warning))
  await page.goto(`/w/${ws}/settings`)
  await page.getByRole('checkbox', { name: /Colour in notes/ }).check()
})

test('the first page explains itself to someone who has nothing yet, and steps aside later', async ({ page }) => {
  await page.route('**/api/workspaces', (route) => route.fulfill({ json: [] }))
  await page.goto('/')
  await expect(page.getByText('Say what you want to learn')).toBeVisible()
  await expect(page.getByText('An AI writes better notes')).toBeVisible()
  await expect(page.getByRole('link', { name: /Make a course/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Open the tutorial/ })).toBeVisible()
  await expect(page.getByText('Recent')).toHaveCount(0)

  await page.unroute('**/api/workspaces')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Recent' })).toBeVisible()
  await expect(page.getByText('Say what you want to learn')).toHaveCount(0)
})

test('a folder with no lessons says so and leads to making them', async ({ page }) => {
  await bringFiles(page, 'Lecture 3.pptx')
  await expect(page.getByRole('heading', { name: 'Who writes the course?' })).toBeVisible()
  const ws = new URL(page.url()).searchParams.get('ws')

  await page.goto(`/w/${ws}/study`)
  await expect(page.getByRole('heading', { name: 'No lessons yet' })).toBeVisible()
  await expect(page.getByText('You are all caught up')).toHaveCount(0)
  await page.getByRole('link', { name: 'Make lessons with an AI' }).click()
  await expect(page.getByRole('heading', { name: 'Who writes the course?' })).toBeVisible()

  for (const screen of ['exam', 'progress']) {
    await page.goto(`/w/${ws}/${screen}`)
    await expect(page.getByRole('heading', { name: 'No lessons yet' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start the exam' })).toHaveCount(0)
  }

  await page.goto(`/w/${ws}`)
  await page.getByRole('link', { name: 'Make lessons with an AI' }).click()
  await expect(page.getByRole('heading', { name: 'Who writes the course?' })).toBeVisible()
})

test('a topic is enough: no files, and Claude writes it from what it knows', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /Make a course/ }).click()
  const go = page.getByRole('button', { name: 'Continue' })
  await expect(go).toBeDisabled()
  await page.getByLabel('What do you want to learn?').fill(fresh())
  await go.click()
  await expect(page.getByRole('heading', { name: 'Who writes the course?' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'What was read' })).toHaveCount(0)
  await page.getByRole('radio', { name: /Claude, from here/ }).click()
  await page.getByRole('button', { name: 'Write the course' }).click()
  await expect(page).toHaveURL(/studio\?job=/)
})

test('searching the web is off until you say so, and says what leaves the computer', async ({ page }) => {
  await bringFiles(page, fresh())
  await page.getByRole('radio', { name: /Claude, from here/ }).click()
  const web = page.getByRole('checkbox', { name: /Let Claude search the web/ })
  await expect(web).not.toBeChecked()
  await expect(page.getByText('What it searches for leaves this computer.')).toBeVisible()
  const sent = page.waitForRequest((r) => r.url().endsWith('/jobs') && r.method() === 'POST')
  await web.check()
  await page.getByRole('button', { name: 'Write the course' }).click()
  expect((await sent).postDataJSON()).toMatchObject({ recipe: 'course.class', web: true })
})
