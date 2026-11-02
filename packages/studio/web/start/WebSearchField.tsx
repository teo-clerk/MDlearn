// Off unless you turn it on, each time: what the AI searches for leaves this computer.
import { t } from '../i18n'

export function WebSearchField({ value, onChange }: { value: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-[13px]">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="mt-[3px] accent-accent" />
      <span>
        <span className="font-medium">{t('Let Claude search the web')}</span>
        <span className="block text-[12.5px] text-muted">{t('To check facts and find pictures and videos. What it searches for leaves this computer.')}</span>
      </span>
    </label>
  )
}
