import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createConnection } from 'node:net'

// Settings, the window's place and the library go to a throw-away folder (XDG on Linux, HOME elsewhere). The library
// is named outright: its default is under the real HOME on Linux, which the app needs to start.
const home = mkdtempSync(join(tmpdir(), 'mdl-desk-'))
for (const dir of [join(home, 'config', 'mdlearn'), join(home, '.config', 'mdlearn')]) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'studio.json'), JSON.stringify({ libraryDir: join(home, 'library') }))
}
const env = { ...process.env, XDG_CONFIG_HOME: join(home, 'config'), HOME: process.platform === 'linux' ? process.env.HOME! : home, MDLEARN_TEST: '1' }
const exe = process.env.MDLEARN_DESKTOP_EXE
const launch = () => electron.launch(exe ? { executablePath: resolve(exe), args: [], env } : { args: [resolve(__dirname, '..')], env })
const portOpen = (port: number) => new Promise<boolean>((done) => { const s = createConnection(port, '127.0.0.1'); s.on('connect', () => { s.end(); done(true) }); s.on('error', () => done(false)) })

let app: ElectronApplication
test.afterEach(async () => { await app?.close().catch(() => {}) })

test('opens Studio in a locked-down window, and the tutorial works in it', async () => {
  app = await launch()
  const win = await app.firstWindow()
  await expect(win.getByRole('heading', { name: 'MDlearn Studio' })).toBeVisible({ timeout: 30_000 })
  expect(win.url()).toBe('http://127.0.0.1:4757/')
  expect(await win.evaluate(() => typeof (globalThis as { require?: unknown }).require)).toBe('undefined')
  const prefs = await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents as unknown as { getLastWebPreferences(): { contextIsolation?: boolean; sandbox?: boolean; nodeIntegration?: boolean } }
    const p = contents.getLastWebPreferences()
    return [p.contextIsolation, p.sandbox, p.nodeIntegration]
  })
  expect(prefs).toEqual([true, true, false])
  // a built app carries its own server (Node would otherwise find the repo's node_modules above the build folder)
  if (exe) expect(await app.evaluate(() => (process.getBuiltinModule('node:fs') as typeof import('node:fs')).existsSync(`${process.resourcesPath}/server/node_modules/@mdlearn/studio/package.json`))).toBe(true)
  await win.getByText('New here? Open the tutorial').click()
  await expect(win).toHaveURL(/\/w\/[^/]+/)
  await expect(win.getByRole('link', { name: 'Today' })).toBeVisible()
})

test('a built app carries what an AI job needs', async () => {
  app = await launch()
  const win = await app.firstWindow()
  await expect(win.getByRole('heading', { name: 'MDlearn Studio' })).toBeVisible({ timeout: 30_000 })
  const claude = await win.evaluate(async () => (await (await fetch('/api/engines')).json() as { claude: { error?: string } }).claude)
  expect(claude.error ?? '').not.toMatch(/skills plugin/) // Claude Code itself may be missing here; the app's own part may not
})

test('the capture window saves one thought into the folder and closes', async () => {
  app = await launch()
  const win = await app.firstWindow()
  await expect(win.getByRole('heading', { name: 'MDlearn Studio' })).toBeVisible({ timeout: 30_000 })
  await win.getByText('New here? Open the tutorial').click()
  await expect(win).toHaveURL(/\/w\/[^/]+/)
  const today = new URL(win.url()).pathname.split('/').slice(0, 3).join('/')
  const opening = app.waitForEvent('window')
  await app.evaluate(({ Menu }) => { Menu.getApplicationMenu()?.items.find((i) => i.label === 'File')?.submenu?.items.find((i) => i.label === 'Capture a thought')?.click() })
  const capture = await opening
  await expect(capture).toHaveURL(/\/capture\?once=1$/)
  const closed = capture.waitForEvent('close')
  const box = capture.getByRole('textbox', { name: 'Capture a thought' })
  await box.fill('A thought from anywhere')
  await Promise.all([closed, box.press('Enter').catch(() => {})]) // Enter closes the window, sometimes before the press has returned
  await win.goto(new URL(today, win.url()).href)
  await expect(win.getByText('A thought from anywhere')).toBeVisible()
})

test('a PDF is read with nothing else installed', async () => {
  app = await launch()
  const win = await app.firstWindow()
  await expect(win.getByRole('heading', { name: 'MDlearn Studio' })).toBeVisible({ timeout: 30_000 })
  await win.getByText('New here? Open the tutorial').click()
  await expect(win).toHaveURL(/\/w\/[^/]+/)
  const ws = new URL(win.url()).pathname.split('/')[2]
  const pdf = readFileSync(resolve(__dirname, '../../studio/test/fixtures/sample.pdf')).toString('base64')
  const summary = await win.evaluate(async ({ ws, pdf }) => {
    const form = new FormData()
    form.append('kind', 'pdf-fast')
    form.append('file', new File([Uint8Array.from(atob(pdf), (c) => c.charCodeAt(0))], 'sample.pdf'))
    const r = await fetch(`/api/w/${ws}/import/file`, { method: 'POST', body: form, headers: { 'x-mdl': '1' } })
    return ((await r.json()) as { summary: string }).summary
  }, { ws, pdf })
  expect(summary).toMatch(/2 pages/)
})

test('web links open in the browser, Studio\'s own pages in an app window, other schemes nowhere', async () => {
  app = await launch()
  const win = await app.firstWindow()
  await expect(win.getByRole('heading', { name: 'MDlearn Studio' })).toBeVisible({ timeout: 30_000 })
  await app.evaluate(({ shell }) => { (globalThis as { opened?: string[] }).opened = []; shell.openExternal = async (url: string) => { (globalThis as unknown as { opened: string[] }).opened.push(url) } })
  await win.evaluate(() => { window.open('https://ollama.com/library'); window.open('file:///etc/passwd'); window.open('javascript:alert(1)') })
  await expect.poll(() => app.evaluate(() => (globalThis as { opened?: string[] }).opened)).toEqual(['https://ollama.com/library'])
  const [child] = await Promise.all([app.waitForEvent('window'), win.evaluate(() => { window.open('/api/session') })])
  await expect.poll(() => child.url()).toBe('http://127.0.0.1:4757/api/session')
  expect(app.windows()).toHaveLength(2)
})

test('a second start shows the first window, and quitting stops the server', async () => {
  app = await launch()
  const win = await app.firstWindow()
  await expect(win.getByRole('heading', { name: 'MDlearn Studio' })).toBeVisible({ timeout: 30_000 })
  const electronPath = await app.evaluate(() => process.execPath)
  const second = spawn(electronPath, exe ? [] : [resolve(__dirname, '..')], { env, stdio: 'ignore' })
  const code = await new Promise<number | null>((done) => second.on('exit', done))
  expect(code).toBe(0) // it hands over to the running app and leaves
  expect(app.windows()).toHaveLength(1)
  expect(await portOpen(4757)).toBe(true)
  await app.close()
  await expect.poll(() => portOpen(4757), { timeout: 10_000 }).toBe(false)
})
