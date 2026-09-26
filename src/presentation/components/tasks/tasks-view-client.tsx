"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Table as TableIcon,
  Columns3,
  Plus,
  Trash2,
  SlidersHorizontal,
  Clock,
  AlertTriangle,
  User,
  CheckCircle2,
  AlertCircle,
  Eye,
  ChevronRight,
  X,
} from "lucide-react";
import {
  trashTaskAction,
  cancelTaskAction,
} from "@/presentation/actions/management-task-actions";
import {
  PageHeader,
  StatusBadge,
  PriorityBadge,
  EmptyState,
  FilterSheet,
} from "@/presentation/components/shared";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";

interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  origin: string;
  status: string;
  priority: string;
  criticality: string;
  required: boolean;
  deadlineAt: Date | string | null;
  locationName: string | null;
  teamName: string | null;
  primaryAssignee: string | null;
  slaExceeded: boolean;
}

interface TasksViewClientProps {
  tasks: TaskItem[];
  locations: Array<{ id: string; name: string }>;
  teams: Array<{ id: string; name: string }>;
  userRole: string;
}

const originFilterItems = [
  { label: "Todas as origens", value: "ALL" },
  { label: "Processo", value: "PROCESS" },
  { label: "Tarefa avulsa", value: "AD_HOC" },
];

const statusFilterItems = [
  { label: "Todos os status", value: "ALL" },
  { label: "Disponível", value: "AVAILABLE" },
  { label: "Em andamento", value: "IN_PROGRESS" },
  { label: "Pausada", value: "PAUSED" },
  { label: "Bloqueada", value: "BLOCKED" },
  { label: "Concluída", value: "COMPLETED" },
  { label: "Impedimento", value: "NOT_COMPLETED" },
  { label: "Cancelada", value: "CANCELLED" },
];

const priorityFilterItems = [
  { label: "Todas as prioridades", value: "ALL" },
  { label: "Crítica", value: "CRITICAL" },
  { label: "Alta", value: "HIGH" },
  { label: "Média", value: "MEDIUM" },
  { label: "Baixa", value: "LOW" },
];

