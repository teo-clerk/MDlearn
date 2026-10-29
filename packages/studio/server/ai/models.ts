// Local AI models through Ollama: a short list of good models with what each needs, what this computer has,
// and one download at a time (Ask's search model uses the same downloader, so nothing is fetched twice).
import { execFile } from 'node:child_process'
import { arch, platform, totalmem } from 'node:os'
import { hasModel, ollamaModels, ollamaPull, ollamaVersion, type InstalledModel, type OllamaConfig } from './ollama.js'
import { UserError } from '../workspaces.js'
import { distroIs, onPath, osRelease } from '../system.js'
import type { Hardware, LocalAiInfo, ModelDownload, ModelFit, ModelPurpose } from '../../shared/types.js'

const GiB = 1024 ** 3 // memory, as the system reports it
const GB = 1e9 // file sizes, as ollama.com shows them
const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Sizes are Ollama's download sizes (ollama.com/library, October 2026); memory is what a chat with Studio's 8k
 * context needs, on the graphics card for full speed.
 */
export const CATALOG: { name: string; sizeGb: number; memoryGb: number; purpose: ModelPurpose }[] = [
  { name: 'qwen3:0.6b', sizeGb: 0.5, memoryGb: 1.5, purpose: 'tiny' },
  { name: 'qwen3:4b', sizeGb: 2.5, memoryGb: 3.5, purpose: 'light' },
  { name: 'qwen3.5:4b', sizeGb: 4, memoryGb: 5, purpose: 'newer-light' },
  { name: 'qwen3:8b', sizeGb: 5.2, memoryGb: 6.5, purpose: 'default' },
  { name: 'qwen3.5:9b', sizeGb: 7.6, memoryGb: 9, purpose: 'newer' },
  { name: 'gemma4:e4b', sizeGb: 9.5, memoryGb: 10, purpose: 'languages' },
  { name: 'qwen3:14b', sizeGb: 9.3, memoryGb: 11, purpose: 'strong' },
  { name: 'gpt-oss:20b', sizeGb: 14, memoryGb: 16, purpose: 'large' },
]

/** Ollama model names: `qwen3:8b`, `user/model:tag`, `hf.co/User/Repo-GGUF:Q4_K_M`. */
export const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,149}(:[A-Za-z0-9._-]{1,60})?$/

/** Runs well (fits on the graphics card, or in Apple's shared memory), runs slowly (in memory only), or not at all. */
export function fit(memoryGb: number, hw: Hardware): ModelFit {
  if (hw.unified) return memoryGb <= hw.memoryGb - 4 ? 'good' : memoryGb <= hw.memoryGb - 2 ? 'slow' : 'too-big'
  if (hw.gpu && memoryGb <= hw.gpu.memoryGb) return 'good'
  return memoryGb <= hw.memoryGb - 4 ? 'slow' : 'too-big'
}
/** For a model not in the list: its file plus room for the conversation. */
export const memoryFor = (bytes: number) => round1(bytes / GB * 1.15 + 0.6)

/** The largest NVIDIA card in `nvidia-smi --query-gpu=name,memory.total --format=csv,noheader`. */
export function parseNvidiaSmi(out: string): Hardware['gpu'] {
  const cards = out.split('\n').map((l) => /^(.+?),\s*(\d+)\s*MiB/.exec(l.trim())).filter((m) => !!m)
    .map((m) => ({ name: m[1].replace(/^NVIDIA\s+/, ''), memoryGb: round1(Number(m[2]) / 1024) }))
  return cards.sort((a, b) => b.memoryGb - a.memoryGb)[0] ?? null
}

let known: Promise<Hardware> | undefined
/** Memory, and the NVIDIA card when there is one (looked up once). Apple Silicon shares memory with its GPU. */
export function hardware(): Promise<Hardware> {
  known ??= new Promise((done) => {
    const memoryGb = round1(totalmem() / GiB)
    if (platform() === 'darwin') return done({ memoryGb, gpu: null, unified: arch() === 'arm64' })
    execFile('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader'], { timeout: 2000, windowsHide: true },
      (e, out) => done({ memoryGb, gpu: e ? null : parseNvidiaSmi(String(out)), unified: false }))
  })
  return known
}

