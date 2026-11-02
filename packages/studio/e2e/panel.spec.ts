import { test, expect } from '@playwright/test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openFolder, testRoot } from './helpers'

const lesson = (title: string) => `---\ntitle: ${title}\nlevel: beginner\nlang: en\ngoals: [Explain it]\n---\n\n## The idea\n\nSomething worth knowing.\n\n:::explain\nSay it in your own words.\n:::\n`
const overview = (title: string) => `# ${title}\n\nWhat this course covers.\n`

/** A course written into the folder from outside, the way a coding assistant in a terminal does. */
function writeCourse(folder: string, title: string) {
  const dir = join(testRoot(), folder)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'course.md'), overview(title))
  writeFileSync(join(dir, '01-first.learn.md'), lesson(`${title} first steps`))
  return dir
}

test('a course an assistant writes shows up in the panel by itself', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}`)
  await expect(page.getByRole('tree', { name: 'Files' })).toBeVisible()
  const dir = writeCourse('panel-new', 'Pricing')
  try {
    const row = page.getByRole('treeitem', { name: 'Pricing first steps' })
    await expect(row).toBeVisible({ timeout: 10_000 })
    await expect(row).toBeInViewport()
    await expect(row.getByLabel('New')).toBeVisible()
    await row.click()
    await expect(row.getByLabel('New')).toHaveCount(0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a course starts open, named by its title, and what you close stays closed', async ({ page }) => {
  const dir = writeCourse('panel-open', 'Branding')
  try {
    const ws = await openFolder(page)
    await page.goto(`/w/${ws}`)
    const row = page.getByRole('treeitem', { name: 'Branding first steps' })
    await expect(row).toBeVisible()
    await expect(row.getByLabel('New')).toHaveCount(0) // it was there before you came
    await expect(page.getByRole('link', { name: 'Branding', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'panel-open' }).click()
    await expect(row).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('button', { name: 'panel-open' })).toBeVisible()
    await expect(row).toHaveCount(0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
