// /capture: only the capture box, for a phone's home screen and the desktop app's quick window.
import { useEffect, useState } from 'react'
import { Link, useSearch } from 'wouter'
import { useWorkspaces } from '../api/queries'
import { ErrorNote, Spinner } from '../ui/primitives'
import { CaptureForm } from './CaptureForm'
import { t } from '../i18n'

export default function CapturePage() {
  const params = new URLSearchParams(useSearch())
  const once = params.has('once') // the desktop app's window closes itself after one thought
  const folders = useWorkspaces()
  const [saved, setSaved] = useState(0)
  useEffect(() => {
    if (!once) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') window.close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [once])
  const folder = folders.data?.find((f) => f.id === params.get('ws')) ?? folders.data?.[0]
  return (
    <main className="mx-auto w-full max-w-[560px] px-4 pt-5">
      {folders.isLoading && <Spinner />}
      {folders.error && <ErrorNote error={folders.error} retry={() => void folders.refetch()} />}
      {folders.data && !folder && <p className="text-[14px] text-muted">{t('Open a folder first.')} <Link href="/" className="underline">{t('Open or upload a folder')}</Link></p>}
      {folder && (
        <>
          <h1 className="mb-2 text-[15px] font-semibold">{t('Capture')} <span className="font-normal text-muted">· {folder.name}</span></h1>
          <CaptureForm ws={folder.id} rows={once ? 3 : 5} autoFocus onSaved={() => { if (once) window.close(); else setSaved((n) => n + 1) }} />
          <p role="status" className="mt-2 text-[13px] text-muted">{saved > 0 ? t('Saved to your inbox') : ''}</p>
        </>
      )}
    </main>
  )
}
