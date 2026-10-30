"use client";

import { useLayoutEffect, useRef, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";

function digitsOnly(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.slice(0, digits.startsWith("55") ? 13 : 15);
}

function formatPhone(value: string) {
  const digits = digitsOnly(value);
  if (!digits) return "";
  if (!digits.startsWith("55")) return `+${digits}`;
  const area = digits.slice(2, 4);
  const number = digits.slice(4);
  if (!area) return "+55";
  if (!number) return `+55 (${area}`;
  const split = number.length > 8 ? 5 : 4;
  const subscriber = number.length > split
    ? `${number.slice(0, split)}-${number.slice(split)}`
    : number;
  return `+55 (${area}) ${subscriber}`;
}

type PhoneInputProps = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type" | "onKeyDown"> & {
  value: string;
  onValueChange: (digits: string) => void;
};

/** Formats Brazilian numbers with DDI/DDD; other countries retain their international digits. */
export function PhoneInput({ value, onValueChange, ...props }: PhoneInputProps) {
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const formatted = formatPhone(value);

  function restoreCaret() {
    if (caret.current === null || !input.current) return;
    let position = 0;
    let digits = 0;
    while (position < input.current.value.length && digits < caret.current) {
      if (/\d/.test(input.current.value[position])) digits++;
      position++;
    }
    input.current.setSelectionRange(position, position);
    caret.current = null;
  }

  useLayoutEffect(restoreCaret, [value]);

  return <Input
    {...props}
    ref={input}
    type="tel"
    inputMode="tel"
    autoComplete="tel"
    value={formatted}
    onChange={event => {
      const next = digitsOnly(event.target.value);
      caret.current = event.target.value.slice(0, event.target.selectionStart ?? event.target.value.length).replace(/\D/g, "").length;
      onValueChange(next);
      if (next === value) {
        event.target.value = formatted;
        restoreCaret();
      }
    }}
    onKeyDown={event => {
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      const element = event.currentTarget;
      const start = element.selectionStart ?? 0;
      if (start !== element.selectionEnd) return;
      const backwards = event.key === "Backspace";
      let index = backwards ? start - 1 : start;
      if (index < 0 || index >= formatted.length || /\d/.test(formatted[index])) return;
      while (index >= 0 && index < formatted.length && !/\d/.test(formatted[index])) index += backwards ? -1 : 1;
      if (index < 0 || index >= formatted.length) return;
      event.preventDefault();
      const digitIndex = formatted.slice(0, index).replace(/\D/g, "").length;
      const digits = digitsOnly(value);
      caret.current = backwards ? digitIndex : formatted.slice(0, start).replace(/\D/g, "").length;
      onValueChange(digits.slice(0, digitIndex) + digits.slice(digitIndex + 1));
    }}
  />;
}
