// electron-builder leaves node_modules out of extraResources, so the staged server (build/server, made by
// scripts/stage-desktop.ts) is copied into the app's resources here: after the app folder exists, before the
// installers are made and before macOS signs it.
const { cpSync, existsSync } = require('node:fs')
const { join } = require('node:path')

exports.default = async function afterPack(context) {
  const from = join(__dirname, 'build', 'server')
  if (!existsSync(join(from, 'node_modules', '@mdlearn', 'studio', 'package.json'))) throw new Error('Stage the server first: npm run stage -w @mdlearn/desktop')
  const resources = context.electronPlatformName === 'darwin'
    ? join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : join(context.appOutDir, 'resources')
  cpSync(from, join(resources, 'server'), { recursive: true })
}
