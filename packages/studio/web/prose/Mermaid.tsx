// Mermaid diagrams, loaded on demand, in strict security mode (no HTML labels, no click handlers).
import { useEffect, useId, useState } from 'react'
import { t } from '../i18n'

let mermaid: Promise<typeof import('mermaid')['default']> | undefined
const theme = () => (document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'neutral')
export default function Mermaid({ source }: { source: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    mermaid ??= import('mermaid').then((m) => m.default)
    mermaid.then(async (m) => {
      m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: theme(), layout: 'dagre', fontFamily: 'inherit', htmlLabels: false } as never)
      const { svg } = await m.render(`mmd${id}`, source)
      if (live) setSvg(svg)
    }).catch((e: Error) => { if (live) setError(e.message.split('\n')[0]) })
    return () => { live = false }
  }, [source, id])
  if (error) return <figure className="diagram diagram-error"><pre className="code"><code>{source}</code></pre><figcaption>{t('Diagram could not be drawn: {error}', { error })}</figcaption></figure>
  return svg ? <figure className="diagram" dangerouslySetInnerHTML={{ __html: svg }} /> : <figure className="diagram diagram-pending" aria-busy="true"><pre className="code"><code>{source}</code></pre></figure>
}
