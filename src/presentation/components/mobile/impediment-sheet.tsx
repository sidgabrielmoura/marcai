"use client";

import { Box, Wrench, LockKeyhole, Ellipsis, X, TriangleAlert } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldGroup, FieldSet, FieldLegend } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription } from "@/components/ui/alert";

const categories = [
  { value: "MATERIAL_FALTANTE", label: "Falta de material", Icon: Box },
  { value: "EQUIPAMENTO_QUEBRADO", label: "Equipamento com defeito", Icon: Wrench },
  { value: "ACESSO_BLOQUEADO", label: "Local inacessível", Icon: LockKeyhole },
  { value: "OUTROS", label: "Outro motivo", Icon: Ellipsis },
];

export function ImpedimentSheet({ open, category, reason, busy, error, onCategoryChange, onReasonChange, onClose, onSubmit }: {
  open: boolean; category: string; reason: string; busy: boolean; error?: string | null;
  onCategoryChange: (value: string) => void; onReasonChange: (value: string) => void;
  onClose: () => void; onSubmit: () => void;
}) {
  return <Sheet open={open} onOpenChange={next => { if (!next && !busy) onClose(); }}>
    <SheetContent side="bottom" showCloseButton={false} className="employee-impediment-sheet" overlayClassName="employee-impediment-overlay">
      <div className="employee-sheet-handle" />
      <SheetHeader>
        <SheetTitle>Registrar impedimento</SheetTitle>
        <SheetDescription className="sr-only">Informe o motivo e descreva o que aconteceu.</SheetDescription>
        <Button type="button" variant="ghost" size="icon" disabled={busy} onClick={onClose} aria-label="Fechar" className="employee-sheet-close"><X /></Button>
      </SheetHeader>
      <form onSubmit={event => { event.preventDefault(); if (!busy && reason.trim().length >= 3) onSubmit(); }}>
        <Alert variant="destructive"><TriangleAlert /><AlertDescription>A tarefa será encerrada como não realizada e a gestão será avisada. Esta ação não pode ser desfeita.</AlertDescription></Alert>
        <FieldGroup>
          <FieldSet disabled={busy}>
            <FieldLegend>Motivo</FieldLegend>
            <div className="employee-impediment-options">{categories.map(({ value, label, Icon }) => <label key={value}>
              <input type="radio" name="impediment-category" value={value} checked={category === value} onChange={() => onCategoryChange(value)} disabled={busy} />
              <Icon aria-hidden="true" /><span>{label}</span><span className="employee-radio-mark" />
            </label>)}</div>
          </FieldSet>
          <Field>
            <FieldLabel htmlFor="impediment-reason">O que impediu a realização?</FieldLabel>
            <Textarea id="impediment-reason" placeholder="Descreva o que aconteceu" value={reason} disabled={busy} required minLength={3} maxLength={1000} rows={3} onChange={event => onReasonChange(event.target.value)} />
          </Field>
        </FieldGroup>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <Button type="submit" variant="destructive" disabled={busy || reason.trim().length < 3} className="employee-impediment-submit">{busy && <Spinner data-icon="inline-start" />}Registrar e encerrar tarefa</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
      </form>
    </SheetContent>
  </Sheet>;
}
