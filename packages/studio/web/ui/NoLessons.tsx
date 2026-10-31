// The same honest answer wherever lessons are needed and there are none yet, with the way to get some.
import { Link } from 'wouter'
import { GraduationCap, Sparkles } from 'lucide-react'
import { useSession } from '../api/queries'
import { Empty, linkButton } from './primitives'
import { t } from '../i18n'

export function NoLessons({ ws }: { ws: string }) {
  const canWrite = useSession().data?.caps.includes('write')
  return (
    <Empty icon={GraduationCap} title={t('No lessons yet')} action={canWrite ? <Link href={`/start?ws=${ws}`} className={linkButton}><Sparkles className="size-[15px]" strokeWidth={1.8} aria-hidden />{t('Make lessons with an AI')}</Link> : undefined}>
      {t('Lessons are what you study here. An AI can write them from your files, or you can make your own cards while you read.')}
    </Empty>
  )
}