/** How to get Ollama here; on Arch with an NVIDIA card, the CUDA build. */
export function ollamaInstallHelp(os = platform(), release = osRelease(), gpu: Hardware['gpu'] = null): LocalAiInfo['install'] {
  if (os === 'darwin') return { command: 'brew install ollama', then: 'brew services start ollama', url: 'https://ollama.com/download/mac' }
  if (os === 'win32') return { command: null, then: null, url: 'https://ollama.com/download/windows' }
  if (os !== 'linux') return { command: null, then: null, url: 'https://ollama.com/download' }
  if (distroIs(release, 'arch')) return { command: `sudo pacman -S ${gpu ? 'ollama-cuda' : 'ollama'}`, then: 'sudo systemctl enable --now ollama', url: 'https://ollama.com/download/linux' }
  return { command: 'curl -fsSL https://ollama.com/install.sh | sh', then: null, url: 'https://ollama.com/download/linux' }
}

type Pull = typeof ollamaPull
interface Job { state: ModelDownload; abort: AbortController; then: (() => void)[]; layers: Map<string, { completed: number; total: number }> }

/** One model download at a time; progress adds up every layer Ollama fetches. */
export class ModelDownloads {
  private job: Job | null = null
  constructor(private cfg: () => OllamaConfig, private pull: Pull = ollamaPull) {}

  state(): ModelDownload | null { return this.job ? { ...this.job.state } : null }
  running(model?: string): boolean {
    const s = this.job?.state
    return !!s && !s.done && !s.error && (!model || s.model === model)
  }

  /** Starts a download, or joins the one already fetching the same model; `then` runs when it succeeds. */
  start(model: string, then?: () => void): ModelDownload {
    if (this.running()) {
      if (this.job!.state.model !== model) throw new UserError('busy', 'Another model is downloading. Wait for it, or cancel it first.')
      if (then) this.job!.then.push(then)
      return this.state()!
    }
    const job: Job = { state: { model, status: 'Starting the download', done: false }, abort: new AbortController(), then: then ? [then] : [], layers: new Map() }
    this.job = job
    void this.pull(this.cfg(), model, (p) => {
      if (p.total) job.layers.set(p.status, { completed: p.completed ?? 0, total: p.total })
      const sum = [...job.layers.values()].reduce((a, l) => ({ completed: a.completed + l.completed, total: a.total + l.total }), { completed: 0, total: 0 })
      job.state = { ...job.state, status: p.status, ...(sum.total ? sum : {}) }
    }, job.abort.signal)
      .then(() => { job.state = { ...job.state, status: 'success', done: true }; job.then.forEach((f) => f()) })
      .catch((e: Error) => { job.state = { ...job.state, error: job.abort.signal.aborted ? 'Download cancelled.' : e.message } })
    return this.state()!
  }

  cancel(): void { if (this.running()) this.job!.abort.abort() }
}

const isEmbedding = (m: InstalledModel) => /embed/i.test(m.name) || /bert/i.test(m.family ?? '')

/** Everything the Local AI settings show, except Claude (the caller adds it). */
export async function localAi(cfg: OllamaConfig, downloads: ModelDownloads, hw: Hardware): Promise<Omit<LocalAiInfo, 'claude'>> {
  let models: InstalledModel[] | null = null
  try { models = await ollamaModels(cfg) } catch { /* not running */ }
  const running = models !== null
  const installed = running || await onPath('ollama')
  const names = (models ?? []).map((m) => m.name)
  return {
    ollama: { running, installed, version: running ? await ollamaVersion(cfg) : null },
    install: ollamaInstallHelp(platform(), osRelease(), hw.gpu),
    hardware: hw,
    chosen: cfg.model,
    embedModel: cfg.embedModel ?? 'embeddinggemma',
    models: (models ?? []).map((m) => ({ name: m.name, sizeGb: round1(m.size / GB), ...(m.parameters ? { parameters: m.parameters } : {}), embedding: isEmbedding(m), fit: fit(memoryFor(m.size), hw) })),
    catalog: CATALOG.map((c) => ({ ...c, installed: hasModel(names, c.name), fit: fit(c.memoryGb, hw) })),
    download: downloads.state(),
  }
}

/** The installed model a name means (`embeddinggemma` is installed as `embeddinggemma:latest`). */
export const installedName = (models: { name: string }[], name: string) => models.find((m) => m.name === name || m.name === `${name}:latest`)?.name
