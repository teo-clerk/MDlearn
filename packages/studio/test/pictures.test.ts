import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createApp } from '../server/app'
import { EventBus } from '../server/bus'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import { pageCsp } from '../server/security'
import { pictureType } from '../server/pictures'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))

function setup() {
  const root = tmp('mdl-pic-')
  mkdirSync(join(root, 'week 1'))
  writeFileSync(join(root, 'week 1/Heat Engines.md'), '# Heat engines\n')
  const settings = settingsStore(join(tmp('mdl-cfg-'), 's.json'))
  const workspaces = new Workspaces(settings)
  const app = createApp({ version: 't', security: { port: 1, lan: false, lanFull: false, token: 'x'.repeat(43) }, settings, workspaces, bus: new EventBus(), serverId: 't' })
  const h = workspaces.open(root)
  const send = (doc: string, bytes: Uint8Array, name = 'p.png') => {
    const form = new FormData(); form.set('doc', doc); form.set('file', new File([bytes as BlobPart], name))
    return app.request(`/api/w/${h.id}/pictures`, { method: 'POST', body: form, headers: { host: 'localhost:1', 'x-mdl': '1' } })
  }
  return { root, send }
}

describe('pictures', () => {
  it('lets a document show pictures from the web, and only pictures', () => {
    const csp = pageCsp(false)
    expect(csp).toMatch(/img-src [^;]*https:/)
    expect(csp).toMatch(/default-src 'self'/)
    expect(csp).toMatch(/connect-src 'self'(;|$)/)
    expect(csp).not.toMatch(/script-src[^;]*https:/)
  })
  it('tells a picture by its first bytes', () => {
    expect(pictureType(PNG)).toBe('png')
    expect(pictureType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg')
    expect(pictureType(new TextEncoder().encode('GIF89a...'))).toBe('gif')
    expect(pictureType(new TextEncoder().encode('RIFF....WEBPVP8 '))).toBe('webp')
    expect(pictureType(new TextEncoder().encode('<svg onload="alert(1)"></svg>'))).toBeNull()
  })
  it('saves a pasted picture beside the folder and gives the link from the document', async () => {
    const { root, send } = setup()
    const r = await send('week 1/Heat Engines.md', PNG)
    expect(r.status).toBe(200)
    const body = await r.json() as { path: string; url: string }
    expect(body).toEqual({ path: 'assets/heat-engines/image.png', url: '../assets/heat-engines/image.png' })
    expect([...readFileSync(join(root, body.path))]).toEqual([...PNG])
    expect((await (await send('week 1/Heat Engines.md', PNG)).json() as { path: string }).path).toBe('assets/heat-engines/image-2.png')
  })
  it('refuses something that only claims to be a picture', async () => {
    const { root, send } = setup()
    const r = await send('week 1/Heat Engines.md', new TextEncoder().encode('<html><script>alert(1)</script>'), 'evil.png')
    expect(r.status).toBe(400)
    expect((await r.json() as { error: { message: string } }).error.message).toMatch(/PNG, JPEG, GIF or WebP/)
    expect(existsSync(join(root, 'assets'))).toBe(false)
  })
  it('stays inside the folder', async () => {
    const { send } = setup()
    expect((await send('../../etc/notes.md', PNG)).status).toBe(403)
  })
})
