"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function EmployeeSegments({ value, options, onChange, disabled = false, full = false, label }: {
  value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void;
  disabled?: boolean; full?: boolean; label: string;
}) {
  return <ToggleGroup aria-label={label} value={value ? [value] : []} disabled={disabled}
    onValueChange={values => { if (values.length) onChange(values[values.length - 1]); }}
    className="employee-segments" data-full={full || undefined}>
    {options.map((option, index) => <ToggleGroupItem key={index} value={option.value}>{option.label}</ToggleGroupItem>)}
  </ToggleGroup>;
}
