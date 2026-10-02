"use client";

import { Modal } from "../shared/modal";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin,
  Plus,
  Clock,
  CheckSquare,
  Users,
  Building2,
  Pencil,
} from "lucide-react";
import { saveLocationAction } from "@/presentation/actions/org-management-actions";

import { PageHeader, EmptyState } from "@/presentation/components/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/toast";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import {
  SelectGroup,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const DAYS_OF_WEEK = [
  { value: "MON", label: "Seg", full: "Segunda" },
  { value: "TUE", label: "Ter", full: "Terça" },
  { value: "WED", label: "Qua", full: "Quarta" },
  { value: "THU", label: "Qui", full: "Quinta" },
  { value: "FRI", label: "Sex", full: "Sexta" },
  { value: "SAT", label: "Sáb", full: "Sábado" },
  { value: "SUN", label: "Dom", full: "Domingo" },
];

const dayLabels: Record<string, string> = {
  MON: "Seg",
  TUE: "Ter",
  WED: "Qua",
  THU: "Qui",
  FRI: "Sex",
  SAT: "Sáb",
  SUN: "Dom",
};

interface LocationItem {
  id: string;
  name: string;
  address: string | null;
  timezone: string;
  openingTime: string | null;
  closingTime: string | null;
  operatingDays: string | null;
  membersCount: number;
  tasksCount: number;
  teams?: Array<{ id: string; name: string }>;
}

interface LocationsClientProps {
  locations: LocationItem[];
  teams?: Array<{ id: string; name: string }>;
  userRole: string;
}

export function LocationsClient({
  locations,
  teams = [],
  userRole,
}: LocationsClientProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<LocationItem | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedTimezone, setSelectedTimezone] = useState("America/Sao_Paulo");
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>([
    "MON",
    "TUE",
    "WED",
    "THU",
    "FRI",
    "SAT",
  ]);

  function openCreateModal() {
    setEditing(null);
    setSelectedTimezone("America/Sao_Paulo");
    setSelectedTeamIds([]);
    setSelectedDays(["MON", "TUE", "WED", "THU", "FRI", "SAT"]);
    setShowModal(true);
  }

  function openEditModal(loc: LocationItem) {
    setEditing(loc);
    setSelectedTimezone(loc.timezone || "America/Sao_Paulo");
    setSelectedTeamIds(loc.teams?.map((t) => t.id) ?? []);
    setSelectedDays(
      loc.operatingDays
        ? loc.operatingDays.split(",").map((s) => s.trim()).filter(Boolean)
        : ["MON", "TUE", "WED", "THU", "FRI", "SAT"]
    );
    setShowModal(true);
  }

  function setBusinessDays() {
    setSelectedDays(["MON", "TUE", "WED", "THU", "FRI"]);
  }

  function setAllDays() {
    setSelectedDays(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
  }

  function clearDays() {
    setSelectedDays([]);
  }

  function selectAllTeams() {
    setSelectedTeamIds(teams.map((t) => t.id));
  }

  function clearTeams() {
    setSelectedTeamIds([]);
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selectedDays.length === 0) {
      toast.add({
        title: "Dados incompletos",
        description: "Selecione pelo menos um dia de funcionamento.",
        type: "warning",
      });
      return;
    }
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    formData.set("operatingDays", selectedDays.join(","));
    if (!formData.get("timezone") && selectedTimezone) {
      formData.set("timezone", selectedTimezone);
    }
    formData.set("teamIds", selectedTeamIds.join(","));
    try {
      const res = await saveLocationAction(formData);
      if (res.error) {
        toast.add({
          title: "Erro ao salvar unidade",
          description: res.error,
          type: "error",
        });
      } else {
        toast.add({
          title: editing ? "Unidade atualizada" : "Unidade criada",
          description: editing
            ? "Os dados da unidade foram atualizados com sucesso."
            : "A nova unidade foi cadastrada com sucesso.",
          type: "success",
        });
        setShowModal(false);
        router.refresh();
      }
    } catch {
      toast.add({
        title: "Erro ao salvar",
        description: "Erro ao salvar unidade.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Unidades"
        subtitle="Organize os locais de trabalho e seus horários."
        actions={
          ["OWNER", "ADMIN"].includes(userRole) ? (
            <Button
              type="button"
              onClick={openCreateModal}
              className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-secondary)] shadow-none"
            >
              <Plus className="size-4" data-icon="inline-start" />
              <span>Criar unidade</span>
            </Button>
          ) : undefined
        }
      />

      {locations.length === 0 && (
        <EmptyState
          title="Nenhuma unidade cadastrada"
          description="Adicione o primeiro registro para organizar sua operação."
          icon={Building2}
          action={
            ["OWNER", "ADMIN"].includes(userRole) ? (
              <Button
                onClick={openCreateModal}
                className="bg-(--brand-primary) text-white hover:bg-(--brand-secondary)"
              >
                <Plus className="size-4 mr-1.5" />
                Criar primeira unidade
              </Button>
            ) : undefined
          }
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {locations.map((loc) => (
          <Card
            key={loc.id}
            id={`location-${loc.id}`}
            className="p-5 flex flex-col justify-between gap-3 rounded-xl border border-border/70 bg-card hover:border-border hover:shadow-xs transition-all"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <Badge
                  variant="secondary"
                  className="bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] border-[var(--brand-primary)]/20 font-medium text-xs"
                >
                  {loc.membersCount} colaboradores
                </Badge>
                <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                  <CheckSquare className="size-3.5 text-[var(--brand-700)]" />
                  <span>{loc.tasksCount} tarefas ativas</span>
                </span>
              </div>

              <h3 className="text-foreground text-[length:var(--type-card-title)] font-bold">
                {loc.name}
              </h3>
              {loc.address ? (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                  <MapPin className="size-3.5 shrink-0 text-muted-foreground/70" />
                  <span className="truncate">{loc.address}</span>
                </p>
              ) : (
                <p className="text-xs italic text-muted-foreground/60 mt-1">
                  Endereço não informado
                </p>
              )}
            </div>

            <div className="pt-3 border-t border-border/50 flex flex-col gap-1.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <Clock className="size-3.5 text-[var(--brand-700)] shrink-0" />
                <span>
                  {loc.openingTime || "08:00"} às {loc.closingTime || "20:00"} ({loc.timezone})
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Dias: {loc.operatingDays ? loc.operatingDays.split(",").map((day) => dayLabels[day] ?? day).join(", ") : "Não informado"}
              </div>
              {loc.teams && loc.teams.length > 0 && (
                <div className="text-[11px] flex items-center gap-1 text-[var(--brand-700)] font-medium pt-0.5">
                  <Users className="size-3 shrink-0" />
                  <span className="truncate">Equipes: {loc.teams.map((t) => t.name).join(", ")}</span>
                </div>
              )}
            </div>

            {["OWNER", "ADMIN"].includes(userRole) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => openEditModal(loc)}
                className="mt-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-foreground hover:bg-muted"
              >
                <Pencil className="size-3.5 text-muted-foreground" />
                <span>Editar unidade</span>
              </Button>
            )}
          </Card>
        ))}
      </div>

      {showModal && (
        <Modal
          open
          title={editing ? "Editar unidade" : "Criar unidade"}
          onClose={() => {
            if (!loading) setShowModal(false);
          }}
          className="sm:max-w-xl max-h-[90vh] overflow-y-auto"
        >
          <p className="text-xs text-muted-foreground mb-4">
            Informe os dados cadastrais, horários de funcionamento e equipes vinculadas a esta unidade.
          </p>

          <form onSubmit={handleCreate} className="flex flex-col gap-3.5">
            <input type="hidden" name="locationId" value={editing?.id ?? ""} />
            <input type="hidden" name="timezone" value={selectedTimezone} />

            <Field>
              <FieldLabel className="text-xs font-semibold text-foreground">
                Nome da unidade *
              </FieldLabel>
              <Input
                aria-label="Nome da unidade"
                type="text"
                name="name"
                defaultValue={editing?.name ?? ""}
                maxLength={200}
                required
                placeholder="Ex.: Loja 03 - Barra Shopping"
                className="bg-[var(--canvas)] border-border/60 text-sm h-10"
              />
            </Field>

            <Field>
              <FieldLabel className="text-xs font-semibold text-foreground">
                Endereço
              </FieldLabel>
              <Input
                aria-label="Endereço"
                type="text"
                name="address"
                defaultValue={editing?.address ?? ""}
                maxLength={500}
                placeholder="Av. das Américas, 4666 - Rio de Janeiro/RJ"
                className="bg-[var(--canvas)] border-border/60 text-sm h-10"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel className="text-xs font-semibold text-foreground">
                  Abertura
                </FieldLabel>
                <Input
                  aria-label="Abertura"
                  type="time"
                  name="openingTime"
                  defaultValue={editing?.openingTime ?? "08:00"}
                  className="bg-[var(--canvas)] border-border/60 text-sm h-10"
                />
              </Field>

              <Field>
                <FieldLabel className="text-xs font-semibold text-foreground">
                  Fechamento
                </FieldLabel>
                <Input
                  aria-label="Fechamento"
                  type="time"
                  name="closingTime"
                  defaultValue={editing?.closingTime ?? "22:00"}
                  className="bg-[var(--canvas)] border-border/60 text-sm h-10"
                />
              </Field>
            </div>

            <Field>
              <FieldLabel className="text-xs font-semibold text-foreground">
                Fuso horário
              </FieldLabel>
              <Select
                items={[
                  { value: "America/Sao_Paulo", label: "Brasília (São Paulo)" },
                  { value: "America/Manaus", label: "Manaus" },
                  { value: "America/Cuiaba", label: "Cuiabá" },
                  { value: "America/Belem", label: "Belém" },
                ]}
                name="timezone"
                value={selectedTimezone}
                onValueChange={(val) =>
                  setSelectedTimezone((val as string) ?? "America/Sao_Paulo")
                }
              >
                <SelectTrigger
                  aria-label="Fuso horário"
                  className="bg-[var(--canvas)] border-border/60 text-xs h-10 w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="America/Sao_Paulo">
                      Brasília (São Paulo)
                    </SelectItem>
                    <SelectItem value="America/Manaus">Manaus</SelectItem>
                    <SelectItem value="America/Cuiaba">Cuiabá</SelectItem>
                    <SelectItem value="America/Belem">Belém</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            {/* Dias de funcionamento com Checkbox shadcn/ui */}
            <Field>
              <div className="flex items-center justify-between mb-1.5">
                <FieldLabel className="text-xs font-semibold text-foreground">
                  Dias de funcionamento * ({selectedDays.length} selecionados)
                </FieldLabel>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={setBusinessDays}
                    className="text-[var(--brand-primary)] hover:underline font-medium cursor-pointer"
                  >
                    Seg a Sex
                  </button>
                  <span className="text-muted-foreground">•</span>
                  <button
                    type="button"
                    onClick={setAllDays}
                    className="text-[var(--brand-primary)] hover:underline font-medium cursor-pointer"
                  >
                    Todos
                  </button>
                  <span className="text-muted-foreground">•</span>
                  <button
                    type="button"
                    onClick={clearDays}
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    Limpar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DAYS_OF_WEEK.map((day) => {
                  const isChecked = selectedDays.includes(day.value);
                  return (
                    <label
                      key={day.value}
                      htmlFor={`day-${day.value}`}
                      className={cn(
                        "flex items-center gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-colors select-none",
                        isChecked
                          ? "bg-[var(--brand-primary)]/5 border-[var(--brand-primary)]/40 text-foreground font-medium"
                          : "border-border/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      )}
                    >
                      <Checkbox
                        id={`day-${day.value}`}
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedDays((prev) => [...prev, day.value]);
                          } else {
                            setSelectedDays((prev) =>
                              prev.filter((d) => d !== day.value)
                            );
                          }
                        }}
                      />
                      <span className="font-medium text-foreground">{day.full}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {day.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </Field>

            {/* Equipes vinculadas com Checkbox shadcn/ui */}
            {teams.length > 0 && (
              <Field>
                <div className="flex items-center justify-between mb-1.5">
                  <FieldLabel className="text-xs font-semibold text-foreground">
                    Equipes vinculadas ({selectedTeamIds.length} selecionadas)
                  </FieldLabel>
                  {teams.length > 2 && (
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={selectAllTeams}
                        className="text-[var(--brand-primary)] hover:underline font-medium cursor-pointer"
                      >
                        Todas
                      </button>
                      <span className="text-muted-foreground">•</span>
                      <button
                        type="button"
                        onClick={clearTeams}
                        className="text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        Limpar
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2.5 border border-border/60 rounded-xl max-h-44 overflow-y-auto bg-card">
                  {teams.map((t) => {
                    const checked = selectedTeamIds.includes(t.id);
                    return (
                      <label
                        key={t.id}
                        htmlFor={`team-${t.id}`}
                        className={cn(
                          "flex items-center gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-colors select-none",
                          checked
                            ? "bg-[var(--brand-primary)]/5 border-[var(--brand-primary)]/40 text-foreground font-medium"
                            : "border-border/40 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                        )}
                      >
                        <Checkbox
                          id={`team-${t.id}`}
                          checked={checked}
                          onCheckedChange={(isChecked) => {
                            if (isChecked) {
                              setSelectedTeamIds((prev) => [...prev, t.id]);
                            } else {
                              setSelectedTeamIds((prev) =>
                                prev.filter((id) => id !== t.id)
                              );
                            }
                          }}
                        />
                        <Users className="size-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate flex-1 font-medium">{t.name}</span>
                      </label>
                    );
                  })}
                </div>
              </Field>
            )}

            <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-border/60">
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => setShowModal(false)}
                className="text-xs h-9"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-secondary)] text-xs h-9 shadow-none"
              >
                {loading && (
                  <Spinner className="size-3.5 mr-1.5" />
                )}
                <span>{editing ? "Salvar alterações" : "Criar unidade"}</span>
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
