// Local model through Ollama: streaming chat, JSON-shaped answers, availability. One request at a time
// (an 8 GB GPU does not run two well); questions asked while studying go first.
export interface OllamaConfig { url: string; model: string; embedModel?: string }
export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface EngineStatus { available: boolean; models: string[]; model: string; error?: string }

export async function ollamaStatus(cfg: OllamaConfig): Promise<EngineStatus> {
  try {
    const r = await fetch(`${cfg.url}/api/tags`, { signal: AbortSignal.timeout(1500) })
    if (!r.ok) return { available: false, models: [], model: cfg.model, error: `Ollama answered ${r.status}.` }
    const body = await r.json() as { models?: { name: string; remote_host?: string }[] }
    const models = (body.models ?? []).filter((m) => !m.remote_host).map((m) => m.name)
    return { available: models.includes(cfg.model), models, model: cfg.model, ...(models.includes(cfg.model) ? {} : { error: `Model ${cfg.model} is not installed. Download it in Settings → Local AI.` }) }
  } catch {
    return { available: false, models: [], model: cfg.model, error: 'Ollama is not running (start it with `ollama serve`).' }
  }
}

export interface InstalledModel { name: string; size: number; family?: string; parameters?: string; quantization?: string }
/** The models on this computer (cloud models Ollama only links to are left out). */
export async function ollamaModels(cfg: OllamaConfig): Promise<InstalledModel[]> {
  const r = await fetch(`${cfg.url}/api/tags`, { signal: AbortSignal.timeout(3000) })
  if (!r.ok) throw new Error(`Ollama answered ${r.status}.`)
  const body = await r.json() as { models?: { name: string; size?: number; remote_host?: string; details?: { family?: string; parameter_size?: string; quantization_level?: string } }[] }
  return (body.models ?? []).filter((m) => !m.remote_host).map((m) => ({ name: m.name, size: m.size ?? 0, family: m.details?.family, parameters: m.details?.parameter_size, quantization: m.details?.quantization_level }))
}

export async function ollamaVersion(cfg: OllamaConfig): Promise<string | null> {
  try {
    const r = await fetch(`${cfg.url}/api/version`, { signal: AbortSignal.timeout(1500) })
    return r.ok ? ((await r.json()) as { version?: string }).version ?? null : null
  } catch { return null }
}

export async function ollamaDelete(cfg: OllamaConfig, model: string): Promise<void> {
  const r = await fetch(`${cfg.url}/api/delete`, { method: 'DELETE', body: JSON.stringify({ model }), signal: AbortSignal.timeout(10_000) })
  if (!r.ok) throw new Error(`Ollama answered ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`)
}

let queue: Promise<unknown> = Promise.resolve()
let waiting = 0
/** Run `fn` when the model is free. */
function inTurn<T>(fn: () => Promise<T>): Promise<T> {
  waiting++
  const run = queue.then(() => { waiting--; return fn() }, () => { waiting--; return fn() })
  queue = run.catch(() => {})
  return run
}
export const ollamaBusy = () => waiting

export interface ChatOptions { messages: ChatMessage[]; signal?: AbortSignal; onDelta?: (text: string) => void; format?: object; think?: boolean; temperature?: number; numCtx?: number }
/** Stream a chat completion; resolves with the whole text. Aborting stops generation in Ollama too. */
export function ollamaChat(cfg: OllamaConfig, o: ChatOptions): Promise<string> {
  return inTurn(async () => {
    const res = await fetch(`${cfg.url}/api/chat`, {
      method: 'POST', signal: o.signal,
      body: JSON.stringify({ model: cfg.model, messages: o.messages, stream: true, think: o.think ?? false, keep_alive: '15m',
        options: { num_ctx: o.numCtx ?? 8192, temperature: o.temperature ?? 0.3 }, ...(o.format ? { format: o.format } : {}) }),
    })
    if (!res.ok || !res.body) throw new Error(`Ollama answered ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = '', text = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1)
        if (!line) continue
        const msg = JSON.parse(line) as { message?: { content?: string }; error?: string; done?: boolean }
        if (msg.error) throw new Error(msg.error)
        const piece = msg.message?.content ?? ''
        if (piece) { text += piece; o.onDelta?.(piece) }
      }
    }
    return text
  })
}

/** `embeddinggemma` is installed as `embeddinggemma:latest`. */
export const hasModel = (models: string[], name: string) => models.some((m) => m === name || m.startsWith(`${name}:`))

/** Meaning vectors for texts (one per input). Each call takes a turn, so a chat is never stuck behind a long indexing run. */
export function ollamaEmbed(cfg: OllamaConfig, model: string, inputs: string[], signal?: AbortSignal): Promise<number[][]> {
  return inTurn(async () => {
    const res = await fetch(`${cfg.url}/api/embed`, { method: 'POST', signal, body: JSON.stringify({ model, input: inputs, truncate: true, keep_alive: '10m' }) })
    if (!res.ok) throw new Error(`Ollama answered ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
    const body = await res.json() as { embeddings?: number[][] }
    if (!body.embeddings || body.embeddings.length !== inputs.length) throw new Error('Ollama returned no embeddings.')
    return body.embeddings
  })
}

export interface PullProgress { status: string; completed?: number; total?: number }
/** Download a model; `onProgress` gets the layer being downloaded. Resolves when Ollama says success. */
export async function ollamaPull(cfg: OllamaConfig, model: string, onProgress: (p: PullProgress) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`${cfg.url}/api/pull`, { method: 'POST', signal, body: JSON.stringify({ model, stream: true }) })
  if (!res.ok || !res.body) throw new Error(`Ollama answered ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  const reader = res.body.getReader(), dec = new TextDecoder()
  let buf = '', ok = false
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1)
      if (!line) continue
      const msg = JSON.parse(line) as PullProgress & { error?: string }
      if (msg.error) throw new Error(msg.error)
      if (msg.status === 'success') ok = true
      onProgress({ status: msg.status, completed: msg.completed, total: msg.total })
    }
  }
  if (!ok) throw new Error('The download ended before Ollama reported success.')
}
