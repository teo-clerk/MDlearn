import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { boundsFrom, onScreen, openingFor, readyUrl } from '../src/rules'
import { startSidecar } from '../src/sidecar'

const ORIGIN = 'http://127.0.0.1:4757'
describe('the desktop app\'s rules', () => {
  it('reads the server\'s address from its ready line, with the right token, as 127.0.0.1', () => {
    expect(readyUrl('starting…\nMDLEARN_READY t0k http://localhost:4757/\n', 't0k')).toBe('http://127.0.0.1:4757/')
    expect(readyUrl('MDLEARN_READY t0k http://127.0.0.1:4800/', 't0k')).toBe('http://127.0.0.1:4800/')
    expect(readyUrl('MDLEARN_READY other http://localhost:4757/\nMDLEARN_READY t0k http://localhost:4760/', 't0k')).toBe('http://127.0.0.1:4760/')
    expect(readyUrl('MDLEARN_READY t0k http://evil.example:80/', 't0k')).toBeNull()
    expect(readyUrl('echo MDLEARN_READY t0k http://localhost:4757/', 't0k')).toBeNull()
    expect(readyUrl('MDLEARN_READY  http://localhost:4757/', '')).toBeNull()
  })
  it('keeps Studio\'s pages in the app, sends web and mail links out as parsed, and opens nothing else', () => {
    expect(openingFor(`${ORIGIN}/api/w/x/latex/pdf?path=a.tex`, ORIGIN)).toEqual({ where: 'window', url: `${ORIGIN}/api/w/x/latex/pdf?path=a.tex` })
    expect(openingFor('https://ollama.com/library', ORIGIN)).toEqual({ where: 'external', url: 'https://ollama.com/library' })
    expect(openingFor('mailto:someone@example.org', ORIGIN)).toEqual({ where: 'external', url: 'mailto:someone@example.org' })
    expect(openingFor('http://localhost:4757/', ORIGIN).where).toBe('external') // not the app's address
    expect(openingFor('http://127.0.0.1:47570/', ORIGIN).where).toBe('external') // another port is another site
    expect(openingFor('ht\ttps://ollama.com/a\nb', ORIGIN)).toEqual({ where: 'external', url: 'https://ollama.com/ab' }) // what was checked is what opens
    for (const bad of ['file:///etc/passwd', 'javascript:alert(1)', 'smb://host/share', 'not a url', 'https://user:pass@example.org/']) expect(openingFor(bad, ORIGIN)).toEqual({ where: 'deny' })
  })
  it('takes only the four numbers of a saved window position', () => {
    expect(boundsFrom({ x: 1, y: 2, width: 900, height: 700, alwaysOnTop: true, frame: false })).toEqual({ x: 1, y: 2, width: 900, height: 700 })
    expect(boundsFrom({ x: '1', y: 2, width: 900, height: 700 })).toBeNull()
    expect(boundsFrom({ x: 1, y: 2, width: Infinity, height: 700 })).toBeNull()
    expect(boundsFrom(null)).toBeNull()
  })
  it('puts the window back where it was, unless that screen is gone', () => {
    const screens = [{ x: 0, y: 0, width: 1920, height: 1080 }]
    expect(onScreen({ x: 100, y: 80, width: 1200, height: 800 }, screens)).toBe(true)
    expect(onScreen({ x: 2500, y: 80, width: 1200, height: 800 }, screens)).toBe(false)
    expect(onScreen({ x: 100, y: 80, width: 200, height: 100 }, screens)).toBe(false)
  })
})

describe('the server beside the window', () => {
  const entry = join(__dirname, 'fake-server.mjs')
  const logFile = () => join(mkdtempSync(join(tmpdir(), 'mdl-desk-')), 'logs', 'studio.log')
  it('waits for the address, logs what the server prints, and stops it by closing its stdin', async () => {
    const log = logFile()
    const s = await startSidecar({ entry, port: 4801, logFile: log })
    expect(s.url).toBe('http://127.0.0.1:4801/') // the line with its token, not the one before it
    await s.stop()
    expect(readFileSync(log, 'utf8')).toMatch(/noise[\s\S]*server exited \(0\)/)
  })
  it('says so when the server stops or never answers', async () => {
    await expect(startSidecar({ entry: join(__dirname, 'missing.mjs'), port: 4802, logFile: logFile() })).rejects.toThrow(/stopped while starting/)
    await expect(startSidecar({ entry: join(__dirname, 'fake-silent.mjs'), port: 4803, logFile: logFile(), timeoutMs: 400 })).rejects.toThrow(/did not start within/)
  })
})
