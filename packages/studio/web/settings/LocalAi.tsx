// Settings → Local AI: Ollama, the model Studio answers with, and models to download, each with what it is for,
// its size and whether this computer runs it well. Changes are made only on the computer running Studio.
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, CircleSlash, Cpu, Download, Gauge, Sparkles, Trash2, X } from 'lucide-react'
import { keys, localAiApi, useSession } from '../api/queries'
import { Button, ErrorNote, IconButton, Spinner } from '../ui/primitives'
import { locale, t } from '../i18n'
import { Section } from './Section'
import { Command } from './Command'
import type { CatalogModel, Hardware, LocalAiInfo, ModelDownload, ModelFit, ModelPurpose } from '../../shared/types'

const gb = (n: number) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(n)
const downloading = (d: ModelDownload | null | undefined) => !!d && !d.done && !d.error

function purposeText(p: ModelPurpose): string {
  switch (p) {
    case 'tiny': return t('Very small and quick: for trying things out or an older computer. Answers are basic.')
    case 'light': return t('Light: good answers on a computer with 8 GB of memory.')
    case 'newer-light': return t('Newer and light: a step up from the light model.')
    case 'default': return t('Studio\'s default: careful answers, explanations and visuals.')
    case 'newer': return t('Newer and sharper than the default.')
    case 'languages': return t('Google\'s Gemma: strong in Italian, Spanish, French and many other languages.')
    case 'strong': return t('Stronger reasoning, for harder subjects.')
    case 'large': return t('OpenAI\'s open model: the best answers here, and the slowest.')
  }
}

export function LocalAi() {
  const qc = useQueryClient()
  const session = useSession()
  const canChange = session.data?.caps.includes('ai') ?? false
  const info = useQuery({ queryKey: keys.localAi, queryFn: localAiApi.info, refetchInterval: (q) => (downloading(q.state.data?.download) ? 1000 : false) })
  const refresh = () => { void qc.invalidateQueries({ queryKey: keys.localAi }); void qc.invalidateQueries({ queryKey: keys.engines }) }
  const act = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSettled: refresh })
  // the choice shows at once, and goes back if the server refuses it
  const choose = useMutation({
    mutationFn: localAiApi.choose,
    onMutate: async (model: string) => {
      await qc.cancelQueries({ queryKey: keys.localAi })
      const prev = qc.getQueryData<LocalAiInfo>(keys.localAi)
      qc.setQueryData<LocalAiInfo>(keys.localAi, (o) => o && { ...o, chosen: model })
      return { prev }
    },
    onError: (_e, _m, ctx) => { if (ctx?.prev) qc.setQueryData(keys.localAi, ctx.prev) },
    onSettled: refresh,
  })
  const failed = act.error ?? choose.error
  const busy = act.isPending || choose.isPending
  const d = info.data
  return (
    <Section id="local-ai" title={t('Local AI')}
      intro={t('Answers, explanations and visuals about your notes come from a model on this computer, through Ollama. Your notes never leave it.')}>
      {info.isLoading && <Spinner />}
      {info.error && <ErrorNote error={info.error} retry={() => void info.refetch()} />}
      {d && !d.ollama.running && <OllamaSetup info={d} checking={info.isFetching} onCheck={() => void info.refetch()} />}
      {d && d.ollama.running && (
        <>
          <ComputerLine hw={d.hardware} version={d.ollama.version} />
          {!canChange && <p className="text-[13px] text-muted">{t('Models can be changed on the computer running MDlearn Studio.')}</p>}
          {failed && <p role="alert" className="text-[13px] text-bad">{(failed as Error).message}</p>}
          <DownloadBar download={d.download} canChange={canChange} onCancel={() => act.mutate(() => localAiApi.cancel())} onRetry={(m) => act.mutate(() => localAiApi.pull(m))} />
          <InUse info={d} canChange={canChange} busy={busy}
            onChoose={(m) => choose.mutate(m)}
            onRemove={(m) => { if (confirm(t('Remove {model} from this computer? You can download it again later.', { model: m }))) act.mutate(() => localAiApi.remove(m)) }} />
          <Recommended info={d} canChange={canChange} busy={busy}
            onDownload={(m) => act.mutate(() => localAiApi.pull(m))} onChoose={(m) => choose.mutate(m)} />
          {canChange && <OtherModel disabled={downloading(d.download) || busy} onDownload={(m) => act.mutate(() => localAiApi.pull(m))} />}
        </>
      )}
      {d && <ClaudeLine claude={d.claude} />}
    </Section>
  )
}

