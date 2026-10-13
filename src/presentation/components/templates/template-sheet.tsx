
"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";

export function TemplateSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const mobile = useIsMobile();

  const header = (
    Title: typeof DialogTitle | typeof DrawerTitle,
    Description:
      | typeof DialogDescription
      | typeof DrawerDescription,
  ) => (
    <header className="relative shrink-0 border-b border-(--border-subtle) px-5 pt-6 pb-4 sm:px-7">
      <Title className="pr-9 text-xl font-semibold tracking-tight">
        {title}
      </Title>

      <Description className="mt-1 pr-7 text-xs leading-relaxed">
        {description}
      </Description>

      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute top-5 right-4 size-11 rounded-full bg-muted/70 sm:size-8"
        aria-label="Fechar templates"
        onClick={() => onOpenChange(false)}
      >
        <X className="size-4" />
      </Button>
    </header>
  );

  const content = (
    <>
      <div
        key={title}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-7"
      >
        {children}
      </div>

      {footer && (
        <footer className="shrink-0 bg-surface px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-7 **:data-[slot=button]:min-h-11 sm:**:data-[slot=button]:min-h-8">
          {footer}
        </footer>
      )}
    </>
  );

  if (mobile) {
    return (
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        showSwipeHandle
      >
        <DrawerContent className="rounded-t-[28px] [--drawer-content-height:90dvh] data-[swipe-axis=y]:[--drawer-content-max-height:94dvh] **:data-[slot=drawer-swipe-handle]:after:w-10 shadow-2xl">
          {header(DrawerTitle, DrawerDescription)}
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90dvh] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-[28px] p-0 shadow-2xl sm:max-w-3xl"
      >
        {header(DialogTitle, DialogDescription)}
        {content}
      </DialogContent>
    </Dialog>
  );
}
