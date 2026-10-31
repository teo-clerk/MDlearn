/** One radio with a title and a line about what it means. */
export function Choice({ name, checked, disabled, onChange, title, hint }: { name: string; checked: boolean; disabled?: boolean; onChange: () => void; title: string; hint: string }) {
  return (
    <label className={`mt-1.5 flex items-start gap-2 text-[13px] ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} className="mt-0.5 accent-[var(--accent)]" />
      <span><span className="block font-medium">{title}</span><span className="block text-[12px] leading-snug text-muted">{hint}</span></span>
    </label>
  )
}
