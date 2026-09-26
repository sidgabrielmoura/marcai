"use client";

import { type ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function FilterSheet({
  isOpen,
  onClose,
  title = "Filtrar resultados",
  onApply,
  onClear,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  onApply: () => void;
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="flex flex-col gap-4 p-6 sm:max-w-md bg-[var(--surface)] text-[var(--text-primary)]"
      >
        <SheetHeader>
          <SheetTitle className="text-[length:var(--type-card-title)] font-bold text-[var(--text-primary)]">
            {title}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto space-y-4 py-2">{children}</div>
        <SheetFooter className="mt-auto flex flex-row gap-2 pt-4 border-t border-[var(--border-subtle)]">
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-11 rounded-[14px]"
            onClick={onClear}
          >
            Limpar filtros
          </Button>
          <Button
            type="button"
            className="flex-1 h-11 rounded-[14px] bg-[var(--brand-900)] hover:bg-[var(--brand-700)] text-white"
            onClick={onApply}
          >
            Aplicar filtros
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
