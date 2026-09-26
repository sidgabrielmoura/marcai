"use client";

import { type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  onClose,
  title,
  children,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent
        className={cn(
          "sm:max-w-lg bg-[var(--surface)] text-[var(--text-primary)] rounded-[18px] border border-[var(--border-subtle)] p-6 shadow-[var(--shadow-float)]",
          className,
        )}
        showCloseButton={true}
      >
        <DialogHeader className="mb-2">
          <DialogTitle className="text-[length:var(--type-card-title)] font-bold text-[var(--text-primary)]">
            {title}
          </DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
