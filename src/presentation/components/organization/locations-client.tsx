"use client";

import { Modal } from "../shared/modal";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Plus, Clock, CheckSquare, AlertCircle, Users } from "lucide-react";
import { saveLocationAction } from "@/presentation/actions/org-management-actions";

import { PageHeader, EmptyState } from "@/presentation/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import {SelectGroup,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const dayLabels: Record<string, string> = { MON: "Seg", TUE: "Ter", WED: "Qua", THU: "Qui", FRI: "Sex", SAT: "Sáb", SUN: "Dom" };

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

export function LocationsClient({ locations, teams = [], userRole }: LocationsClientProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<LocationItem | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedTimezone, setSelectedTimezone] = useState("America/Sao_Paulo");
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    const formData = new FormData(e.currentTarget);
    formData.set("operatingDays", formData.getAll("operatingDay").join(","));
    if (!formData.get("timezone") && selectedTimezone) {
      formData.set("timezone", selectedTimezone);
    }
    formData.set("teamIds", selectedTeamIds.join(","));
    try {
      const res = await saveLocationAction(formData);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setShowModal(false);
        router.refresh();
      }
    } catch {
      setErrorMsg("Erro ao salvar unidade.");
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
              onClick={() => { setEditing(null); setSelectedTimezone("America/Sao_Paulo"); setSelectedTeamIds([]); setErrorMsg(null); setShowModal(true); }}
              className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-secondary)] shadow-none"
            >
              <Plus className="size-4" data-icon="inline-start" />
              <span>Criar unidade</span>
            </Button>
          ) : undefined
        }
      />

      {errorMsg && (
        <Alert variant="destructive">
          <AlertCircle className="size-4 shrink-0" />
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}

      {locations.length === 0 && (
        <EmptyState
          title="Nenhuma unidade cadastrada"
          description="Adicione o primeiro registro para organizar sua operação."
        />
      )}
      <div className="module-grid">
        {locations.map((loc) => (
          <Card
            key={loc.id}
            id={`location-${loc.id}`}
            className="p-5 flex flex-col justify-between gap-3 hover:border-[var(--brand-700)] transition-all"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Badge
                  variant="secondary"
                  className="bg-[var(--sage-400)]/30 text-[var(--brand-900)]"
                >
                  {loc.membersCount} colaboradores
                </Badge>
                <span className="text-[length:var(--type-label)] text-[var(--text-secondary)] flex items-center gap-1 font-medium">
                  <CheckSquare className="size-3.5 text-[var(--brand-700)]" />
                  <span>{loc.tasksCount} tarefas ativas</span>
                </span>
              </div>

              <h3 className="text-[var(--text-primary)] text-[length:var(--type-card-title)] font-bold">
                {loc.name}
              </h3>
              {loc.address && (
                <p className="text-[length:var(--type-label)] text-[var(--text-secondary)] mt-0.5 flex items-center gap-1">
                  <MapPin className="size-3 shrink-0" />
                  <span>{loc.address}</span>
                </p>
              )}
            </div>

            <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-col gap-1 text-[length:var(--type-label)] text-[var(--text-secondary)]">
              <div className="flex items-center gap-1.5 font-medium text-[var(--brand-900)]">
                <Clock className="size-3.5 text-[var(--brand-700)] shrink-0" />
                <span>
                  Horário: {loc.openingTime || "08:00"} às{" "}
                  {loc.closingTime || "20:00"} ({loc.timezone})
                </span>
              </div>
              <div className="text-[length:var(--type-caption)] text-[var(--text-secondary)]">
                Dias de funcionamento: {loc.operatingDays ? loc.operatingDays.split(",").map(day => dayLabels[day] ?? day).join(", ") : "Não informado"}
              </div>
              {loc.teams && loc.teams.length > 0 && (
                <div className="text-[length:var(--type-caption)] flex items-center gap-1 text-[var(--brand-700)]">
                  <Users className="size-3 shrink-0" />
                  <span className="truncate">Equipes: {loc.teams.map(t => t.name).join(", ")}</span>
                </div>
              )}
            </div>
            {["OWNER", "ADMIN"].includes(userRole) && <Button variant="outline" onClick={() => { setEditing(loc); setSelectedTimezone(loc.timezone); setSelectedTeamIds(loc.teams?.map(t => t.id) ?? []); setErrorMsg(null); setShowModal(true); }}>Editar unidade</Button>}
          </Card>
        ))}
      </div>

      {/* Modal Nova Unidade */}
      {showModal && (
        <Modal open title={editing ? "Editar unidade" : "Criar unidade"} onClose={() => { if (!loading) setShowModal(false); }}>
          {errorMsg && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="size-4 shrink-0" />
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}
          <p className="text-[length:var(--type-label)] text-[var(--text-secondary)] mb-4">
            Informe o nome, o endereço e os horários da unidade.
          </p>

          <form onSubmit={handleCreate} className="flex flex-col gap-3">
            <input type="hidden" name="locationId" value={editing?.id ?? ""} />
            <input type="hidden" name="timezone" value={selectedTimezone} />

            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
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
                className="bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] h-10"
              />
            </Field>

            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                Endereço
              </FieldLabel>
              <Input
                aria-label="Endereço"
                type="text"
                name="address"
                defaultValue={editing?.address ?? ""}
                maxLength={500}
                placeholder="Av. das Américas, 4666 - Rio de Janeiro/RJ"
                className="bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] h-10"
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field>
                <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                  Abertura
                </FieldLabel>
                <Input
                  aria-label="Abertura"
                  type="time"
                  name="openingTime"
                  defaultValue={editing?.openingTime ?? "08:00"}
                  className="bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] h-10"
                />
              </Field>

              <Field>
                <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                  Fechamento
                </FieldLabel>
                <Input
                  aria-label="Fechamento"
                  type="time"
                  name="closingTime"
                  defaultValue={editing?.closingTime ?? "22:00"}
                  className="bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] h-10"
                />
              </Field>
            </div>

            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
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
                  className="bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] h-10 w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent><SelectGroup>
                  <SelectItem value="America/Sao_Paulo">
                    Brasília (São Paulo)
                  </SelectItem>
                  <SelectItem value="America/Manaus">Manaus</SelectItem>
                  <SelectItem value="America/Cuiaba">Cuiabá</SelectItem>
                  <SelectItem value="America/Belem">Belém</SelectItem>
                </SelectGroup></SelectContent>
              </Select>
            </Field>

            <Field><FieldLabel htmlFor="operating-days">Dias de funcionamento</FieldLabel><div id="operating-days" className="flex flex-wrap gap-3">{Object.entries({ MON: "Seg", TUE: "Ter", WED: "Qua", THU: "Qui", FRI: "Sex", SAT: "Sáb", SUN: "Dom" }).map(([value, label]) => <label className="flex items-center gap-2 min-h-11" key={value}><input type="checkbox" name="operatingDay" value={value} defaultChecked={(editing?.operatingDays ?? "MON,TUE,WED,THU,FRI,SAT").split(",").includes(value)} />{label}</label>)}</div></Field>

            {teams.length > 0 && (
              <Field>
                <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                  Equipes vinculadas
                </FieldLabel>
                <div className="grid grid-cols-2 gap-2 p-2.5 border border-[var(--border-subtle)] rounded-xl max-h-36 overflow-y-auto bg-[var(--canvas)]">
                  {teams.map((t) => {
                    const checked = selectedTeamIds.includes(t.id);
                    return (
                      <label key={t.id} className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer py-1">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTeamIds([...selectedTeamIds, t.id]);
                            } else {
                              setSelectedTeamIds(selectedTeamIds.filter(id => id !== t.id));
                            }
                          }}
                          className="rounded text-[var(--brand-700)] focus:ring-[var(--brand-700)] size-3.5"
                        />
                        <span className="truncate">{t.name}</span>
                      </label>
                    );
                  })}
                </div>
              </Field>
            )}
            <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)]">
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => setShowModal(false)}
                className="text-[length:var(--type-label)]"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-[var(--brand-900)] text-white text-[length:var(--type-label)] hover:bg-[var(--brand-700)] shadow-none"
              >
                {loading && (
                  <Spinner className="size-3.5" data-icon="inline-start" />
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
