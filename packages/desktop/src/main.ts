// MDlearn as a desktop app: Studio's server runs beside the window (see sidecar.ts) and the window shows it, so
// everything works as in the browser. The window is locked down: no Node in the page, a sandbox, no new
// permissions; Studio's own pages stay in the app and other links open in the browser. File → Open in your
// browser shows the same Studio there at any time.
import { app, BrowserWindow, dialog, globalShortcut, Menu, nativeTheme, screen, session, shell, type MenuItemConstructorOptions, type WebContents } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { boundsFrom, onScreen, openingFor, type Bounds } from './rules'
import { startSidecar, type Sidecar } from './sidecar'

const PORT = 4757 // fixed, so the page's own preferences (theme, accent) persist from one start to the next
app.setName('MDlearn')

let sidecar: Sidecar | null = null
let main: BrowserWindow | null = null
let capture: BrowserWindow | null = null
const CAPTURE_KEY = 'CmdOrCtrl+Alt+Space'
let quitting = false
const stateFile = () => join(app.getPath('userData'), 'window.json')
const resource = (name: string) => (app.isPackaged ? join(process.resourcesPath, name) : join(__dirname, '..', name === 'icon.png' ? 'build-res' : '', name))

function savedBounds(): Bounds | undefined {
  try {
    const b = boundsFrom(JSON.parse(readFileSync(stateFile(), 'utf8')))
    return b && onScreen(b, screen.getAllDisplays().map((d) => d.workArea)) ? b : undefined
  } catch { return undefined }
}

/** Links and new windows: Studio's pages in the app, web and mail links outside, nothing else. */
function guard(contents: WebContents, origin: string) {
  contents.setWindowOpenHandler(({ url }) => {
    const to = openingFor(url, origin)
    if (to.where === 'external') void shell.openExternal(to.url)
    return to.where === 'window' ? { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true } } : { action: 'deny' }
  })
  contents.on('will-navigate', (e, url) => {
    const to = openingFor(url, origin)
    if (to.where === 'window') return
    e.preventDefault()
    if (to.where === 'external') void shell.openExternal(to.url)
  })
  contents.on('will-attach-webview', (e) => e.preventDefault())
}

function createWindow(url: string) {
  const bounds = savedBounds()
  const win = new BrowserWindow({
    ...(bounds ?? { width: 1280, height: 860 }), minWidth: 380, minHeight: 480, show: false,
    title: 'MDlearn', icon: resource('icon.png'), backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff',
    webPreferences: {
      contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false,
      // Linux has no system spell checker: Electron would download dictionaries from Google, so it stays off there
      spellcheck: process.platform !== 'linux',
    },
  })
  win.once('ready-to-show', () => win.show())
  win.on('close', () => { try { writeFileSync(stateFile(), JSON.stringify(win.getNormalBounds())) } catch { /* not important */ } })
  win.on('closed', () => { if (main === win) main = null })
  void win.loadURL(url)
  main = win
}

/** A small window for one thought, from anywhere. Studio's own page, so the window guard applies to it as to any other. */
function openCapture(origin: string) {
  if (capture) { capture.focus(); return }
  const win = new BrowserWindow({
    width: 520, height: 250, resizable: false, minimizable: false, maximizable: false, alwaysOnTop: true, show: false, autoHideMenuBar: true,
    title: 'Capture', icon: resource('icon.png'), backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false, spellcheck: process.platform !== 'linux' },
  })
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => { capture = null })
  void win.loadURL(`${origin}/capture?once=1`)
  capture = win
}

function menu(origin: string): Menu {
  const openInBrowser = () => {
    const here = main ? openingFor(main.webContents.getURL(), origin) : null
    void shell.openExternal(here?.where === 'window' ? here.url : `${origin}/`)
  }
  const mac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(mac ? [{ role: 'appMenu' as const }] : []),
    { label: 'File', submenu: [
      { label: 'Capture a thought', accelerator: CAPTURE_KEY, click: () => openCapture(origin) },
      { label: 'Open in your browser', accelerator: 'CmdOrCtrl+Shift+O', click: openInBrowser },
      { type: 'separator' },
      mac ? { role: 'close' } : { role: 'quit' },
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [
      { role: 'reload' }, ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' as const }]),
      { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' }, { role: 'togglefullscreen' },
    ] },
    { role: 'windowMenu' },
  ]
  return Menu.buildFromTemplate(template)
}

async function start() {
  const logFile = join(app.getPath('userData'), 'logs', 'studio.log')
  try {
    sidecar = await startSidecar({ entry: resource(join('server', 'start.mjs')), port: PORT, logFile })
  } catch (e) {
    dialog.showErrorBox('MDlearn could not start', `${(e as Error).message}\n\nWhat the server printed is in ${logFile}.`)
    app.exit(1)
    return
  }
  const origin = new URL(sidecar.url).origin
  // the page asks for nothing beyond what a web page has (copying to the clipboard)
  session.defaultSession.setPermissionRequestHandler((_wc, permission, done) => done(permission === 'clipboard-sanitized-write'))
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'clipboard-sanitized-write')
  app.on('web-contents-created', (_e, contents) => guard(contents, origin))
  Menu.setApplicationMenu(menu(origin))
  createWindow(sidecar.url)
  // not every desktop lets an app take a global key (Wayland, a key already in use): the File menu still has it
  globalShortcut.register(CAPTURE_KEY, () => openCapture(origin))
  app.on('activate', () => { if (!main && sidecar) createWindow(sidecar.url) })
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => { if (main) { if (main.isMinimized()) main.restore(); main.focus() } })
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
  app.on('will-quit', () => globalShortcut.unregisterAll())
  app.on('before-quit', (e) => {
    if (quitting || !sidecar) return
    e.preventDefault()
    quitting = true
    void sidecar.stop().finally(() => app.quit())
  })
  void app.whenReady().then(start)
}
