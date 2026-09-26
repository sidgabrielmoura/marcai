"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle2, Clock, XCircle } from "lucide-react";
import { updateMemberAvailabilityAction } from "@/presentation/actions/management-task-actions";

interface MemberAvailabilityCardProps {
  initialManual: string;
  initialCalculated: string;
}

export function MemberAvailabilityCard({
  initialManual,
  initialCalculated,
}: MemberAvailabilityCardProps) {
  const [manual, setManual] = useState(initialManual || "AUTO");
  const [calculated, setCalculated] = useState(initialCalculated || "AVAILABLE");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleUpdate = async (setting: "AUTO" | "AVAILABLE" | "UNAVAILABLE") => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await updateMemberAvailabilityAction(setting);
      if (res.success && res.data) {
        setManual(setting);
        setCalculated((res.data as { availabilityStatus: string }).availabilityStatus);
        setMessage("Status operacional atualizado.");
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage(res.error || "Erro ao atualizar status.");
      }
    } catch {
      setMessage("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = () => {
    switch (calculated) {
      case "AVAILABLE":
        return (
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1.5 py-1 px-3">
            <CheckCircle2 className="size-3.5" />
            <span>Disponível para tarefas</span>
          </Badge>
        );
      case "BUSY":
        return (
          <Badge className="bg-amber-50 text-amber-700 border-amber-200 gap-1.5 py-1 px-3">
            <Clock className="size-3.5" />
            <span>Ocupado em tarefa ativa</span>
          </Badge>
        );
      default:
        return (
          <Badge className="bg-zinc-100 text-zinc-600 border-zinc-200 gap-1.5 py-1 px-3">
            <XCircle className="size-3.5" />
            <span>Indisponível no momento</span>
          </Badge>
        );
    }
  };

  return (
    <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none border border-[var(--border-subtle)] ring-0">
      <CardHeader className="p-0 mb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-[length:var(--type-body)] font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
          <Activity className="size-4 text-[var(--brand-700)]" />
          <span>Disponibilidade Operacional</span>
        </CardTitle>
        {getStatusBadge()}
      </CardHeader>
      <CardContent className="p-0 space-y-3">
        <p className="text-[length:var(--type-caption)] text-[var(--text-secondary)] leading-relaxed">
          Defina seu estado para atribuição inteligente de tarefas. Em modo automático, o sistema considera suas tarefas em andamento e horário de funcionamento da unidade.
        </p>

        <div className="grid grid-cols-3 gap-2 pt-1">
          <Button
            type="button"
            variant={manual === "AUTO" ? "default" : "outline"}
            size="sm"
            disabled={loading}
            onClick={() => handleUpdate("AUTO")}
            className="text-xs font-semibold h-9 rounded-xl"
          >
            Automático
          </Button>
          <Button
            type="button"
            variant={manual === "AVAILABLE" ? "default" : "outline"}
            size="sm"
            disabled={loading}
            onClick={() => handleUpdate("AVAILABLE")}
            className="text-xs font-semibold h-9 rounded-xl"
          >
            Disponível
          </Button>
          <Button
            type="button"
            variant={manual === "UNAVAILABLE" ? "default" : "outline"}
            size="sm"
            disabled={loading}
            onClick={() => handleUpdate("UNAVAILABLE")}
            className="text-xs font-semibold h-9 rounded-xl"
          >
            Pausa / Ausente
          </Button>
        </div>

        {message && (
          <p className="text-xs text-[var(--brand-700)] font-medium text-center pt-1 animate-in fade-in">
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
