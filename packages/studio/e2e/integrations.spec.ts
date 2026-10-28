import { test, expect } from '@playwright/test'
import { openFolder } from './helpers'

// Settings → Use MDlearn in other apps: the Claude Code plugin, the Claude.ai skill and the prompt for chats.
test('settings explain how to use MDlearn in Claude Code, Claude.ai and other chats', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}`)
  await page.getByRole('link', { name: 'Settings' }).click()
  const apps = page.getByRole('region', { name: 'Use MDlearn in other apps' })
  await expect(apps.getByText(/claude plugin marketplace add ".*integrations\/claude-plugin"/)).toBeVisible()
  await expect(apps.getByRole('button', { name: 'Copy the prompt' })).toBeVisible()
  await apps.getByText('Show the prompt').click()
  await expect(apps.getByText(/You write \*\*MDlearn lessons\*\*/)).toBeVisible()
  const zip = await page.request.get('/api/integrations/mdlearn-skill.zip')
  expect(zip.headers()['content-type']).toBe('application/zip')
  expect((await zip.body()).subarray(0, 2).toString()).toBe('PK')
  expect((await page.request.get('/api/integrations/..%2Fserver%2Findex.js')).ok()).toBe(false)
  // from here straight to the chat import
  await apps.getByRole('button', { name: 'Import from a chat…' }).click()
  await expect(page.getByRole('dialog', { name: 'Import' }).getByLabel("The chat's whole answer")).toBeVisible()
})
