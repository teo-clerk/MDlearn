import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, cpSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer, type Server } from 'node:http'
import { createApp } from '../server/app'
import { EventBus } from '../server/bus'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import { CATALOG, MODEL_NAME, ModelDownloads, fit, memoryFor, ollamaInstallHelp, parseNvidiaSmi } from '../server/ai/models'
import type { Hardware, LocalAiInfo, ModelDownload } from '../shared/types'

const fixture = resolve(__dirname, '../../core/test/fixtures/curriculum')
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
const GB = 1e9
const LAPTOP: Hardware = { memoryGb: 30, gpu: { name: 'GeForce RTX 4060 Laptop GPU', memoryGb: 8 }, unified: false }

// A stand-in for Ollama: tags, version, delete, and a pull in two layers that can be held open (to cancel it)
let models: { name: string; size: number; details?: { family: string; parameter_size: string } }[] = []
let hold = false, deleted: string[] = []
let ollama: Server, url = ''
beforeAll(async () => {
  ollama = createServer((req, res) => {
    if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [...models, { name: 'kimi:cloud', size: 340, remote_host: 'https://ollama.com:443' }] })); return }
    if (req.url === '/api/version') { res.end(JSON.stringify({ version: '0.17.4' })); return }
    let body = ''
    req.on('data', (d) => (body += d)).on('end', () => {
      const j = JSON.parse(body || '{}') as { model: string }
      if (req.url === '/api/delete') { deleted.push(j.model); models = models.filter((m) => m.name !== j.model); res.end(); return }
      if (req.url === '/api/pull') {
        res.setHeader('content-type', 'application/x-ndjson')
        res.write(JSON.stringify({ status: 'pulling manifest' }) + '\n')
        res.write(JSON.stringify({ status: 'pulling aaa', total: 300, completed: 300 }) + '\n')
        res.write(JSON.stringify({ status: 'pulling bbb', total: 100, completed: 50 }) + '\n')
        if (hold) return // a cancel closes it
        setTimeout(() => { models = [...models, { name: j.model, size: 2.5 * GB }]; res.end(JSON.stringify({ status: 'success' }) + '\n') }, 60)
      }
    })
  }).listen(0)
  await new Promise((r) => ollama.once('listening', r))
  url = `http://127.0.0.1:${(ollama.address() as { port: number }).port}`
})
afterAll(() => { ollama.close() })

function setup(ollamaUrl = url) {
  models = [{ name: 'qwen3:8b', size: 5.2 * GB, details: { family: 'qwen3', parameter_size: '8.2B' } }, { name: 'embeddinggemma:latest', size: 0.6 * GB }, { name: 'llama3:8b', size: 4.7 * GB }]
  hold = false; deleted = []
  const root = tmp('mdl-models-'); cpSync(fixture, root, { recursive: true })
  const settings = settingsStore(join(tmp('mdl-cfg-'), 's.json'))
  settings.update((s) => ({ ...s, ollama: { url: ollamaUrl, model: 'qwen3:8b', embedModel: 'embeddinggemma' } }))
  const app = createApp({ version: 't', security: { port: 1, lan: false, lanFull: false, token: 'x'.repeat(43) }, settings, workspaces: new Workspaces(settings), bus: new EventBus(), serverId: 't', hardware: async () => LAPTOP })
  const headers = { host: 'localhost:1' }
  const info = async () => (await app.request('/api/ai/local', { headers })).json() as Promise<LocalAiInfo>
  const post = (p: string, body: unknown = {}) => app.request(`/api/ai/local/${p}`, { method: 'POST', body: JSON.stringify(body), headers: { ...headers, 'content-type': 'application/json', 'x-mdl': '1' } })
  const until = async (ok: (v: LocalAiInfo) => boolean) => { for (let i = 0; i < 100; i++) { const v = await info(); if (ok(v)) return v; await new Promise((r) => setTimeout(r, 30)) } throw new Error('timed out') }
  return { settings, info, post, until }
}
const errorOf = async (r: Response) => ((await r.json()) as { error: { code: string; message: string } }).error

describe('what this computer can run', () => {
  it('reads the largest NVIDIA card from nvidia-smi', () => {
    expect(parseNvidiaSmi('NVIDIA GeForce RTX 4060 Laptop GPU, 8188 MiB\n')).toEqual({ name: 'GeForce RTX 4060 Laptop GPU', memoryGb: 8 })
    expect(parseNvidiaSmi('Tesla T4, 15360 MiB\nNVIDIA A100, 81920 MiB')).toEqual({ name: 'A100', memoryGb: 80 })
    expect(parseNvidiaSmi('')).toBeNull()
  })
  it('says a model runs well on the graphics card, slowly from memory, or not at all', () => {
    expect(fit(6.5, LAPTOP)).toBe('good')
    expect(fit(11, LAPTOP)).toBe('slow')
    expect(fit(28, LAPTOP)).toBe('too-big')
    expect(fit(6.5, { memoryGb: 8, gpu: null, unified: false })).toBe('too-big')
    expect(fit(10, { memoryGb: 16, gpu: null, unified: true })).toBe('good') // Apple Silicon shares its memory
    expect(memoryFor(5.2 * GB)).toBeCloseTo(6.6, 1)
  })
  it('lists real model names, from tiny to large', () => {
    expect(CATALOG.map((c) => c.purpose)).toContain('default')
    expect(CATALOG.every((c) => MODEL_NAME.test(c.name) && c.memoryGb >= c.sizeGb * 0.9)).toBe(true)
    for (const ok of ['qwen3:8b', 'library/qwen3', 'hf.co/bartowski/Llama-3.2-1B-Instruct-GGUF:Q4_K_M']) expect(MODEL_NAME.test(ok)).toBe(true)
    for (const bad of ['', ':8b', 'qwen3:8b; rm', 'a b', '-x', 'q'.repeat(200)]) expect(MODEL_NAME.test(bad)).toBe(false)
  })
  it('says how to install Ollama on each system', () => {
    expect(ollamaInstallHelp('linux', { ID: 'arch' }, LAPTOP.gpu)).toMatchObject({ command: 'sudo pacman -S ollama-cuda', then: 'sudo systemctl enable --now ollama' })
    expect(ollamaInstallHelp('linux', { ID: 'endeavouros', ID_LIKE: 'arch' }, null).command).toBe('sudo pacman -S ollama')
    expect(ollamaInstallHelp('linux', { ID: 'ubuntu' }, null).command).toBe('curl -fsSL https://ollama.com/install.sh | sh')
    expect(ollamaInstallHelp('darwin', {}, null)).toMatchObject({ command: 'brew install ollama' })
    expect(ollamaInstallHelp('win32', {}, null)).toEqual({ command: null, then: null, url: 'https://ollama.com/download/windows' })
  })
})