function OllamaSetup({ info, checking, onCheck }: { info: LocalAiInfo; checking: boolean; onCheck(): void }) {
  const { install } = info
  return (
    <div className="rounded-[10px] border border-border p-4 text-[13.5px] leading-relaxed">
      {info.ollama.installed ? (
        <>
          <h3 className="text-[14px] font-semibold">{t('Ollama is installed but not running')}</h3>
          <p className="mt-1 text-muted">{t('Start it in a terminal, and keep it running while you study:')}</p>
          <div className="mt-2"><Command text={install.then ?? 'ollama serve'} /></div>
        </>
      ) : (
        <>
          <h3 className="text-[14px] font-semibold">{t('Ollama is not installed yet')}</h3>
          <p className="mt-1 text-muted">{t('Ollama runs AI models on this computer. Install it once; then download a model here.')}</p>
          {install.command && <><p className="mt-3 text-[12.5px] text-muted">{t('Install it in a terminal:')}</p><div className="mt-1"><Command text={install.command} /></div></>}
          {install.then && <><p className="mt-3 text-[12.5px] text-muted">{t('Then start it:')}</p><div className="mt-1"><Command text={install.then} /></div></>}
          <p className="mt-3"><a href={install.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-text">{install.command ? t('Other ways to install it') : t('Download Ollama')}</a></p>
        </>
      )}
      <Button className="mt-4" size="sm" busy={checking} onClick={onCheck}>{t('Check again')}</Button>
    </div>
  )
}

function ComputerLine({ hw, version }: { hw: Hardware; version: string | null }) {
  const memory = hw.unified ? t('{n} GB of memory, shared with the graphics chip', { n: gb(hw.memoryGb) }) : t('{n} GB of memory', { n: gb(hw.memoryGb) })
  return (
    <p className="flex items-start gap-1.5 text-[13px] text-muted">
      <Cpu className="mt-px size-4 shrink-0" strokeWidth={1.8} aria-hidden />
      <span>{t('This computer:')} {memory}{hw.gpu && ` · ${hw.gpu.name} (${gb(hw.gpu.memoryGb)} GB)`}{version && ` · Ollama ${version}`}</span>
    </p>
  )
}

function FitLabel({ fit }: { fit: ModelFit }) {
  const [Icon, text, tone] = fit === 'good' ? [CircleCheck, t('Runs well here'), 'text-good'] : fit === 'slow' ? [Gauge, t('Runs slowly here'), 'text-warn'] : [CircleSlash, t('Too big for this computer'), 'text-bad']
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap text-[12px] ${tone}`}><Icon className="size-3.5" strokeWidth={2} aria-hidden />{text}</span>
}

function DownloadBar({ download, canChange, onCancel, onRetry }: { download: ModelDownload | null; canChange: boolean; onCancel(): void; onRetry(model: string): void }) {
  if (!download || download.done) return null
  const pct = download.total ? Math.min(100, Math.round(100 * (download.completed ?? 0) / download.total)) : null
  if (download.error) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 rounded-[10px] border border-border p-3 text-[13px]">
        <span className="min-w-0 flex-1">{download.error === 'Download cancelled.' ? t('The download of {model} was cancelled.', { model: download.model }) : t('The download of {model} failed: {error}', { model: download.model, error: download.error })}</span>
        {canChange && <Button size="sm" variant="secondary" icon={Download} onClick={() => onRetry(download.model)}>{t('Try again')}</Button>}
      </div>
    )
  }
  return (
    <div className="rounded-[10px] border border-border p-3 text-[13px]" aria-live="polite">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          {t('Downloading {model}', { model: download.model })}
          {download.total ? <span className="text-muted"> · {t('{done} of {total} GB', { done: gb((download.completed ?? 0) / 1e9), total: gb(download.total / 1e9) })} ({pct}%)</span> : <span className="text-muted"> · {t('starting…')}</span>}
        </span>
        {canChange && <Button size="sm" variant="ghost" icon={X} onClick={onCancel}>{t('Cancel')}</Button>}
      </div>
      <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-hover" role="progressbar" aria-label={t('Download progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? 0}>
        <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${pct ?? 0}%` }} />
      </div>
      <p className="mt-1.5 text-[12px] text-muted">{t('It goes on if you leave this page; an interrupted download resumes where it stopped.')}</p>
    </div>
  )
}

