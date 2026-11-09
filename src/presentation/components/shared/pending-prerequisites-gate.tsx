"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PendingPrerequisitesModal } from "./pending-prerequisites-modal";

export function PendingPrerequisitesGate({
  entityType,
  hasTeams,
  hasLocations,
  fallbackUrl,
}: {
  entityType: "task" | "process" | "person";
  hasTeams: boolean;
  hasLocations: boolean;
  fallbackUrl: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  return (
    <PendingPrerequisitesModal
      open={open}
      onClose={() => {
        setOpen(false);
        router.push(fallbackUrl);
      }}
      entityType={entityType}
      hasTeams={hasTeams}
      hasLocations={hasLocations}
    />
  );
}
