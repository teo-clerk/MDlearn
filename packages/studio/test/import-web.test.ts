import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer, type Server } from 'node:http'
import { settingsStore } from '../server/settings'
import { Workspaces } from '../server/workspaces'
import { importWeb, checkUrl, articleToMarkdown } from '../server/import/web'
import { importNotebook } from '../server/import/notebook'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')
const ARTICLE = `<!doctype html><html><head><title>Speckle in radar images | Example Site</title></head><body>
<nav><a href="/">Home</a> <a href="/about">About us</a> Sign in to subscribe</nav>
<article><h1>Speckle in radar images</h1>
<p>Speckle is granular noise caused by the coherent summation of many scatterers inside one resolution cell. It is not measurement error; it is part of the signal and must be handled statistically rather than removed pixel by pixel.</p>
<h2>The model</h2>
<p>The intensity follows an exponential law, and its coefficient of variation is <span class="katex"><span class="katex-mathml"><math><semantics><mrow><mi>C</mi><mi>V</mi></mrow><annotation encoding="application/x-tex">CV = 1/\\sqrt{L}</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">CV=1/L</span></span> for L looks. In display form:</p>
<span class="katex-display"><span class="katex"><span class="katex-mathml"><math><semantics><mrow><mi>E</mi></mrow><annotation encoding="application/x-tex">E = m c^2</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">E=mc2</span></span></span>
<ul><li>Average independent samples</li><li>Use a boxcar or a model-based filter</li></ul>
<table><thead><tr><th>Looks</th><th>CV</th></tr></thead><tbody><tr><td>1</td><td>1.00</td></tr><tr><td>4</td><td>0.50</td></tr></tbody></table>
<pre><code class="language-python">import numpy as np
x = np.random.rand(4)</code></pre>
<p>The picture below shows a patch. <a href="/other">Another page</a> explains more about coherent summation of echoes in synthetic aperture images.</p>
<img src="/img.png" alt="A patch">
<img src="/missing.png" alt="Lost picture">
</article><footer>Copyright Example Site. All rights reserved.</footer></body></html>`
let server: Server, base = ''
beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/article') { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(ARTICLE) }
    else if (req.url === '/img.png') { res.setHeader('content-type', 'image/png'); res.end(PNG) }
    else if (req.url === '/data.json') { res.setHeader('content-type', 'application/json'); res.end('{}') }
    else if (req.url === '/empty') { res.setHeader('content-type', 'text/html'); res.end('<html><body><p>Hi</p></body></html>') }
    else { res.statusCode = 404; res.end('no') }
  }).listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})
afterAll(() => { server.close() })
const open = () => new Workspaces(settingsStore(join(mkdtempSync(join(tmpdir(), 'mdl-cfg-')), 's.json'))).open(mkdtempSync(join(tmpdir(), 'mdl-imp-')))

