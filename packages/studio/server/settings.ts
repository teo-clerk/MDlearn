// Studio settings (~/.config/mdlearn/studio.json): recent folders, library location, AI engines.
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { z } from 'zod'

const SettingsSchema = z.object({
  recents: z.array(z.object({ root: z.string(), lastOpened: z.number() })).default([]),
  libraryDir: z.string().default(join(homedir(), 'MDlearn', 'library')),
  ollama: z.object({ url: z.string().default('http://127.0.0.1:11434'), model: z.string().default('qwen3:8b'), embedModel: z.string().default('embeddinggemma') }).default({ url: 'http://127.0.0.1:11434', model: 'qwen3:8b', embedModel: 'embeddinggemma' }),
  claude: z.object({ path: z.string().optional(), model: z.string().default('sonnet') }).default({ model: 'sonnet' }),
  /** First-run help: the welcome tour is shown until it is finished or skipped once. */
  onboarding: z.object({ tourDone: z.boolean().default(false) }).default({ tourDone: false }),
})
export type Settings = z.infer<typeof SettingsSchema>
export const defaultSettingsFile = () => join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'mdlearn', 'studio.json')

export interface SettingsStore { get(): Settings; update(fn: (s: Settings) => Settings): Settings; file: string }
export function settingsStore(file = defaultSettingsFile()): SettingsStore {
  let current: Settings = SettingsSchema.parse({})
  if (existsSync(file)) {
    try { current = SettingsSchema.parse(JSON.parse(readFileSync(file, 'utf8'))) } catch { /* unreadable settings: start from defaults, keep the file until the next save */ }
  }
  return {
    file,
    get: () => current,
    update(fn) {
      const next = SettingsSchema.parse(fn(current))
      mkdirSync(dirname(file), { recursive: true })
      const tmp = `${file}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify(next, null, 2))
      renameSync(tmp, file)
      current = next
      return next
    },
  }
}
