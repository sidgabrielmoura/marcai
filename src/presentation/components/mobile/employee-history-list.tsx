"use client";

import { useState } from "react";
import { StatusBadge } from "@/presentation/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "lucide-react";
import { EmployeeTaskDetailDrawer } from "./task-detail-drawer";

export interface HistoryTaskItem {
  id: string;
  title: string;
  status: string;
  locationName: string | null;
  dateLabel: string;
}

export function EmployeeHistoryList({ tasks }: { tasks: HistoryTaskItem[] }) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-3">
        {tasks.map((t) => (
          <Card key={t.id}>
            <CardContent className="flex flex-wrap justify-between items-center gap-4">
              <div>
                <StatusBadge status={t.status} />
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTaskId(t.id);
                    setSheetOpen(true);
                  }}
                  className="text-left text-card-title font-semibold mt-2 hover:underline cursor-pointer block"
                >
                  {t.title}
                </button>
                <p className="text-caption text-muted-foreground mt-1">
                  {t.locationName ? `${t.locationName} · ` : ""}
                  {t.dateLabel}
                </p>
              </div>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setSelectedTaskId(t.id);
                  setSheetOpen(true);
                }}
                className="cursor-pointer"
              >
                Ver detalhes
                <ArrowUpRight data-icon="inline-end" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <EmployeeTaskDetailDrawer
        taskId={selectedTaskId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  );
}
