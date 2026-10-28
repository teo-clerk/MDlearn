import { test, expect, type Page } from '@playwright/test'
import { openFolder } from './helpers'

const canvas = (page: Page, mode: '2d' | '3d' = '2d') => page.locator(`[data-graph="${mode}"][data-ready]`)
/** Choose a document from the search, which also centres the camera on it (at once, with reduced motion). */
async function chooseFromSearch(page: Page, query: string, title: string) {
  await page.getByRole('searchbox', { name: 'Find a document in the graph' }).fill(query)
  await expect(page.getByRole('status').filter({ hasText: /1 match/ })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Find a document in the graph' }).press('Enter')
  await expect(page.getByRole('heading', { name: title, level: 2 })).toBeVisible()
}
async function centreOf(page: Page) {
  // on a phone the panel (and its search box) sits below the drawing, so the page may have scrolled past it
  await page.locator('[data-graph="2d"]').scrollIntoViewIfNeeded()
  const box = (await page.locator('[data-graph="2d"]').boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }) })

test('the graph draws the folder; a document is found, lit with its neighbours, and opened with a click', async ({ page, isMobile }) => {
  const requested: string[] = []
  page.on('request', (r) => requested.push(r.url()))
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/map`)
  await expect(canvas(page)).toBeVisible()
  await expect(page.getByText(/^\d+ documents · \d+ connections?$/)).toBeVisible()
  expect(requested.some((u) => /graphEngine3d/.test(u)), 'the 3D view is loaded only when asked for').toBe(false)

  await expect(page.getByRole('searchbox', { name: 'Find a document in the graph' })).not.toBeFocused()
  await chooseFromSearch(page, 'radar terms', 'Radar terms')
  // the keyboard lands on the chosen document, and back on the search when it is closed
  await expect(page.getByRole('heading', { name: 'Radar terms', level: 2 })).toBeFocused()
  await expect(page.getByRole('link', { name: 'Graph around it' })).toBeVisible()
  if (isMobile) {
    // a tap chooses (there is no hover to preview); the panel opens it
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('searchbox', { name: 'Find a document in the graph' })).toBeFocused()
    const again = await centreOf(page)
    // the library finds what is under a tap on a copy of the drawing it refreshes every 800 ms
    await expect(async () => {
      await page.touchscreen.tap(again.x, again.y)
      await expect(page.getByRole('heading', { name: 'Radar terms', level: 2 })).toBeVisible({ timeout: 500 })
    }).toPass({ timeout: 10_000 })
    await page.getByRole('link', { name: 'Open', exact: true }).click()
  } else {
    const at = await centreOf(page)
    await page.mouse.move(at.x, at.y)
    await expect(page.locator('[data-graph="2d"] ~ div').getByText('Radar terms', { exact: true })).toBeVisible()
    await page.mouse.down(); await page.mouse.up()
  }
  await expect(page).toHaveURL(/\/doc\?path=demo%2Fradar-terms\.md/)
})

test('around one document: its neighbours a step away, more with the slider; filters and 3D on demand', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the same controls; 3D is a desktop check')
  const requested: string[] = []
  page.on('request', (r) => requested.push(r.url()))
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/map?doc=demo%2Fradar-terms.md`)
  await expect(page.getByText(/^Around Radar terms/)).toBeVisible()
  await expect(canvas(page)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Radar terms', level: 2 })).toBeVisible()
  const slider = page.getByRole('slider', { name: 'Steps away' })
  await expect(slider).toHaveValue('1')
  await slider.fill('2')
  await expect(slider).toHaveAttribute('aria-valuetext', '2 steps')
  // without links, nothing joins it to the rest
  await page.getByLabel('Links').uncheck()
  await expect(page.getByRole('heading', { name: 'Radar terms', level: 2 })).toBeVisible()
  await page.getByLabel('Links').check()

  await page.getByRole('button', { name: '3D' }).click()
  await expect(canvas(page, '3d').or(page.getByText(/3D view could not start/))).toBeVisible({ timeout: 30_000 })
  expect(requested.some((u) => /graphEngine3d/.test(u))).toBe(true)
  // the choice is remembered on this device
  await page.reload()
  await expect(page.getByRole('button', { name: '3D' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '2D' }).click()
  await expect(canvas(page)).toBeVisible()

  await page.getByRole('link', { name: 'Layers' }).click()
  await expect(page).toHaveURL(/view=layers/)
  await expect(page.getByLabel('Include links')).toBeVisible()
  await page.getByRole('link', { name: 'Whole folder' }).click()
  await expect(page).toHaveURL(new RegExp(`/w/${ws}/map\\?view=layers$`))
})
