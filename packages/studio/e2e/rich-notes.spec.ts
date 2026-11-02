import { test, expect } from '@playwright/test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openFolder, resetProgress, testRoot } from './helpers'

const NOTE = `---
id: marketing-precio
lang: es
level: beginner
goals: [Fijar un precio]
study: true
---

# Fijar un precio

## El precio y el valor {#precio-valor}

El <mark data-tone="definition">valor percibido</mark> es lo que el cliente cree recibir. Un error típico es
<mark data-tone="trap">partir solo del coste</mark>.

:::quiz
¿Qué fija el techo de un precio?

- [x] El valor percibido
  > Eso es: nadie paga más de lo que cree que vale.
- [ ] El coste
  > El coste fija el suelo, no el techo.
:::
`

function writeNote() {
  const dir = join(testRoot(), 'curso-rico')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'course.md'), '# Marketing\n\nEl curso.\n')
  writeFileSync(join(dir, '01-precio.md'), NOTE)
  return dir
}
const background = (el: import('@playwright/test').Locator) => el.evaluate((e) => getComputedStyle(e).backgroundColor)

test('a note reads as a document, with highlights that say what they are', async ({ page }) => {
  const dir = writeNote()
  try {
    const ws = await openFolder(page)
    await page.goto(`/w/${ws}/doc?path=curso-rico/01-precio.md`)
    await expect(page.getByRole('heading', { name: 'El precio y el valor Link to this section', exact: true })).toBeVisible() // not {#precio-valor}
    const definition = page.locator('article .read p:not(.tone-legend) mark[data-tone="definition"]'), trap = page.locator('article .read p:not(.tone-legend) mark[data-tone="trap"]')
    await expect(definition).toHaveAttribute('title', 'Definition')
    expect(await background(definition)).not.toBe(await background(trap))
    const legend = page.getByRole('group', { name: 'What the highlights mean' })
    await expect(legend.getByText('Definition')).toBeVisible()
    await expect(legend.getByText('Common mistake')).toBeVisible()
    await expect(page.getByRole('link', { name: '01 precio' })).toHaveCount(1) // listed once
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('its exercise comes up in Study and leads back to the note', async ({ page }) => {
  resetProgress()
  const dir = writeNote()
  try {
    const ws = await openFolder(page)
    await page.goto(`/w/${ws}/study?scope=marketing-precio`)
    await expect(page.getByText('¿Qué fija el techo de un precio?')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('link', { name: 'Read this in your notes' }).click()
    await expect(page).toHaveURL(/\/doc\?path=curso-rico%2F01-precio\.md&section=precio-valor/)
    await expect(page.getByRole('heading', { name: 'El precio y el valor Link to this section', exact: true })).toBeInViewport()
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
