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
  await expect(apps.getByText(/You write \*\*MDlearn courses\*\*/)).toBeVisible()
  const zip = await page.request.get('/api/integrations/mdlearn-skill.zip')
  expect(zip.headers()['content-type']).toBe('application/zip')
  expect((await zip.body()).subarray(0, 2).toString()).toBe('PK')
  expect((await page.request.get('/api/integrations/..%2Fserver%2Findex.js')).ok()).toBe(false)
  // from here straight to the chat import
  await apps.getByRole('button', { name: 'Import from a chat…' }).click()
  await expect(page.getByRole('dialog', { name: 'Import' }).getByLabel("The chat's whole answer")).toBeVisible()
})

test('a folder can be made ready for any coding assistant, and the tools have their commands', async ({ page }) => {
  // the real route copies into your home folder (unit tests cover it); here only the page is under test
  await page.route('**/api/integrations/mcp', (route) => route.fulfill({ json: { server: '/h/.mdlearn/mcp/server.mjs', commands: {
    codex: 'codex mcp add mdlearn -- node "/h/.mdlearn/mcp/server.mjs"', pi: 'pi mcp add mdlearn -- node "/h/.mdlearn/mcp/server.mjs"', opencode: '{ "mcp": {} }',
  } } }))
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}`)
  await page.keyboard.press('Control+k')
  await page.getByRole('combobox', { name: 'Search' }).fill('ready for my AI')
  await page.getByRole('option', { name: /Get this folder ready for my AI/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Start your assistant in this folder' })).toBeVisible()
  await expect(page.getByRole('tree', { name: 'Files' }).getByText('AGENTS.md')).toHaveCount(0)

  await page.goto(`/w/${ws}/settings#apps`)
  const apps = page.getByRole('region', { name: 'Use MDlearn in other apps' })
  await expect(apps.getByText('Codex, OpenCode, Pi and other coding assistants')).toBeVisible()
  await apps.getByText('To let it quiz you too, add the MDlearn tools').click()
  await apps.getByRole('button', { name: 'Show the commands' }).click()
  await expect(apps.getByText('codex mcp add mdlearn -- node "/h/.mdlearn/mcp/server.mjs"')).toBeVisible()
  await expect(apps.getByText('pi mcp add mdlearn -- node "/h/.mdlearn/mcp/server.mjs"')).toBeVisible()
})
