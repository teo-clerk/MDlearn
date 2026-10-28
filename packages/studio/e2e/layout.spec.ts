import { test, expect } from '@playwright/test'
import { openFolder, RADAR } from './helpers'

// Every page fits the screen (no sideways scrolling of the page itself) and loads without errors, on a
// desktop and on a phone, in light and dark.
const ROUTES = (ws: string) => [
  `/w/${ws}`, `/w/${ws}/doc?path=${encodeURIComponent(RADAR)}`, `/w/${ws}/study`, `/w/${ws}/progress`, `/w/${ws}/ask`,
  `/w/${ws}/formulas`, `/w/${ws}/glossary`, `/w/${ws}/map`, `/w/${ws}/help`, `/w/${ws}/settings`, `/w/${ws}/sheet?path=${encodeURIComponent(RADAR)}`,
]
for (const scheme of ['light', 'dark'] as const) {
  test(`every page fits the screen (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    const ws = await openFolder(page)
    for (const route of ROUTES(ws)) {
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, `${route} scrolls sideways`).toBeLessThanOrEqual(1)
      // the page names itself in the top bar
      await expect(page.locator('#topbar-left')).not.toBeEmpty()
    }
    expect(errors).toEqual([])
  })
}


// The app frame stays put: only its panes scroll. A wheel past the end of a page, something taller than the
// window, or a script scrolling the frame must not slide the whole app up and leave an empty band below it.
test('the app frame never scrolls, only its panes do', async ({ page }) => {
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}/doc?path=${encodeURIComponent(RADAR)}`)
  await page.waitForLoadState('networkidle')
  const frame = () => page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('#root > div')!
    return { doc: document.scrollingElement!.scrollTop, root: document.getElementById('root')!.scrollTop, shell: shell.scrollTop, bottom: Math.round(shell.getBoundingClientRect().bottom), vh: innerHeight }
  })
  expect(await page.evaluate(() => [getComputedStyle(document.documentElement).overscrollBehaviorY, getComputedStyle(document.getElementById('main')!).overscrollBehaviorY])).toEqual(['none', 'contain'])
  // something far below the window (as a stray absolutely placed element would be), then scroll past the end
  await page.evaluate(() => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;top:3000px;height:10px;width:10px'; document.body.append(d) })
  await page.mouse.move(600, 400)
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 800)
  // scripts cannot scroll the frame either (overflow: clip, unlike hidden)
  await page.evaluate(() => { document.querySelector<HTMLElement>('#root > div')!.scrollTop = 400; document.getElementById('root')!.scrollTop = 400 })
  const f = await frame()
  expect(f).toMatchObject({ doc: 0, root: 0, shell: 0 })
  expect(f.bottom).toBe(f.vh)
})

test('Ctrl+K: no clipped focus ring, the shortcut sits on the right, the selection stays in view', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'keyboard palette')
  await page.setViewportSize({ width: 1000, height: 520 }) // a short window, so the list has to scroll
  const ws = await openFolder(page)
  await page.goto(`/w/${ws}`)
  await page.keyboard.press('Control+k')
  const input = page.getByRole('combobox', { name: 'Search' })
  await expect(input).toBeFocused()
  expect(await input.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none')
  await expect(page.getByRole('option', { name: /Help, the tour/ }).locator('kbd')).toHaveText('?')
  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowDown')
  const inView = await page.evaluate(() => {
    const a = document.querySelector('[role=option][aria-selected=true]')!.getBoundingClientRect(), b = document.getElementById('palette-list')!.getBoundingClientRect()
    return a.top >= b.top - 1 && a.bottom <= b.bottom + 1
  })
  expect(inView).toBe(true)
})
