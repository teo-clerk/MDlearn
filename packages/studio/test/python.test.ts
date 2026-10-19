import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PyodideStore } from '../server/python'

const fake = (calls: string[], status = 200): typeof fetch => (async (url: string) => { calls.push(String(url)); return new Response(status === 200 ? new Uint8Array([1, 2, 3]) : 'no', { status }) }) as never
const store = (f: typeof fetch) => new PyodideStore({ cacheDir: join(mkdtempSync(join(tmpdir(), 'mdl-py-')), 'cache'), cdn: 'https://cdn.example/pyodide/', fetchImpl: f })

describe('Pyodide file store', () => {
  it('serves the runtime from the installed package without any download', async () => {
    const calls: string[] = []
    const s = store(fake(calls))
    const wasm = await s.get('pyodide.asm.wasm')
    expect(wasm?.type).toBe('application/wasm')
    expect(wasm!.data.length).toBeGreaterThan(1_000_000)
    expect((await s.get('pyodide-lock.json'))?.type).toBe('application/json')
    expect(calls).toEqual([])
  })
  it('downloads a listed package once, then serves it from the cache', async () => {
    const calls: string[] = []
    const s = store(fake(calls))
    const lock = JSON.parse(Buffer.from((await s.get('pyodide-lock.json'))!.data).toString()) as { packages: Record<string, { file_name: string }> }
    const numpy = lock.packages.numpy.file_name
    const [a, b] = await Promise.all([s.get(numpy), s.get(numpy)])
    expect(a?.data).toEqual(new Uint8Array([1, 2, 3]))
    expect(b?.data).toEqual(new Uint8Array([1, 2, 3]))
    await s.get(numpy)
    expect(calls).toEqual([`https://cdn.example/pyodide/${numpy}`])
  })
  it('refuses names that are not part of the release (no proxying, no traversal)', async () => {
    const calls: string[] = []
    const s = store(fake(calls))
    for (const n of ['evil.whl', '../package.json', '..%2Fx', 'numpy', 'a/b.js', '']) expect(await s.get(n)).toBeNull()
    expect(calls).toEqual([])
  })
  it('a failed download is an error with a hint, and nothing broken is cached', async () => {
    const calls: string[] = []
    const s = store(fake(calls, 404))
    const lock = JSON.parse(Buffer.from((await s.get('pyodide-lock.json'))!.data).toString()) as { packages: Record<string, { file_name: string }> }
    await expect(s.get(lock.packages.scipy.file_name)).rejects.toThrow(/internet connection/)
    const ok = store(fake([]))
    expect((await ok.get(lock.packages.scipy.file_name))?.data.length).toBe(3)
  })
  it('lists importable packages', () => {
    const names = store(fake([])).packageNames()
    expect(names).toEqual(expect.arrayContaining(['numpy', 'scipy', 'matplotlib', 'pandas']))
  })
})