function InUse({ info, canChange, busy, onChoose, onRemove }: { info: LocalAiInfo; canChange: boolean; busy: boolean; onChoose(m: string): void; onRemove(m: string): void }) {
  const chat = info.models.filter((m) => !m.embedding)
  return (
    <div>
      <h3 className="text-[14px] font-semibold">{t('The model Studio answers with')}</h3>
      {chat.length === 0 ? <p className="mt-1 text-[13px] text-muted">{t('No model yet: download one below.')}</p> : (
        <div role="radiogroup" aria-label={t('The model Studio answers with')} className="mt-2 flex flex-col divide-y divide-border rounded-[10px] border border-border">
          {chat.map((m) => {
            const chosen = m.name === info.chosen
            return (
              <div key={m.name} className="flex items-center gap-3 px-3 py-2">
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                  <input type="radio" name="local-model" checked={chosen} disabled={!canChange || busy} onChange={() => onChoose(m.name)} className="mt-[3px] accent-[var(--accent)]" />
                  <span className="min-w-0">
                    <span className="block break-all font-mono text-[13px]">{m.name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[12px] text-muted"><span className="whitespace-nowrap">{gb(m.sizeGb)} GB</span><FitLabel fit={m.fit} /></span>
                  </span>
                </label>
                {canChange && !chosen && <IconButton icon={Trash2} label={t('Remove {model}', { model: m.name })} disabled={busy} onClick={() => onRemove(m.name)} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Recommended({ info, canChange, busy, onDownload, onChoose }: { info: LocalAiInfo; canChange: boolean; busy: boolean; onDownload(m: string): void; onChoose(m: string): void }) {
  const active = downloading(info.download)
  const action = (c: CatalogModel) => {
    if (!canChange) return null
    if (c.name === info.chosen) return <span className="text-[12px] text-muted">{t('In use')}</span>
    if (c.installed) return <Button size="sm" variant="secondary" disabled={busy} onClick={() => onChoose(c.name)}>{t('Use')}</Button>
    return <Button size="sm" variant="secondary" icon={Download} disabled={busy || active} onClick={() => onDownload(c.name)}>{t('Download')}</Button>
  }
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-[14px] font-semibold"><Sparkles className="size-4 text-muted" strokeWidth={1.8} aria-hidden />{t('Recommended models')}</h3>
      <ul className="mt-2 flex flex-col divide-y divide-border rounded-[10px] border border-border">
        {info.catalog.map((c) => (
          <li key={c.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
            <div className="min-w-0 flex-1 basis-[260px]">
              <div className="flex flex-wrap items-baseline gap-x-2.5">
                <span className="font-mono text-[13px]">{c.name}</span>
                <span className="whitespace-nowrap text-[12px] text-muted">{gb(c.sizeGb)} GB</span>
                <FitLabel fit={c.fit} />
              </div>
              <p className="mt-0.5 text-[12.5px] text-muted">{purposeText(c.purpose)}</p>
            </div>
            {action(c)}
          </li>
        ))}
      </ul>
    </div>
  )
}

function OtherModel({ disabled, onDownload }: { disabled: boolean; onDownload(m: string): void }) {
  const [name, setName] = useState('')
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onDownload(name.trim()); setName('') } }}>
      <label className="flex min-w-0 flex-1 basis-[240px] flex-col gap-1 text-[12.5px] text-muted">
        <span>{t('Another model, by its name on')} <a href="https://ollama.com/library" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-text">ollama.com/library</a></span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="mistral:7b" spellCheck={false}
          className="h-8 rounded-[6px] border border-border-strong bg-bg px-2.5 font-mono text-[13px] text-text outline-none focus:border-focus" />
      </label>
      <Button type="submit" size="sm" variant="secondary" icon={Download} disabled={disabled || !name.trim()}>{t('Download')}</Button>
    </form>
  )
}

function ClaudeLine({ claude }: { claude: LocalAiInfo['claude'] }) {
  return (
    <p className="text-[13px] text-muted">
      <span className="font-medium text-text">Claude Code</span>{' · '}
      {claude.available ? t('ready, for AI courses and lesson improvements{version}', { version: claude.version ? ` (${claude.version})` : '' }) : t('not found. AI courses use Claude Code: install it and log in once with `claude`.')}
    </p>
  )
}
