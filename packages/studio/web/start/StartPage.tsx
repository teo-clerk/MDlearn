// A course, the way most people will start: say what it is about, add any files you have, choose who writes it, study.
import { useEffect, useState } from 'react'
import { Link, useLocation, useSearch } from 'wouter'
import { ArrowLeft } from 'lucide-react'
import { FileResults, FilesStep } from './FilesStep'
import { WriterStep } from './WriterStep'
import type { ClassFile } from '../../shared/types'
import { t } from '../i18n'

export default function StartPage() {
  const params = new URLSearchParams(useSearch())
  const ws = params.get('ws') ?? undefined, adding = params.has('add')
  const [, navigate] = useLocation()
  const [read, setRead] = useState<ClassFile[]>([])
  useEffect(() => { document.title = t('Make a course · MDlearn Studio') }, [])
  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-bg">
      <div className="mx-auto max-w-[680px] px-6 pb-16 pt-[8vh]">
        <Link href={ws ? `/w/${ws}` : '/'} className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-text"><ArrowLeft className="size-3.5" aria-hidden />{ws ? t('Back to the folder') : t('MDlearn Studio')}</Link>
        <h1 className="mt-4 text-[22px] font-semibold tracking-[-0.015em]">{t('Make a course')}</h1>
        <p className="mt-2 max-w-[56ch] text-[14.5px] leading-relaxed text-muted">{t('Say what you want to learn and add any files you have. An AI writes better notes from them, with exercises, and you study them here, a few minutes a day.')}</p>
        {!ws || adding
          ? <FilesStep ws={ws} onDone={(u) => { setRead(u.files); navigate(`/start?ws=${u.id}`, { replace: true }) }} />
          : <>{!!read.length && <FileResults files={read} />}<WriterStep ws={ws} /></>}
      </div>
    </div>
  )
}
