// Ctrl+Shift+K, or Capture… in the palette: a box for a thought, wherever you are.
import { useUi } from '../state/ui'
import { CaptureForm } from './CaptureForm'
import { t } from '../i18n'

export function CaptureDialog({ ws }: { ws: string }) {
  const { captureOpen, setCaptureOpen, notify } = useUi()
  if (!captureOpen) return null
  const close = () => setCaptureOpen(false)
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 px-4 pt-[16vh]" onMouseDown={close}>
      <div role="dialog" aria-modal="true" aria-label={t('Capture')} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') close() }}
        className="w-full max-w-[520px] rounded-[10px] border border-border bg-raised p-4 shadow-pop">
        <h2 className="mb-2 text-[14px] font-semibold">{t('Capture')}</h2>
        <CaptureForm ws={ws} rows={3} autoFocus onSaved={() => { close(); notify(t('Saved to your inbox')) }} />
      </div>
    </div>
  )
}