describe('web page import', () => {
  it('keeps the article, math as TeX, tables, code and pictures; drops navigation and footers', async () => {
    const h = open()
    const r = await importWeb(h, `${base}/article`)
    const md = readFileSync(join(h.root, r.files[0].path), 'utf8')
    expect(r.files[0]).toEqual({ path: 'imports/speckle-in-radar-images.md', kind: 'document' })
    expect(md).toMatch(/^# Speckle in radar images/)
    expect(md).toMatch(/> Imported from <http:\/\/127\.0\.0\.1:\d+\/article> on \d{4}-\d\d-\d\d\./)
    expect(md).toContain('## The model')
    expect(md).toContain('$CV = 1/\\sqrt{L}$')
    expect(md).toMatch(/\$\$\nE = m c\^2\n\$\$/)
    expect(md).toContain('- Average independent samples')
    expect(md).toMatch(/\| Looks \| CV \|/)
    expect(md).toMatch(/```python\nimport numpy as np/)
    expect(md).not.toMatch(/Sign in to subscribe|Copyright Example Site|About us/)
    // pictures are saved beside it and linked relatively; one that cannot be fetched keeps its description
    expect(md).toContain('![A patch](../assets/speckle-in-radar-images/image-1.png)')
    expect(existsSync(join(h.root, 'assets/speckle-in-radar-images/image-1.png'))).toBe(true)
    expect(md).toContain('*Lost picture*')
    expect(r.warnings.join(' ')).toMatch(/1 pictures could not be downloaded/)
  })
  it('never replaces a file: a second import gets a new name', async () => {
    const h = open()
    await importWeb(h, `${base}/article`)
    const again = await importWeb(h, `${base}/article`)
    expect(again.files[0].path).toBe('imports/speckle-in-radar-images-2.md')
  })
  it('refuses what is not a readable web page', async () => {
    const h = open()
    await expect(importWeb(h, `${base}/data.json`)).rejects.toThrow(/not a web page/)
    await expect(importWeb(h, `${base}/nope`)).rejects.toThrow(/answered 404/)
    await expect(importWeb(h, `${base}/empty`)).rejects.toThrow(/No article text/)
    expect(() => checkUrl('file:///etc/passwd')).toThrow(/http and https/)
    expect(() => checkUrl('ftp://x.org/a')).toThrow(/http and https/)
    expect(() => checkUrl('https://user:pw@x.org/')).toThrow(/user name/)
    expect(() => checkUrl('not a url')).toThrow(/not a web address/)
  })
  it('converts markup alone, without the network', () => {
    const { title, markdown } = articleToMarkdown(ARTICLE, new URL('https://example.org/a/b'))
    expect(title).toMatch(/Speckle/)
    expect(markdown).toContain('(https://example.org/other)')
  })
})

describe('notebook import', () => {
  const nb = (cells: unknown[]) => JSON.stringify({ nbformat: 4, metadata: { kernelspec: { language: 'python' } }, cells })
  const PIXEL = PNG.toString('base64')
  it('turns cells into Markdown: text as written, code fenced, output quoted, figures saved', () => {
    const h = open()
    const r = importNotebook(h, 'My Analysis.ipynb', nb([
      { cell_type: 'markdown', source: ['# Analysis\n', '\n', 'Some $x^2$ text.'] },
      { cell_type: 'code', source: ['import numpy as np\n', 'print(np.pi)'], outputs: [{ output_type: 'stream', name: 'stdout', text: ['3.14159\n'] }] },
      { cell_type: 'code', source: 'plt.plot(x)', outputs: [{ output_type: 'display_data', data: { 'image/png': PIXEL, 'text/plain': '<Figure>' } }, { output_type: 'error', ename: 'ValueError' }] },
      { cell_type: 'code', source: '1 + 1', outputs: [{ output_type: 'execute_result', data: { 'text/plain': '2' } }, { output_type: 'display_data', data: { 'application/vnd.jupyter.widget-view+json': {} } }] },
      { cell_type: 'raw', source: 'ignored' },
    ]))
    const md = readFileSync(join(h.root, r.files[0].path), 'utf8')
    expect(r.files[0].path).toBe('imports/my-analysis.md')
    expect(md).toMatch(/^# Analysis\n\nSome \$x\^2\$ text\.\n\n```python\nimport numpy as np\nprint\(np\.pi\)\n```\n\n> 3\.14159\n/)
    expect(md).toContain('![Output 1](../assets/my-analysis/figure-1.png)')
    expect(readFileSync(join(h.root, 'assets/my-analysis/figure-1.png')).equals(PNG)).toBe(true)
    expect(md).toContain('> 2')
    expect(md).not.toMatch(/ignored|ValueError/)
    expect(r.warnings.join(' ')).toMatch(/1 outputs/)
  })
  it('adds a title when the notebook has none, and refuses things that are not notebooks', () => {
    const h = open()
    const r = importNotebook(h, 'plain.ipynb', nb([{ cell_type: 'code', source: 'x = 1', outputs: [] }]))
    expect(readFileSync(join(h.root, r.files[0].path), 'utf8')).toMatch(/^# plain\n\n```python\nx = 1/)
    expect(() => importNotebook(h, 'x.ipynb', '{"hello": 1}')).toThrow(/Jupyter/)
    expect(() => importNotebook(h, 'x.ipynb', 'not json')).toThrow(/Jupyter/)
    expect(() => importNotebook(h, 'x.ipynb', nb([]))).toThrow(/no cells/)
  })
})
