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
import { webPicture, type PictureFetch } from '../server/web-pictures'

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
  it('lets nothing in a document reach the web by itself', () => {
    const csp = pageCsp(false)
    expect(csp).not.toMatch(/img-src [^;]*https?:/)
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

describe('a picture from the web', () => {
  const pictureApp = (pictureFetch: PictureFetch) => {
    const settings = settingsStore(join(tmp('mdl-cfg-'), 's.json'))
    return createApp({ version: 't', security: { port: 1, lan: false, lanFull: false, token: 'x'.repeat(43) }, settings, workspaces: new Workspaces(settings), bus: new EventBus(), serverId: 's', pictureFetch })
  }
  const site = (reply: (url: URL) => Response, ips: Record<string, string[]> = { 'pictures.example.org': ['93.184.216.34'] }) => {
    const asked: string[] = []
    const net: PictureFetch = {
      fetch: (async (url: URL) => { asked.push(url.href); return reply(url) }) as typeof fetch,
      resolve: async (host) => ips[host] ?? [],
    }
    return { net, asked }
  }

  it('comes through as a picture', async () => {
    const { net } = site(() => new Response(PNG))
    const r = await webPicture('https://pictures.example.org/a.png?x=1', net)
    expect(r.type).toBe('image/png')
    expect([...r.bytes]).toEqual([...PNG])
  })
  it('must really be a picture', async () => {
    const { net } = site(() => new Response('<svg onload="alert(1)"/>', { headers: { 'content-type': 'image/png' } }))
    await expect(webPicture('https://pictures.example.org/a.png', net)).rejects.toThrow(/not a PNG/)
  })
  for (const [url, why] of [
    ['http://pictures.example.org/a.png', 'plain http'], ['https://user:pw@pictures.example.org/a.png', 'a login in the address'],
    ['https://127.0.0.1/a.png', 'this computer'], ['https://[::1]/a.png', 'this computer over IPv6'], ['https://[::ffff:10.0.0.1]/a.png', 'a mapped private address'], ['https://[64:ff9b::7f00:1]/a.png', 'this computer through NAT64'], ['https://[2002:7f00:1::]/a.png', 'this computer through 6to4'], ['https://[2001:0:7f00:1::]/a.png', 'a Teredo address'],
    ['https://192.168.1.1/a.png', 'the local network'], ['https://169.254.169.254/latest', 'a cloud metadata address'], ['https://nowhere.invalid/a.png', 'a name that does not resolve'], ['not a url', 'no address at all'],
  ]) it(`refuses ${why}`, async () => {
    const { net, asked } = site(() => new Response(PNG))
    await expect(webPicture(url, net)).rejects.toThrow(/public website/)
    expect(asked).toEqual([])
  })
  it('refuses a name that points inside the network', async () => {
    const { net, asked } = site(() => new Response(PNG), { 'router.example.org': ['93.184.216.34', '10.0.0.1'] })
    await expect(webPicture('https://router.example.org/a.png', net)).rejects.toThrow(/public website/)
    expect(asked).toEqual([])
  })
  it('checks every redirect', async () => {
    const { net, asked } = site((u) => (u.pathname === '/a.png' ? new Response(null, { status: 302, headers: { location: 'http://pictures.example.org/b.png' } }) : new Response(PNG)))
    await expect(webPicture('https://pictures.example.org/a.png', net)).rejects.toThrow(/public website/)
    expect(asked).toEqual(['https://pictures.example.org/a.png'])
  })
  for (const [to, why] of [['https://elsewhere.example.net/b.png?from=allowed', 'another site'], ['https://127.0.0.1/secret.png', 'this computer'], ['http://[', 'a broken address']]) it(`does not let an allowed site send the request on to ${why}`, async () => {
    const { net, asked } = site(() => new Response(null, { status: 302, headers: { location: to } }))
    await expect(webPicture('https://pictures.example.org/a.png', net)).rejects.toThrow(/could not be loaded/)
    expect(asked).toEqual(['https://pictures.example.org/a.png'])
  })
  it('follows a redirect within the site', async () => {
    const { net } = site((u) => (u.pathname === '/a.png' ? new Response(null, { status: 301, headers: { location: '/b.png' } }) : new Response(PNG)))
    expect((await webPicture('https://pictures.example.org/a.png', net)).type).toBe('image/png')
  })
  it('gives up on a redirect loop', async () => {
    const { net, asked } = site(() => new Response(null, { status: 302, headers: { location: '/again' } }))
    await expect(webPicture('https://pictures.example.org/a.png', net)).rejects.toThrow(/could not be loaded/)
    expect(asked.length).toBeLessThan(6)
  })
  it('says so when a site does not answer', async () => {
    const { net } = site(() => new Response('gone', { status: 404 }))
    await expect(webPicture('https://pictures.example.org/a.png', net)).rejects.toThrow(/could not be loaded/)
  })
  it('is refused without the header a plain <img> cannot send', async () => {
    const { net, asked } = site(() => new Response(PNG))
    const app = pictureApp(net)
    const direct = await app.request('/api/web-picture?url=https://pictures.example.org/a.png', { headers: { host: 'localhost:1' } })
    expect(direct.status).toBe(403)
    expect(asked).toEqual([])
    const asFetch = await app.request('/api/web-picture?url=https://pictures.example.org/a.png', { headers: { host: 'localhost:1', 'x-mdl': '1' } })
    expect(asFetch.status).toBe(200)
    expect(asFetch.headers.get('content-type')).toBe('image/png')
  })
})
