import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { onScreen, openingFor, readyUrl } from '../src/rules'
import { startSidecar } from '../src/sidecar'

const ORIGIN = 'http://localhost:4757'
describe('the desktop app\'s rules', () => {
  it('reads the server\'s address from its ready line only', () => {
    expect(readyUrl('starting…\nMDLEARN_READY http://localhost:4757/\n')).toBe('http://localhost:4757/')
    expect(readyUrl('MDLEARN_READY http://127.0.0.1:4800/')).toBe('http://127.0.0.1:4800/')
    expect(readyUrl('MDLEARN_READY http://evil.example:80/')).toBeNull()
    expect(readyUrl('echo MDLEARN_READY http://localhost:4757/')).toBeNull()
  })
  it('keeps Studio\'s pages in the app, sends web and mail links out, and opens nothing else', () => {
    expect(openingFor(`${ORIGIN}/api/w/x/latex/pdf?path=a.tex`, ORIGIN)).toBe('window')
    expect(openingFor('https://ollama.com/library', ORIGIN)).toBe('external')
    expect(openingFor('mailto:someone@example.org', ORIGIN)).toBe('external')
    expect(openingFor('http://localhost:4758/', ORIGIN)).toBe('external') // another port is another site
    for (const bad of ['file:///etc/passwd', 'javascript:alert(1)', 'smb://host/share', 'not a url']) expect(openingFor(bad, ORIGIN)).toBe('deny')
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
    expect(s.url).toBe('http://localhost:4801/')
    await s.stop()
    expect(readFileSync(log, 'utf8')).toMatch(/noise[\s\S]*server exited \(0\)/)
  })
  it('says so when the server stops or never answers', async () => {
    await expect(startSidecar({ entry: join(__dirname, 'missing.mjs'), port: 4802, logFile: logFile() })).rejects.toThrow(/stopped while starting/)
    await expect(startSidecar({ entry: join(__dirname, 'fake-silent.mjs'), port: 4803, logFile: logFile(), timeoutMs: 400 })).rejects.toThrow(/did not start within/)
  })
})
