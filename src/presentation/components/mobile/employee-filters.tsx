"use client";

import { useRouter } from "next/navigation";
import { EmployeeSegments } from "./employee-segments";

export function EmployeeHistoryFilters({ period, status }: { period: string; status: string }) {
  const router = useRouter();
  return <div className="employee-history-filters">
    <EmployeeSegments label="Período do histórico" full value={period} options={["7", "30", "90", "365"].map(value => ({ value, label: `${value} dias` }))} onChange={value => router.push(`/history?period=${value}&status=${status}`)} />
    <EmployeeSegments label="Resultado do histórico" value={status} options={[{ value: "ALL", label: "Todos" }, { value: "COMPLETED", label: "Concluídas" }, { value: "CANCELLED", label: "Canceladas" }, { value: "NOT_COMPLETED", label: "Não realizadas" }]} onChange={value => router.push(`/history?period=${period}&status=${value}`)} />
  </div>;
}

export function EmployeeNoticeFilters({ status }: { status: string }) {
  const router = useRouter();
  return <EmployeeSegments label="Filtrar avisos" full value={status} options={[{ value: "all", label: "Todos" }, { value: "unread", label: "Não lidos" }, { value: "read", label: "Lidos" }]} onChange={value => router.push(`/notifications?status=${value}`)} />;
}
