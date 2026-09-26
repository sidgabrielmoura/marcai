"use client";

import { Modal } from "../shared/modal";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, User, CheckSquare, AlertCircle, MapPin } from "lucide-react";
import { saveTeamAction } from "@/presentation/actions/org-management-actions";

import { PageHeader, EmptyState } from "@/presentation/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

interface TeamItem {
  id: string;
  name: string;
  description: string | null;
  managerName: string | null;
  managerMemberId: string | null;
  membersCount: number;
  activeTasksCount: number;
  members: string[];
  locations?: Array<{ id: string; name: string }>;
}

interface TeamsClientProps {
  teams: TeamItem[];
  managers: Array<{ id: string; name: string }>;
  locations?: Array<{ id: string; name: string }>;
  userRole: string;
}

export function TeamsClient({ teams, managers, locations = [], userRole }: TeamsClientProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<TeamItem | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedManagerId, setSelectedManagerId] = useState("");
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    const formData = new FormData(e.currentTarget);
    if (!formData.get("managerMemberId") && selectedManagerId) {
      formData.set("managerMemberId", selectedManagerId);
    }
    formData.set("locationIds", selectedLocationIds.join(","));
    try {
      const res = await saveTeamAction(formData);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setShowModal(false);
        router.refresh();
      }
    } catch {
      setErrorMsg("Erro ao criar equipe.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Equipes"
        subtitle="Organize as pessoas por turno, função ou responsável."
        actions={
          ["OWNER", "ADMIN"].includes(userRole) ? (
            <Button
              type="button"
              onClick={() => { setEditing(null); setSelectedManagerId(""); setSelectedLocationIds([]); setErrorMsg(null); setShowModal(true); }}
              className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-secondary)] shadow-none"
            >
              <Plus className="size-4" data-icon="inline-start" />
              <span>Criar equipe</span>
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

      {teams.length === 0 && (
        <EmptyState
          title="Nenhuma equipe cadastrada"
          description="Adicione o primeiro registro para organizar sua operação."
        />
      )}
      <div className="module-grid">
        {teams.map((team) => (
          <Card
            key={team.id}
            id={`team-${team.id}`}
            className="p-5 flex flex-col justify-between gap-3 hover:border-[var(--brand-700)] transition-all"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Badge
                  variant="secondary"
                  className="bg-[var(--sage-400)]/30 text-[var(--brand-900)]"
                >
                  {team.membersCount} integrantes
                </Badge>
                <span className="text-[length:var(--type-label)] text-[var(--text-secondary)] flex items-center gap-1 font-medium">
                  <CheckSquare className="size-3.5 text-[var(--brand-700)]" />
                  <span>{team.activeTasksCount} tarefas ativas</span>
                </span>
              </div>

              <h3 className="text-[var(--text-primary)] text-[length:var(--type-card-title)] font-bold">
                {team.name}
              </h3>
              {team.description && (
                <p className="text-[length:var(--type-label)] text-[var(--text-secondary)] mt-0.5">
                  {team.description}
                </p>
              )}
            </div>

            <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-col gap-1.5 text-[length:var(--type-label)] text-[var(--text-secondary)]">
              <div className="flex items-center gap-1.5">
                <User className="size-3.5 text-[var(--brand-700)] shrink-0" />
                <span>
                  Responsável:{" "}
                  <strong>{team.managerName || "Não atribuído"}</strong>
                </span>
              </div>
              {team.members.length > 0 && (
                <div className="text-[length:var(--type-caption)] truncate">
                  Integrantes: {team.members.join(", ")}
                </div>
              )}
              {team.locations && team.locations.length > 0 && (
                <div className="text-[length:var(--type-caption)] flex items-center gap-1 text-[var(--brand-700)]">
                  <MapPin className="size-3 shrink-0" />
                  <span className="truncate">Unidades: {team.locations.map(l => l.name).join(", ")}</span>
                </div>
              )}
            </div>
            {["OWNER", "ADMIN"].includes(userRole) && <Button variant="outline" onClick={() => { setEditing(team); setSelectedManagerId(team.managerMemberId ?? ""); setSelectedLocationIds(team.locations?.map(l => l.id) ?? []); setErrorMsg(null); setShowModal(true); }}>Editar equipe</Button>}
          </Card>
        ))}
      </div>

      {/* Modal Nova Equipe */}
      {showModal && (
        <Modal open title={editing ? "Editar equipe" : "Criar equipe"} onClose={() => setShowModal(false)}>
          {errorMsg && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="size-4 shrink-0" />
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}
          <p className="text-[length:var(--type-label)] text-[var(--text-secondary)] mb-4">
            Dê um nome à equipe e defina quem será responsável por ela.
          </p>

          <form onSubmit={handleCreate} className="flex flex-col gap-3">
            <input type="hidden" name="teamId" value={editing?.id ?? ""} />
            <input
              type="hidden"
              name="managerMemberId"
              value={selectedManagerId}
            />

            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                Nome da equipe *
              </FieldLabel>
              <Input
                aria-label="Nome da equipe"
                type="text"
                name="name"
                defaultValue={editing?.name ?? ""}
                maxLength={200}
                required
                placeholder="Ex.: Operação Noturna"
                className="bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] h-10"
              />
            </Field>

            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                Descrição
              </FieldLabel>
              <Textarea
                aria-label="Descrição"
                name="description"
                defaultValue={editing?.description ?? ""}
                maxLength={2000}
                rows={2}
                placeholder="Descreva as responsabilidades da equipe"
                className="bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] min-h-[60px]"
              />
            </Field>

            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                Gestor responsável
              </FieldLabel>
              <Select
                items={[
                  { value: "", label: "Selecione um gestor..." },
                  ...managers.map((m) => ({ value: m.id, label: m.name })),
                ]}
                name="managerMemberId"
                value={selectedManagerId}
                onValueChange={(val) =>
                  setSelectedManagerId((val as string) ?? "")
                }
              >
                <SelectTrigger
                  aria-label="Gestor responsável"
                  className="bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] h-10 w-full"
                >
                  <SelectValue placeholder="Selecione um gestor..." />
                </SelectTrigger>
                <SelectContent><SelectGroup>
                  <SelectItem value="">Selecione um gestor...</SelectItem>
                  {managers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectGroup></SelectContent>
              </Select>
            </Field>

            {locations.length > 0 && (
              <Field>
                <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                  Unidades vinculadas
                </FieldLabel>
                <div className="grid grid-cols-2 gap-2 p-2.5 border border-[var(--border-subtle)] rounded-xl max-h-36 overflow-y-auto bg-[var(--canvas)]">
                  {locations.map((loc) => {
                    const checked = selectedLocationIds.includes(loc.id);
                    return (
                      <label key={loc.id} className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer py-1">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedLocationIds([...selectedLocationIds, loc.id]);
                            } else {
                              setSelectedLocationIds(selectedLocationIds.filter(id => id !== loc.id));
                            }
                          }}
                          className="rounded text-[var(--brand-700)] focus:ring-[var(--brand-700)] size-3.5"
                        />
                        <span className="truncate">{loc.name}</span>
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
                <span>{editing ? "Salvar alterações" : "Criar equipe"}</span>
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
