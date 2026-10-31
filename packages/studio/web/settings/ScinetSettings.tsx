// Settings → SciNet: where your paper library answers. Import → SciNet brings papers in from it.
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, CircleSlash } from 'lucide-react'
import { keys, scinetApi, useSession } from '../api/queries'
import { Button, ErrorNote, Spinner } from '../ui/primitives'
import { SCINET_START } from '../import/ScinetImport'
import { Command } from './Command'
import { Section } from './Section'
import { t, tp } from '../i18n'

export function ScinetSettings() {
  const canChange = useSession().data?.caps.includes('write') ?? false
  return canChange ? <Connection /> : null
}

function Connection() {
  const qc = useQueryClient()
  const status = useQuery({ queryKey: keys.scinet, queryFn: scinetApi.status, retry: false })
  const [edited, setEdited] = useState<string | null>(null)
  const address = edited ?? status.data?.url ?? ''
  const save = useMutation({ mutationFn: scinetApi.setUrl, onSuccess: (s) => { qc.setQueryData(keys.scinet, s); setEdited(null) } })
  const d = status.data
  return (
    <Section id="scinet" title={t('SciNet')} intro={t('SciNet is your private map of papers. When it is running on this computer, Import can bring its papers here to study.')}>
      {status.isLoading && <Spinner />}
      {status.error && <ErrorNote error={status.error} retry={() => void status.refetch()} />}
      {d && (
        <>
          <p className="flex items-center gap-1.5 text-[13.5px]">
            {d.running ? <CircleCheck className="size-4 shrink-0 text-good" strokeWidth={2} aria-hidden /> : <CircleSlash className="size-4 shrink-0 text-muted" strokeWidth={2} aria-hidden />}
            {d.running ? `${t('Running')}${d.papers !== undefined ? ` · ${tp(d.papers, '{n} paper', '{n} papers')}` : ''}` : t('Not running')}
          </p>
          {!d.running && <Command text={SCINET_START} />}
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); save.mutate(address) }}>
            <label className="min-w-[240px] flex-1 text-[12.5px] text-muted">{t('Address')}
              <input value={address} onChange={(e) => setEdited(e.target.value)} inputMode="url" spellCheck={false}
                className="mt-1 block h-9 w-full rounded-[6px] border border-border-strong bg-bg px-3 font-mono text-[13px] text-text outline-none focus:border-focus" />
            </label>
            <Button type="submit" variant="secondary" busy={save.isPending || status.isFetching}>{t('Check again')}</Button>
          </form>
          {save.error && <ErrorNote error={save.error} />}
        </>
      )}
    </Section>
  )
}
