// Test server: copies the core test curriculum (plus a visuals document) to a temp folder and serves it.
import { cpSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import { startStudio } from '../dist/server/index.js'

const here = import.meta.dirname
const LONG = ('range gain target antenna power ' + 'listens ').repeat(16)
const root = mkdtempSync(join(tmpdir(), 'mdl-e2e-'))
cpSync(resolve(here, '../../core/test/fixtures/curriculum'), root, { recursive: true })
mkdirSync(join(root, 'demo'), { recursive: true })
writeFileSync(join(root, 'demo/visuals.md'), `# Visuals

:::plot[Power law]{y=log}
$$P = \\frac{A}{R^4}$$
- $R$ in [1, 10] — range
- $A$ = 1 in [0.1, 10] log — gain
:::

:::formula[Energy]
$$E = m c^2$$
- $m$ — mass
- $c^2$ — speed of light, squared
:::

:::animate[Two steps]
1. $$a = b$$ First.
2. $$a + 1 = b + 1$$ Second.
:::

:::sim[Runaway]{height=160}
Never stops.
\`\`\`js
while (true) {}
\`\`\`
:::
`)
writeFileSync(join(root, 'demo/radar-terms.md'), `# Radar terms

## 1. Basics

**Backscatter** is the power returned toward the radar by the target and its surroundings.

Power spreads with range, which gives the received power:

$$P_r = \\frac{P_t G^2 \\lambda^2 \\sigma}{(4\\pi)^3 R^4}$$

Later, backscatter depends on roughness. See [the visuals](visuals.md) and [Python](python.md).

## 2. More

Backscatter again, now in a second section.
`)
writeFileSync(join(root, 'demo/long-sheet.md'), `# Long sheet

## 1. First part

${LONG}

**Aperture** is the effective area with which an antenna collects power from a passing wave.

$$A_e = \\frac{G \\lambda^2}{4\\pi}$$

## 2. Second part

${LONG}

$$S = \\frac{P_t}{4\\pi R^2}$$
`)
writeFileSync(join(root, 'demo/editable.md'), '# Editable\n\nFirst paragraph.\n')
writeFileSync(join(here, '.root'), root) // tests reset progress here between study runs
cpSync(resolve(here, '../../core/test/fixtures/02-bayes-theorem.learn.md'), join(root, 'learn/02-bayes-theorem.learn.md'))
writeFileSync(join(root, 'demo/python.md'), `# Python

\`\`\`python
x = 41
print(x + 1)
\`\`\`

\`\`\`python
print(x * 2)
\`\`\`

\`\`\`python
while True:
    pass
\`\`\`
`)
// A stand-in for Ollama (so nothing here needs a GPU): both models installed, embeddings are word-bag hashes,
// answers cite the first passage they were given.
const bag = (text) => { const v = new Array(48).fill(0); for (const w of text.toLowerCase().match(/[a-z]{3,}/g) ?? []) { let h = 0; for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) % 48; v[h] += 1 } return v }
const ollama = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/page') { res.setHeader('content-type', 'text/html'); res.end(`<html><head><title>Imported article</title></head><body><article><h1>An imported article</h1><p>${'Radar measures the delay and the Doppler shift of an echo to find range and speed. '.repeat(8)}</p><p>Energy and mass are related by <span class="katex"><annotation encoding="application/x-tex">E = mc^2</annotation></span> in every frame.</p></article></body></html>`); return }
  if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'qwen3:8b' }, { name: 'embeddinggemma:latest' }] })); return }
  let body = ''
  req.on('data', (d) => (body += d)).on('end', () => {
    const j = JSON.parse(body || '{}')
    if (req.url === '/api/embed') { res.end(JSON.stringify({ embeddings: j.input.map(bag) })); return }
    res.setHeader('content-type', 'application/x-ndjson')
    const reply = j.format ? JSON.stringify({ ideas: ['Received power falls with the fourth power of range.', 'Gain counts twice, so doubling it quadruples the power.'] }) : j.messages?.at(-1)?.content?.includes('Passages:') ? 'Backscatter is the power returned toward the radar [1].' : 'Fine.'
    for (const piece of reply.match(/.{1,12}/g)) res.write(JSON.stringify({ message: { content: piece }, done: false }) + '\n')
    res.end(JSON.stringify({ done: true }) + '\n')
  })
}).listen(0)
await new Promise((r) => ollama.once('listening', r))
writeFileSync(join(here, '.ollama-port'), String(ollama.address().port))
const cfgDir = mkdtempSync(join(tmpdir(), 'mdl-e2e-cfg-'))
const settingsFile = join(cfgDir, 's.json')
// the welcome tour is tested on its own (onboarding.spec); the library (tutorial, uploads) stays in the temp folder
writeFileSync(settingsFile, JSON.stringify({ ollama: { url: `http://127.0.0.1:${ollama.address().port}`, model: 'qwen3:8b', embedModel: 'embeddinggemma' },
  libraryDir: join(cfgDir, 'library'), onboarding: { tourDone: true } }))
const s = await startStudio({ root, port: 4799, fakeAi: true, settingsFile })
console.log(`e2e studio on ${s.url} (folder ${root})`)
