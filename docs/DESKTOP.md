# MDlearn desktop app

The desktop app is MDlearn Studio in its own window, for people who would rather not use a terminal. It has the
same features as the web app (`mdlearn studio`), reads the same settings (`~/.config/mdlearn/studio.json`: recent
folders, library, local AI) and can run next to it. *File → Open in your browser* shows the page you are on in
your browser at any time.

| | |
|---|---|
| Windows | `MDlearn-<version>-win-x64.exe` (installer, per user, no admin rights) or `…-win-x64.zip` |
| macOS | `MDlearn-<version>-mac-arm64.dmg` (Apple Silicon) or `…-mac-x64.dmg` (Intel), and `.zip` of each |
| Linux | `MDlearn-<version>-linux-x86_64.AppImage`, `…-linux-amd64.deb` or `…-linux-x64.zip` |

They are built by the *Desktop app* workflow (`.github/workflows/desktop.yml`) and attached to the release of
each version tag, with `SHA256SUMS.txt` to check a download (`sha256sum -c SHA256SUMS.txt --ignore-missing`).

## First open of an unsigned build

The builds are not signed with a paid certificate yet, so the system asks once:

- **Windows** — SmartScreen says "Windows protected your PC": choose *More info → Run anyway*.
- **macOS** — the app is ad-hoc signed, not notarized. Open it once; when macOS refuses, go to *System Settings →
  Privacy & Security* and choose *Open Anyway* (or right-click the app → *Open*).
- **Linux** — make the AppImage executable (`chmod +x MDlearn-*.AppImage`); it needs FUSE 2 (`fuse2` on Arch,
  `libfuse2` on Debian/Ubuntu), or run it with `--appimage-extract-and-run`. The `.deb` installs with
  `sudo apt install ./MDlearn-*.deb`.

Signing later needs an Apple Developer ID (notarization) and a Windows code-signing certificate; electron-builder
reads them from `CSC_LINK`/`CSC_KEY_PASSWORD` (and `APPLE_ID`… for notarization) in the workflow's secrets.
There is no automatic update yet: the repository is private, so the app could not fetch new versions from it.

## How it works

`packages/desktop` is an Electron app (Electron 44, with Node 24, which has `node:sqlite` and zstd):

- **The server beside the window** (`src/sidecar.ts`). The app starts `resources/server/start.mjs` with its own
  Node (`ELECTRON_RUN_AS_NODE=1`), so Studio runs exactly as `mdlearn studio` does: same code, same
  `process.execPath` rules (the MCP server for Claude jobs gets `ELECTRON_RUN_AS_NODE` too; no other program
  Studio starts does). The server prints `MDLEARN_READY <token> http://localhost:4757/`, with a random token the app
  gave it; the window loads that port on `127.0.0.1`. Port 4757 is fixed (the next free one if taken) so the page's
  own preferences survive restarts. What the server prints goes to
  `<user data>/logs/studio.log` (one older log kept past 5 MB); if it does not start within 30 s, a dialog says so
  and names the log.
- **Stopping.** Quitting closes the server's stdin; it closes its watchers and exits. After 4 s the app kills its
  whole process group (on Windows, the process). SIGTERM to the app does the same.
- **One app at a time.** A second start hands over to the running app, which comes to the front.
- **The window** (`src/main.ts`) remembers its size and place (`window.json`, ignored when that screen is gone).
- **Capture.** *File → Capture a thought*, or Ctrl+Alt+Space from anywhere, opens a small window on Studio's
  `/capture` page. It saves into the folder opened last and closes. The global key is taken where the desktop allows
  it, which Wayland often does not; the menu always works.

The packaged server is prepared by `scripts/stage-desktop.ts`: it copies, from this checkout's `node_modules`, the
packages the server needs at run time and nothing else — the exact versions in `package-lock.json`, with no
download. Packages used only by the web page are `devDependencies` of Studio (Vite has already bundled them into
`dist/web`), and the Agent SDK's own `claude` binary (234 MB) is left out: the user's Claude Code is found as in
the web app (settings, mise, Claude Code's installer in `~/.local/bin`, the PATH — launcher scripts are skipped, and on
Windows the program behind npm's `claude.cmd` is used). Claude runs with a short list of environment variables, which on
Windows includes the ones it needs to find its login and reach the network. *Settings → Local AI* shows what was found,
why it did not start if so, and *Check again*.
electron-builder leaves `node_modules` out of extra resources, so `after-pack.cjs` copies the staged server into
`resources/server` before the installers are made and before macOS signs the app.

## Security

| Area | Choice |
|---|---|
| The page | `contextIsolation`, `sandbox`, no `nodeIntegration`, no preload, no `<webview>`: the page is the same web page as in a browser, with Studio's CSP and API checks |
| Links | Studio's own pages (same origin) open in an app window; `https:`, `http:` and `mailto:` links open in the browser or mail app, passed on exactly as checked (parsed), never with a `user:password@`; every other scheme (`file:`, `javascript:` …) is refused, for new windows and for navigation alike |
| Permissions | camera, microphone, notifications, location … are all refused; only writing to the clipboard is allowed |
| Spell checking | the system's on Windows and macOS; off on Linux, where Electron would download dictionaries from Google |
| The server | the same server as `mdlearn studio` on `127.0.0.1` (never on the network: the desktop app has no `--lan`). Only the ready line with the app's token counts, and only a `localhost`/`127.0.0.1` address in it; the window uses `127.0.0.1`, not `localhost`, which may also mean `::1`, where another user's program could listen |
| Saved window | only the four numbers of its position are read back from `window.json` |
| Electron's switches | *run as Node* stays on (the server and the MCP server run that way) and so does `--inspect` (Playwright drives the built app with it in the tests); either lets a program already running as you run code as MDlearn, which it could do anyway. The server's files (`resources/server`) are outside the app archive, as writable as the rest of a per-user install |
| Builds | the workflow builds with a read-only token and checkout keeps no credentials; only the release job, which runs no project code, may write, to attach the files and their checksums |
| Dependencies | Electron and electron-builder pinned; their sub-dependencies kept to releases at least two weeks old (root `overrides`); the staged server is copied from the lockfile's versions, links resolved to files |

## Building it

```bash
npm install && npm run build      # Studio first
npm run desktop:dev               # the app from this checkout, with the repo's Studio
npm run desktop:dist              # this system's installers, in packages/desktop/release/
```

On Linux `desktop:dist` makes the AppImage, `.deb` and `.zip`; Windows and macOS builds need their own system
(the workflow uses GitHub's runners).

## Tests

`packages/desktop/test` (Vitest): the ready line, where links open, the saved window position, and the server
beside the window (ready, logs, stops; a server that exits or never answers). `packages/desktop/e2e` (Playwright
for Electron): the window opens Studio with the page locked down, the tutorial works in it, links open where they
should, a second start hands over, quitting frees the port, and a built app carries its own server
(`MDLEARN_DESKTOP_EXE=release/linux-unpacked/mdlearn npx playwright test`; the workflow runs it on every system).
