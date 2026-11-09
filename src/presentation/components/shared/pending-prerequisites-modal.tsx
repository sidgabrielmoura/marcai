"use client";

import { Modal } from "./modal";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export interface PendingPrerequisitesModalProps {
  open: boolean;
  onClose: () => void;
  entityType: "task" | "process" | "person";
  hasTeams: boolean;
  hasLocations?: boolean;
}

export function PendingPrerequisitesModal({
  open,
  onClose,
  entityType,
  hasTeams,
  hasLocations = true,
}: PendingPrerequisitesModalProps) {
  const router = useRouter();

  if (!open) return null;

  const entityName =
    entityType === "task"
      ? "uma tarefa"
      : entityType === "process"
        ? "um processo"
        : "uma pessoa";

  const missingTeams = !hasTeams;
  const missingLocations = !hasLocations;

  let title = "Equipe pendente";
  let message = `Você precisa criar uma equipe antes de ${entityType === "person" ? "adicionar" : "criar"} ${entityName}.`;

  if (missingTeams && missingLocations) {
    title = "Equipe e unidade pendentes";
    message = `Você precisa criar ao menos uma equipe e uma unidade antes de criar ${entityName}.`;
  } else if (missingLocations) {
    title = "Unidade pendente";
    message = `Você precisa criar uma unidade antes de criar ${entityName}.`;
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      className="sm:max-w-sm p-5"
    >
      <div className="flex flex-col gap-5 pt-1">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {message}
        </p>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </Button>

          {missingLocations && (
            <Button
              type="button"
              variant={missingTeams ? "outline" : "default"}
              size="sm"
              onClick={() => {
                onClose();
                router.push("/management/locations");
              }}
              className={
                missingTeams
                  ? "text-xs"
                  : "bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-secondary)] text-xs shadow-none"
              }
            >
              Criar unidade
            </Button>
          )}

          {missingTeams && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onClose();
                router.push("/management/teams");
              }}
              className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-secondary)] text-xs shadow-none"
            >
              Criar equipe
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
