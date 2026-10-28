import { test, expect } from '@playwright/test'
import { openFolder, RADAR } from './helpers'

const LESSON = 'learn/00_FOUNDATIONS/04_radar/01-radar-equation.learn.md'
const EXPLANATION = 'The radar sends a pulse and listens for the echo. The power drops fast with range, and doubling the range halves the power.'

test('teach a lesson back: the AI says which ideas you covered, what to correct and what a beginner would ask', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/lesson?path=${encodeURIComponent(LESSON)}`)
  await page.getByRole('button', { name: 'Teach it back' }).click()
  await expect(page.getByRole('heading', { name: 'Teach it back' })).toBeVisible()
  const box = page.getByRole('textbox', { name: 'Your explanation' })
  await box.fill(EXPLANATION)
  await page.getByRole('radiogroup', { name: 'Feedback from' }).getByRole('radio', { name: 'Local AI' }).click()
  await page.getByRole('button', { name: 'Get feedback' }).click()
  const heading = page.getByRole('heading', { name: '1 of 1 key ideas covered' })
  await expect(heading).toBeFocused()
  await expect(page.getByText('Derive the radar equation')).toBeVisible()
  await expect(page.getByText('Doubling the range divides the power by sixteen.')).toBeVisible()
  await expect(page.getByText('Why the fourth power and not the second?')).toBeVisible()

  // Claude, when chosen (the demo engine here), answers the same question
  await page.getByRole('radio', { name: 'Claude' }).click()
  await page.getByRole('button', { name: 'Get feedback again' }).click()
  await expect(page.getByText('A good start (demo answer). Add why it holds.')).toBeVisible()

  // the draft stays on this device until it is replaced
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Your explanation' })).toHaveValue(EXPLANATION)
})

test('teach back a section of a document, chosen from its outline', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/doc?path=${encodeURIComponent(RADAR)}`)
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: /Teach it back/ }).click()
  const pick = page.getByRole('combobox', { name: 'Section' })
  await expect(pick).toBeVisible()
  expect(await pick.locator('option').count()).toBeGreaterThan(0)
  await page.getByRole('textbox', { name: 'Your explanation' }).fill(EXPLANATION)
  await page.getByRole('radio', { name: 'Local AI' }).click()
  await page.getByRole('button', { name: 'Get feedback' }).click()
  await expect(page.getByRole('heading', { name: /key ideas covered$/ })).toBeVisible()
})
