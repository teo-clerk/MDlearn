// The language a course is written in: any language an AI can write, so it is typed rather than picked from a list.
export function LanguageField({ value, onChange, label, placeholder, autoFocus }: { value: string; onChange: (language: string) => void; label: string; placeholder: string; autoFocus?: boolean }) {
  return (
    <label className="block text-[13px] font-medium">{label}
      <input value={value} onChange={(e) => onChange(e.target.value)} maxLength={40} placeholder={placeholder} autoFocus={autoFocus}
        className="mt-1.5 block w-full max-w-[260px] rounded-[6px] border border-border-strong bg-bg px-3 py-1.5 text-[14px] font-normal outline-none focus:border-accent" />
    </label>
  )
}
