import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createConnection } from 'node:net'

// Settings, the window's place and the library go to a throw-away config folder (XDG on Linux, HOME elsewhere)
const home = mkdtempSync(join(tmpdir(), 'mdl-desk-'))
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
  expect(win.url()).toBe('http://localhost:4757/')
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

test('web links open in the browser, Studio\'s own pages in an app window, other schemes nowhere', async () => {
  app = await launch()
  const win = await app.firstWindow()
  await expect(win.getByRole('heading', { name: 'MDlearn Studio' })).toBeVisible({ timeout: 30_000 })
  await app.evaluate(({ shell }) => { (globalThis as { opened?: string[] }).opened = []; shell.openExternal = async (url: string) => { (globalThis as unknown as { opened: string[] }).opened.push(url) } })
  await win.evaluate(() => { window.open('https://ollama.com/library'); window.open('file:///etc/passwd'); window.open('javascript:alert(1)') })
  await expect.poll(() => app.evaluate(() => (globalThis as { opened?: string[] }).opened)).toEqual(['https://ollama.com/library'])
  const [child] = await Promise.all([app.waitForEvent('window'), win.evaluate(() => { window.open('/api/session') })])
  await expect.poll(() => child.url()).toBe('http://localhost:4757/api/session')
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
