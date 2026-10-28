import { test, expect } from '@playwright/test'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openFolder, openTutorial, testRoot } from './helpers'

// HTML in Markdown: the safe part renders, nothing in it can run, and :::html runs in a sandbox.
const UNSAFE = `# HTML

Safe: <mark>marked</mark> and <kbd>Ctrl</kbd>.

<img src="missing.png" alt="x" onerror="window.__pwned = 'img'">

<script>window.__pwned = 'script'</script>

<div onclick="window.__pwned = 'click'" style="position: fixed; inset: 0; color: #c03a2b">click anywhere</div>

<a href="javascript:window.__pwned = 'link'">a script link</a>

<svg width="40" height="40"><a href="javascript:window.__pwned = 'svg'"><circle cx="20" cy="20" r="15"/></a><animate attributeName="href" values="javascript:window.__pwned = 'smil'"/></svg>
`

test('safe HTML renders and nothing executable survives', async ({ page }) => {
  const file = join(testRoot(), 'demo', 'unsafe-html.md')
  writeFileSync(file, UNSAFE)
  try {
    const ws = await openFolder(page)
    await page.goto(`/w/${ws}/doc?path=${encodeURIComponent('demo/unsafe-html.md')}`)
    await expect(page.locator('#main mark', { hasText: 'marked' })).toBeVisible()
    await expect(page.locator('#main kbd', { hasText: 'Ctrl' })).toBeVisible()
    await page.getByText('click anywhere').click()
    await page.getByText('a script link').click().catch(() => {})
    await page.locator('svg circle').first().click().catch(() => {})
    await page.waitForTimeout(500)
    expect(await page.evaluate(() => (window as unknown as { __pwned?: string }).__pwned)).toBeUndefined()
    const block = page.locator('.html-block').filter({ hasText: 'click anywhere' })
    expect(await block.innerHTML()).not.toMatch(/onclick|onerror|javascript:|<script|position:\s*fixed/i)
  } finally { rmSync(file, { force: true }) }
})

test(':::html runs in a sandbox and reports a score', async ({ page }) => {
  const ws = await openTutorial(page)
  await page.goto(`/w/${ws}/doc?path=feature-tour.md`)
  const block = page.locator('figure[aria-label="html"]', { hasText: 'Pick the band' })
  await block.scrollIntoViewIfNeeded()
  await block.getByRole('button', { name: 'Play' }).click()
  const frame = page.frameLocator('iframe[title="Interactive"]')
  for (const band of ['L', 'C', 'X', 'P']) {
    await frame.getByRole('button', { name: `${band}-band` }).click()
    await page.waitForTimeout(1600)
  }
  await expect(block.getByRole('status')).toHaveText('Score 4 / 4')
  // the frame has an opaque origin: no cookies, no access to the page or the API
  const iframe = block.locator('iframe')
  await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts')
  const origin = await frame.locator('body').evaluate(() => { try { return String(window.parent.document.title) } catch { return 'blocked' } })
  expect(origin).toBe('blocked')
})