describe('Settings → Local AI', () => {
  it('shows installed models (not cloud links), the recommended list with what fits, and the model in use', async () => {
    const i = await setup().info()
    expect(i.ollama).toEqual({ running: true, installed: true, version: '0.17.4' })
    expect(i.models.map((m) => [m.name, m.embedding])).toEqual([['qwen3:8b', false], ['embeddinggemma:latest', true], ['llama3:8b', false]])
    expect(i.chosen).toBe('qwen3:8b')
    expect(i.catalog.find((c) => c.name === 'qwen3:8b')).toMatchObject({ installed: true, fit: 'good' })
    expect(i.catalog.find((c) => c.name === 'gpt-oss:20b')).toMatchObject({ installed: false, fit: 'slow' })
    expect(i.hardware).toEqual(LAPTOP)
  })
  it('downloads a model with progress over every layer, then lists it', async () => {
    const { post, until } = setup()
    const started = await (await post('pull', { model: 'qwen3:4b' })).json() as ModelDownload
    expect(started).toMatchObject({ model: 'qwen3:4b', done: false })
    const done = await until((i) => !!i.download?.done)
    expect(done.download).toMatchObject({ model: 'qwen3:4b', completed: 350, total: 400, done: true })
    expect(done.catalog.find((c) => c.name === 'qwen3:4b')?.installed).toBe(true)
  })
  it('one download at a time; a download can be cancelled', async () => {
    const { post, until } = setup()
    hold = true
    await post('pull', { model: 'qwen3:14b' })
    await until((i) => i.download?.total === 400)
    expect(await errorOf(await post('pull', { model: 'qwen3:4b' }))).toMatchObject({ code: 'busy' })
    expect((await post('pull', { model: 'qwen3:14b' })).status).toBe(200) // the same model joins the running download
    await post('cancel')
    expect((await until((i) => !!i.download?.error)).download).toMatchObject({ model: 'qwen3:14b', error: 'Download cancelled.', done: false })
    hold = false
    expect((await post('pull', { model: 'qwen3:4b' })).status).toBe(200) // another one can start straight away
    expect((await until((i) => !!i.download?.done)).download?.model).toBe('qwen3:4b')
  })
  it('chooses an installed chat model, and refuses others', async () => {
    const { post, settings, info } = setup()
    expect(await (await post('choose', { model: 'llama3:8b' })).json()).toEqual({ chosen: 'llama3:8b' })
    expect(settings.get().ollama.model).toBe('llama3:8b')
    expect((await info()).chosen).toBe('llama3:8b')
    expect(await errorOf(await post('choose', { model: 'qwen3:14b' }))).toMatchObject({ code: 'not-found' })
    expect(await errorOf(await post('choose', { model: 'embeddinggemma' }))).toMatchObject({ code: 'invalid' })
    models = [...models, { name: 'all-minilm:latest', size: 0.05 * GB, details: { family: 'bert', parameter_size: '23M' } }]
    expect(await errorOf(await post('choose', { model: 'all-minilm' }))).toMatchObject({ code: 'invalid' }) // a search model without "embed" in its name
    expect((await post('choose', { model: 'qwen3:8b; rm -x' })).status).toBe(400)
  })
  it('removes a model, but not the one in use or the search model', async () => {
    const { post } = setup()
    expect(await errorOf(await post('delete', { model: 'qwen3:8b' }))).toMatchObject({ code: 'in-use' })
    expect(await errorOf(await post('delete', { model: 'embeddinggemma' }))).toMatchObject({ code: 'in-use' })
    expect((await post('delete', { model: 'llama3:8b' })).status).toBe(200)
    expect(deleted).toEqual(['llama3:8b'])
  })
  it('without Ollama: says so, with how to install it', async () => {
    const { info, post } = setup('http://127.0.0.1:9')
    const i = await info()
    expect(i.ollama.running).toBe(false)
    expect(i.models).toEqual([])
    expect(i.install.url).toMatch(/^https:\/\/ollama\.com\/download/)
    expect(await errorOf(await post('pull', { model: 'qwen3:4b' }))).toMatchObject({ code: 'engine' })
  })
})

describe('the downloader on its own', () => {
  it('runs what waits for the download when it succeeds, once per caller', async () => {
    let seen = 0
    const d = new ModelDownloads(() => ({ url, model: 'qwen3:8b' }))
    setup()
    d.start('qwen3:4b', () => seen++)
    d.start('qwen3:4b', () => seen++)
    for (let i = 0; i < 50 && !d.state()?.done; i++) await new Promise((r) => setTimeout(r, 20))
    expect(d.state()?.done).toBe(true)
    expect(seen).toBe(2)
  })
})