export function TasksViewClient({
  tasks,
  locations,
  teams,
  userRole,
}: TasksViewClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [filterOrigin, setFilterOrigin] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterPriority, setFilterPriority] = useState<string>("ALL");
  const [filterLocation, setFilterLocation] = useState<string>("ALL");
  const [filterTeam, setFilterTeam] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>(
    searchParams.get("q") || "",
  );
  const queryFromUrl = searchParams.get("q") || "";
  useEffect(() => {
    setSearchQuery(queryFromUrl);
  }, [queryFromUrl]);

  // Bottom Sheet de Filtros no Mobile
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [tempOrigin, setTempOrigin] = useState("ALL");
  const [tempStatus, setTempStatus] = useState("ALL");
  const [tempPriority, setTempPriority] = useState("ALL");
  const [tempLocation, setTempLocation] = useState("ALL");
  const [tempTeam, setTempTeam] = useState("ALL");

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Dialogs de Ações
  const [taskToTrash, setTaskToTrash] = useState<string | null>(null);
  const [taskToCancel, setTaskToCancel] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const locationFilterItems = [
    { label: "Todas as unidades", value: "ALL" },
    ...locations.map((loc) => ({ label: loc.name, value: loc.name })),
  ];

  const teamFilterItems = [
    { label: "Todas as equipes", value: "ALL" },
    ...teams.map((t) => ({ label: t.name, value: t.name })),
  ];

  // Filtragem no cliente
  const filteredTasks = tasks.filter((task) => {
    if (filterOrigin !== "ALL" && task.origin !== filterOrigin) return false;
    if (filterStatus !== "ALL" && task.status !== filterStatus) return false;
    if (filterPriority !== "ALL" && task.priority !== filterPriority)
      return false;
    if (filterLocation !== "ALL" && task.locationName !== filterLocation)
      return false;
    if (filterTeam !== "ALL" && task.teamName !== filterTeam) return false;
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      const matchTitle = task.title.toLowerCase().includes(q);
      const matchAssignee = task.primaryAssignee?.toLowerCase().includes(q);
      if (!matchTitle && !matchAssignee) return false;
    }
    return true;
  });

  const activeFiltersCount =
    (filterOrigin !== "ALL" ? 1 : 0) +
    (filterStatus !== "ALL" ? 1 : 0) +
    (filterPriority !== "ALL" ? 1 : 0) +
    (filterLocation !== "ALL" ? 1 : 0) +
    (filterTeam !== "ALL" ? 1 : 0);

  function handleOpenFilterSheet() {
    setTempOrigin(filterOrigin);
    setTempStatus(filterStatus);
    setTempPriority(filterPriority);
    setTempLocation(filterLocation);
    setTempTeam(filterTeam);
    setIsFilterOpen(true);
  }

  function handleApplyFilters() {
    setFilterOrigin(tempOrigin);
    setFilterStatus(tempStatus);
    setFilterPriority(tempPriority);
    setFilterLocation(tempLocation);
    setFilterTeam(tempTeam);
    setIsFilterOpen(false);
  }

  function handleClearFilters() {
    setTempOrigin("ALL");
    setTempStatus("ALL");
    setTempPriority("ALL");
    setTempLocation("ALL");
    setTempTeam("ALL");
    setFilterOrigin("ALL");
    setFilterStatus("ALL");
    setFilterPriority("ALL");
    setFilterLocation("ALL");
    setFilterTeam("ALL");
    setSearchQuery("");
    setIsFilterOpen(false);
  }

  async function handleConfirmTrash() {
    if (!taskToTrash) return;
    setActionLoading(taskToTrash);
    try {
      await trashTaskAction(taskToTrash, "Movido para lixeira pela interface");
      setTaskToTrash(null);
      router.refresh();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleConfirmCancel() {
    if (!taskToCancel || !cancelReason.trim()) return;
    setActionLoading(taskToCancel);
    try {
      await cancelTaskAction(taskToCancel, cancelReason.trim());
      setTaskToCancel(null);
      setCancelReason("");
      router.refresh();
    } finally {
      setActionLoading(null);
    }
  }

  const kanbanColumns = [
    {
      id: "AVAILABLE",
      title: "Disponível",
      color: "border-t-[var(--sage-400)]",
      statuses: ["AVAILABLE"],
    },
    {
      id: "IN_PROGRESS",
      title: "Em andamento",
      color: "border-t-[var(--brand-900)]",
      statuses: ["IN_PROGRESS"],
    },
    {
      id: "PAUSED_BLOCKED",
      title: "Pausadas e bloqueadas",
      color: "border-t-amber-500",
      statuses: ["PAUSED", "BLOCKED"],
    },
    {
      id: "REVIEW",
      title: "Revisão",
      color: "border-t-[var(--sage-400)]",
      statuses: ["SUBMITTED", "NEEDS_CORRECTION", "PENDING_REVIEW"],
    },
    {
      id: "COMPLETED",
      title: "Concluída",
      color: "border-t-emerald-600",
      statuses: ["COMPLETED"],
    },
  ];

  return (
    <div className="page-stack">
      {/* Cabeçalho canônico */}
      <PageHeader
        title="Tarefas"
        subtitle={`${filteredTasks.length} de ${tasks.length} tarefas filtradas`}
        action={
          <div className="flex items-center gap-2">
            {/* Alternador Tabela / Kanban */}
            <ToggleGroup
              value={[viewMode]}
              onValueChange={(val) => {
                if (
                  val.length > 0 &&
                  (val[0] === "table" || val[0] === "kanban")
                ) {
                  setViewMode(val[0] as "table" | "kanban");
                }
              }}
              className="bg-[var(--surface)] border border-[var(--border-subtle)] p-1 rounded-[14px]"
            >
              <ToggleGroupItem
                value="table"
                aria-label="Visualização em tabela"
                className="text-[length:var(--type-label)] font-semibold px-3 py-1.5 rounded-[10px]"
              >
                <TableIcon data-icon="inline-start" className="size-3.5" />
                <span className="hidden sm:inline">Tabela</span>
              </ToggleGroupItem>
              <ToggleGroupItem
                value="kanban"
                aria-label="Visualização em kanban"
                className="text-[length:var(--type-label)] font-semibold px-3 py-1.5 rounded-[10px]"
              >
                <Columns3 data-icon="inline-start" className="size-3.5" />
                <span className="hidden sm:inline">Kanban</span>
              </ToggleGroupItem>
            </ToggleGroup>

            <Button nativeButton={false}
              variant="outline"
              size="icon"
              render={<Link href="/management/tasks/trash" />}
              className="size-11 rounded-[14px] bg-[var(--surface)] border-[var(--border-subtle)] text-[var(--brand-700)] hover:text-[var(--brand-900)] hover:bg-[var(--canvas)] shrink-0"
              title="Abrir lixeira"
              aria-label="Lixeira de tarefas"
            >
              <Trash2 className="size-4.5" />
            </Button>

            <Button nativeButton={false}
              render={<Link href="/management/tasks/new" />}
              className="h-11 px-4 rounded-[14px] bg-[var(--brand-900)] text-white text-[length:var(--type-label)] font-semibold hover:bg-[var(--brand-700)] shadow-none transition-all flex items-center gap-1.5 shrink-0"
            >
              <Plus data-icon="inline-start" className="size-4" />
              <span>Criar tarefa</span>
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Input
            type="text"
            placeholder="Buscar por título ou responsável..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 text-[length:var(--type-label)] px-3.5 bg-[var(--surface)] border-[var(--border-subtle)] rounded-[14px] text-[var(--brand-900)] placeholder:text-[var(--brand-700)]/60 shadow-none"
          />
        </div>

        <Button
          type="button"
          variant={activeFiltersCount > 0 ? "default" : "outline"}
          onClick={handleOpenFilterSheet}
          className={`relative size-11 rounded-[14px] flex items-center justify-center p-0 shrink-0 ${activeFiltersCount > 0
            ? "bg-[var(--brand-900)] text-white border-[var(--brand-900)]"
            : "bg-[var(--surface)] text-[var(--brand-700)] border-[var(--border-subtle)] hover:bg-[var(--canvas)]"
            }`}
          aria-label="Abrir filtros"
          title="Filtros avançados"
        >
          <SlidersHorizontal className="size-4.5" />
          {activeFiltersCount > 0 && (
            <span className="absolute -top-1 -right-1 size-4 rounded-full bg-[var(--sage-400)] text-[var(--brand-900)] text-[length:var(--type-caption)] font-semibold flex items-center justify-center">
              {activeFiltersCount}
            </span>
          )}
        </Button>

        {activeFiltersCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="text-[length:var(--type-label)] text-[var(--brand-700)] hover:text-red-700 font-semibold px-2 py-1 flex items-center gap-1 shrink-0"
            title="Limpar todos os filtros"
          >
            <X data-icon="inline-start" className="size-3.5" />
            <span className="hidden sm:inline">Limpar</span>
          </Button>
        )}
      </div>

      {/* Bottom Sheet de Filtros Canônico */}
      <FilterSheet
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        title="Filtrar tarefas"
        onApply={handleApplyFilters}
        onClear={handleClearFilters}
      >
        <div className="space-y-3.5">
          <Field>
            <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-700)]">
              Origem
            </FieldLabel>
            <Select
              items={originFilterItems}
              value={tempOrigin}
              onValueChange={(val) => {
                if (val) setTempOrigin(val);
              }}
            >
              <SelectTrigger className="w-full h-11 bg-[var(--canvas)] border-[var(--border-subtle)] rounded-[14px] px-3 text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                <SelectValue placeholder="Todas as origens" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {originFilterItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-700)]">
              Status
            </FieldLabel>
            <Select
              items={statusFilterItems}
              value={tempStatus}
              onValueChange={(val) => {
                if (val) setTempStatus(val);
              }}
            >
              <SelectTrigger className="w-full h-11 bg-[var(--canvas)] border-[var(--border-subtle)] rounded-[14px] px-3 text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {statusFilterItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-700)]">
              Prioridade
            </FieldLabel>
            <Select
              items={priorityFilterItems}
              value={tempPriority}
              onValueChange={(val) => {
                if (val) setTempPriority(val);
              }}
            >
              <SelectTrigger className="w-full h-11 bg-[var(--canvas)] border-[var(--border-subtle)] rounded-[14px] px-3 text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                <SelectValue placeholder="Todas as prioridades" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {priorityFilterItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-700)]">
              Unidade
            </FieldLabel>
            <Select
              items={locationFilterItems}
              value={tempLocation}
              onValueChange={(val) => {
                if (val) setTempLocation(val);
              }}
            >
              <SelectTrigger className="w-full h-11 bg-[var(--canvas)] border-[var(--border-subtle)] rounded-[14px] px-3 text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                <SelectValue placeholder="Todas as unidades" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {locationFilterItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-700)]">
              Equipe
            </FieldLabel>
            <Select
              items={teamFilterItems}
              value={tempTeam}
              onValueChange={(val) => {
                if (val) setTempTeam(val);
              }}
            >
              <SelectTrigger className="w-full h-11 bg-[var(--canvas)] border-[var(--border-subtle)] rounded-[14px] px-3 text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                <SelectValue placeholder="Todas as equipes" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {teamFilterItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </FilterSheet>

      {/* Visualização: TABELA (Desktop) & CARDS (Mobile) */}
      {viewMode === "table" && (
        <>
          {filteredTasks.length === 0 ? (
            <EmptyState
              title="Nenhuma tarefa encontrada"
              description="Ajuste os filtros ou o termo de busca para visualizar tarefas."
              icon={CheckCircle2}
            />
          ) : (
            <>
              {/* Lista Vertical Compacta Mobile (< 768px) */}
              <div className="flex md:hidden flex-col gap-3">
                {filteredTasks.map((task) => (
                  <Link
                    key={task.id}
                    href={`/management/tasks/${task.id}`}
                    className="block"
                  >
                    <Card className="bg-[var(--surface)] border-[var(--border-subtle)] rounded-[20px] p-4 shadow-none flex items-center justify-between gap-3 active:scale-[0.99] transition-all hover:border-[var(--brand-700)]">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <StatusBadge status={task.status} size="sm" />
                          <PriorityBadge priority={task.priority} size="sm" />
                          {task.slaExceeded && (
                            <Badge
                              variant="destructive"
                              className="text-[length:var(--type-caption)] font-semibold text-red-700 bg-red-50 border-red-200 px-1.5 py-0.2 rounded-md"
                            >
                              SLA
                            </Badge>
                          )}
                        </div>

                        <h3 className="text-[var(--text-primary)] line-clamp-2 text-[length:var(--type-card-title)] font-bold">
                          {task.title}
                        </h3>

                        <div className="flex items-center gap-3 text-[length:var(--type-caption)] text-[var(--text-secondary)] mt-1.5">
                          <span>{task.locationName || "Sem unidade"}</span>
                          <span>•</span>
                          <span>
                            {task.primaryAssignee || "Sem responsável"}
                          </span>
                        </div>
                      </div>

                      <ChevronRight className="size-5 text-muted-foreground shrink-0" />
                    </Card>
                  </Link>
                ))}
              </div>

              {/* Tabela Desktop (>= 768px) */}
              <Card className="hidden md:block bg-[var(--surface)] rounded-[18px] overflow-hidden shadow-none border-[var(--border-subtle)]">
                <Table className="w-full text-left text-[length:var(--type-label)]">
                  <TableHeader className="bg-[var(--canvas)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)] uppercase text-[length:var(--type-caption)] tracking-wider font-semibold">
                    <TableRow>
                      <TableHead className="px-4 py-3">
                        Tarefa / Origem
                      </TableHead>
                      <TableHead className="px-3 py-3">Status</TableHead>
                      <TableHead className="px-3 py-3">
                        Prioridade / SLA
                      </TableHead>
                      <TableHead className="px-3 py-3">
                        Unidade / Equipe
                      </TableHead>
                      <TableHead className="px-3 py-3">Responsável</TableHead>
                      <TableHead className="px-4 py-3 text-right">
                        Ações
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-[var(--border-subtle)]">
                    {filteredTasks.map((task) => (
                      <TableRow
                        key={task.id}
                        className="hover:bg-[var(--canvas)]/60 transition-colors"
                      >
                        <TableCell className="px-4 py-3.5">
                          <Link
                            href={`/management/tasks/${task.id}`}
                            className="font-semibold text-(length:--type-body) text-brand-900 hover:underline block truncate max-w-xs"
                          >
                            {task.title}
                          </Link>
                          <span className="text-[length:var(--type-caption)] text-[var(--text-secondary)] uppercase font-semibold">
                            {task.origin === "PROCESS"
                              ? "Processo"
                              : "Tarefa avulsa"}
                          </span>
                        </TableCell>

                        <TableCell className="px-3 py-3.5 whitespace-nowrap">
                          <StatusBadge status={task.status} size="sm" />
                        </TableCell>

                        <TableCell className="px-3 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <PriorityBadge priority={task.priority} size="sm" />
                            {task.slaExceeded && (
                              <Badge
                                variant="destructive"
                                className="flex items-center gap-1 text-red-700 bg-red-50 border-red-200 rounded-[6px]!"
                              >
                                <AlertTriangle
                                  data-icon="inline-start"
                                  className="size-3"
                                />{" "}
                                SLA
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="px-3 py-3.5 whitespace-nowrap text-[length:var(--type-caption)] text-[var(--text-secondary)]">
                          <div>{task.locationName || "Sem unidade"}</div>
                          <div className="text-[length:var(--type-caption)] text-[var(--brand-700)] font-medium">
                            {task.teamName || "Sem equipe"}
                          </div>
                        </TableCell>

                        <TableCell className="px-3 py-3.5 whitespace-nowrap text-[length:var(--type-caption)] font-medium text-[var(--brand-900)]">
                          {task.primaryAssignee || (
                            <span className="text-amber-800 font-semibold">
                              Sem responsável
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="px-4 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <Button nativeButton={false}
                              variant="ghost"
                              size="icon"
                              render={
                                <Link href={`/management/tasks/${task.id}`} />
                              }
                              className="size-8 text-[var(--brand-900)]"
                              title="Ver detalhes"
                            >
                              <Eye className="size-4" />
                            </Button>
                            {userRole !== "EMPLOYEE" && (
                              <>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setTaskToCancel(task.id)}
                                  className="size-8 text-amber-800 hover:bg-red-100"
                                  title="Cancelar tarefa"
                                >
                                  <X className="size-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setTaskToTrash(task.id)}
                                  className="size-8 text-red-700 hover:bg-red-100"
                                  title="Mover para a lixeira"
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </>
      )}

      {viewMode === "kanban" && (
        <div className="kanban-board">
          {kanbanColumns.map((col) => {
            const columnTasks = filteredTasks.filter((t) =>
              col.statuses.includes(t.status),
            );

            return (
              <Card
                key={col.id}
                className={`bg-surface border-(--border-subtle) rounded-[20px] p-3 shadow-none border-t-4 ${col.color} flex flex-col`}
              >
                <div className="flex items-center justify-between mb-3 px-1">
                  <h4 className="text-brand-900 text-(length:--type-card-title) font-bold">
                    {col.title}
                  </h4>
                  <Badge
                    variant="outline"
                    className="text-(length:--type-caption) font-semibold px-2 py-0.5 bg-canvas rounded-full text-(--text-secondary) border-(--border-subtle)"
                  >
                    {columnTasks.length}
                  </Badge>
                </div>

                <div className="flex flex-col gap-2.5 flex-1 min-h-50">
                  {columnTasks.map((task) => (
                    <Card
                      key={task.id}
                      className="p-3 rounded-[14px] bg-canvas border-(--border-subtle) hover:border-brand-700 transition-all shadow-none flex flex-col justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-(length:--type-caption) uppercase font-semibold text-(--text-secondary)">
                            {task.origin === "PROCESS"
                              ? "Processo"
                              : "Tarefa avulsa"}
                          </span>
                          <PriorityBadge priority={task.priority} size="sm" />
                        </div>
                        <Link
                          href={`/management/tasks/${task.id}`}
                          className="text-(length:--type-label) font-semibold text-brand-900 hover:underline block leading-tight mb-1"
                        >
                          {task.title}
                        </Link>
                      </div>

                      <div className="pt-2 border-t border-(--border-subtle) flex items-center justify-between gap-1.5 text-(length:--type-caption) text-(--text-secondary)">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="flex items-center gap-1 font-medium truncate max-w-24"
                            title={task.primaryAssignee || "Sem responsável"}
                          >
                            <User className="size-3 text-brand-700 shrink-0" />
                            <span className="truncate">
                              {task.primaryAssignee || "Sem responsável"}
                            </span>
                          </div>
                          {task.deadlineAt && (
                            <div className="flex items-center gap-1 font-semibold text-[var(--brand-900)] shrink-0">
                              <Clock className="size-3 text-[var(--brand-700)]" />
                              <span>
                                {new Date(task.deadlineAt).toLocaleTimeString(
                                  "pt-BR",
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button
                            nativeButton={false}
                            variant="ghost"
                            size="icon"
                            render={
                              <Link href={`/management/tasks/${task.id}`} />
                            }
                            className="size-7 text-[var(--brand-900)] hover:bg-[var(--surface)]"
                            title="Ver detalhes"
                          >
                            <Eye className="size-3.5" />
                          </Button>
                          {userRole !== "EMPLOYEE" && (
                            <>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTaskToCancel(task.id);
                                }}
                                className="size-7 text-amber-800 hover:bg-red-100 hover:text-amber-900"
                                title="Cancelar tarefa"
                              >
                                <X className="size-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTaskToTrash(task.id);
                                }}
                                className="size-7 text-red-700 hover:bg-red-100 hover:text-red-800"
                                title="Mover para a lixeira"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* DIALOG: CANCELAR TAREFA */}
      <Dialog
        open={taskToCancel !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTaskToCancel(null);
            setCancelReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar tarefa</DialogTitle>
            <DialogDescription>
              Explique por que a tarefa será cancelada.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                Motivo do cancelamento *
              </FieldLabel>
              <Textarea
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Informe o motivo do cancelamento"
                className="text-[length:var(--type-label)] resize-none"
              />
            </Field>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setTaskToCancel(null);
                setCancelReason("");
              }}
            >
              Voltar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmCancel}
              disabled={actionLoading !== null || !cancelReason.trim()}
            >
              {actionLoading ? <Spinner data-icon="inline-start" /> : null}
              <span>Cancelar tarefa</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ALERT DIALOG: MOVER PARA LIXEIRA */}
      <AlertDialog
        open={taskToTrash !== null}
        onOpenChange={(open) => {
          if (!open) setTaskToTrash(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover tarefa para a lixeira?</AlertDialogTitle>
            <AlertDialogDescription>
              A tarefa sairá da lista de atividades. Você poderá restaurá-la na
              lixeira.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTaskToTrash(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmTrash}
              disabled={actionLoading !== null}
            >
              {actionLoading ? <Spinner data-icon="inline-start" /> : null}
              <span>Mover para a lixeira</span>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
