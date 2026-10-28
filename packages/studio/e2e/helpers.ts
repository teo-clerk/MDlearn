import type { Page } from '@playwright/test'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
/** The test folder's workspace id (by its path: other folders, such as the tutorial, may have been opened since). */
export async function openFolder(page: Page) {
  const ws = await page.request.get('/api/workspaces').then((r) => r.json() as Promise<{ id: string; name: string; root: string }[]>)
  const root = testRoot()
  return (ws.find((w) => w.root === root) ?? ws[0]).id
}
export const RADAR = '00_FOUNDATIONS/04_radar.md'
/** Forget all study progress in the test folder (each study test starts with new cards). */
export function resetProgress() {
  const root = readFileSync(join(import.meta.dirname, '.root'), 'utf8').trim()
  rmSync(join(root, 'learn/.mdlearn/progress.json'), { force: true })
}
/** The folder the test server serves. */
export const testRoot = () => readFileSync(join(import.meta.dirname, '.root'), 'utf8').trim()
export const fakePagePort = () => readFileSync(join(import.meta.dirname, '.ollama-port'), 'utf8').trim()
/** A POST from the page itself (same origin, with the header the server requires on changes). */
export async function post<T>(page: Page, path: string, body: unknown = {}): Promise<T> {
  return page.evaluate(async ([p, b]) => {
    const r = await fetch(p, { method: 'POST', headers: { 'x-mdl': '1', 'content-type': 'application/json' }, body: JSON.stringify(b) })
    if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`)
    return r.json()
  }, [path, body] as const) as Promise<T>
}
/** The interactive tutorial, freshly copied into the (temporary) library; returns its workspace id. */
export async function openTutorial(page: Page): Promise<string> {
  await page.goto('/')
  return (await post<{ id: string }>(page, '/api/workspaces/tutorial', { reset: true })).id
}
