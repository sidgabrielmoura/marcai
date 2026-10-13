"use client";
export function FormChoiceInput({ options, value, onChange, disabled = false }: { options: string[]; value: unknown; onChange: (value: string) => void; disabled?: boolean }) {
  return <div className="flex flex-col gap-2">{options.map(option => <button key={option} type="button" disabled={disabled} aria-pressed={value === option} onClick={() => onChange(option)} className={"rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition-colors disabled:opacity-60 " + (value === option ? "border-brand-700 bg-brand-soft text-brand-900" : "border-(--border-subtle) bg-surface text-foreground hover:bg-muted")}>{option}</button>)}</div>;
}
