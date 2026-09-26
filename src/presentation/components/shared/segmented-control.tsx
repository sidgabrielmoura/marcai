"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface SegmentOption<T extends string> {
  id: T;
  label: string;
  count?: number;
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: "default" | "sm";
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = "",
  size = "default",
}: SegmentedControlProps<T>) {
  const selectedOption = options.find((option) => option.id === value);

  const renderOption = (option: SegmentOption<T>) => (
    <span className="flex items-center gap-1.5">
      <span>{option.label}</span>

      {option.count !== undefined && (
        <span className="rounded-full bg-neutral-200 px-1.5 py-0.5 text-(length:--type-caption) font-semibold leading-none text-brand-900">
          {option.count}
        </span>
      )}
    </span>
  );

  return (
    <Select
      value={value}
      onValueChange={(nextValue) => {
        const option = options.find((item) => item.id === nextValue);
        if (option) onChange(option.id);
      }}
    >
      <SelectTrigger
        className={cn(
          "w-full rounded-[14px] border border-(--border-subtle) bg-surface shadow-none",
          size === "sm" ? "h-9" : "h-11",
          className,
        )}
      >
        <SelectValue placeholder="Selecione uma opção">
          {selectedOption ? renderOption(selectedOption) : undefined}
        </SelectValue>
      </SelectTrigger>

      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {renderOption(option)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}