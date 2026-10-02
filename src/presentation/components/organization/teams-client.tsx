"use client";

import { Modal } from "../shared/modal";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  User,
  Users,
  UserPlus,
  UserMinus,
  CheckSquare,
  MapPin,
  Search,
  X,
  Pencil,
  MoreVertical,
  Building2,
} from "lucide-react";
import {
  saveTeamAction,
  updateTeamMembersAction,
  updateTeamLocationsAction,
} from "@/presentation/actions/org-management-actions";

import { PageHeader, EmptyState } from "@/presentation/components/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  SelectGroup,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface TeamMemberInfo {
  id: string;
  name: string;
  email: string | null;
  role: string;
  isPrimary?: boolean;
}

export interface OrgMemberOption {
  id: string;
  name: string;
  email: string | null;
  role: string;
}

export interface TeamItem {
  id: string;
  name: string;
  description: string | null;
  managerName: string | null;
  managerMemberId: string | null;
  membersCount: number;
  activeTasksCount: number;
  members: TeamMemberInfo[];
  locations?: Array<{ id: string; name: string }>;
}

export interface TeamsClientProps {
  teams: TeamItem[];
  managers: Array<{ id: string; name: string }>;
  locations?: Array<{ id: string; name: string }>;
  allMembers?: OrgMemberOption[];
  userRole: string;
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Proprietário",
  ADMIN: "Administrador",
  MANAGER: "Gestor",
  EMPLOYEE: "Colaborador",
};

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function TeamsClient({
  teams,
  managers,
  locations = [],
  allMembers = [],
  userRole,
}: TeamsClientProps) {
  const router = useRouter();

  // Estados de criação/edição básica da equipe (sem funcionários nem unidades misturadas)
  const [editing, setEditing] = useState<TeamItem | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedManagerId, setSelectedManagerId] = useState("");

  // Estado para o modal isolado de administração de funcionários
  const [managingMembersTeam, setManagingMembersTeam] = useState<TeamItem | null>(null);
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>([]);
  const [addMemberSelectedId, setAddMemberSelectedId] = useState("");
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [savingMembers, setSavingMembers] = useState(false);

  // Estado para o modal isolado de administração de unidades
  const [managingLocationsTeam, setManagingLocationsTeam] = useState<TeamItem | null>(null);
  const [teamLocationIds, setTeamLocationIds] = useState<string[]>([]);
  const [locationSearchQuery, setLocationSearchQuery] = useState("");
  const [savingLocations, setSavingLocations] = useState(false);

  // Busca e filtro da lista de equipes
  const [teamSearchQuery, setTeamSearchQuery] = useState("");

  const filteredTeams = useMemo(() => {
    if (!teamSearchQuery.trim()) return teams;
    const q = teamSearchQuery.toLowerCase().trim();
    return teams.filter((t) => {
      const matchName = t.name.toLowerCase().includes(q);
      const matchDesc = t.description?.toLowerCase().includes(q) ?? false;
      const matchManager = t.managerName?.toLowerCase().includes(q) ?? false;
      const matchLoc = t.locations?.some((l) => l.name.toLowerCase().includes(q)) ?? false;
      const matchMember = t.members.some((m) => m.name.toLowerCase().includes(q));
      return matchName || matchDesc || matchManager || matchLoc || matchMember;
    });
  }, [teams, teamSearchQuery]);

  const canManage = ["OWNER", "ADMIN", "MANAGER"].includes(userRole);

  // Abrir modal de criação/edição básica de equipe
  function openCreateEditModal(team?: TeamItem) {
    if (team) {
      setEditing(team);
      setSelectedManagerId(team.managerMemberId ?? "");
    } else {
      setEditing(null);
      setSelectedManagerId("");
    }
    setShowModal(true);
  }

  // Abrir modal isolado de funcionários
  function openManageMembersModal(team: TeamItem) {
    setManagingMembersTeam(team);
    setTeamMemberIds(team.members.map((m) => m.id));
    setAddMemberSelectedId("");
    setMemberSearchQuery("");
  }

  // Abrir modal isolado de unidades
  function openManageLocationsModal(team: TeamItem) {
    setManagingLocationsTeam(team);
    setTeamLocationIds(team.locations?.map((l) => l.id) ?? []);
    setLocationSearchQuery("");
  }

  // Salvar criação ou edição de equipe (dados básicos)
  async function handleCreateOrEditTeam(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    if (!formData.get("managerMemberId") && selectedManagerId) {
      formData.set("managerMemberId", selectedManagerId);
    }

    try {
      const res = await saveTeamAction(formData);
      if (res.error) {
        toast.add({
          title: "Erro ao salvar equipe",
          description: res.error,
          type: "error",
        });
      } else {
        toast.add({
          title: editing ? "Equipe atualizada" : "Equipe criada",
          description: editing
            ? "As informações da equipe foram salvas com sucesso."
            : "A equipe foi criada com sucesso.",
          type: "success",
        });
        setShowModal(false);
        router.refresh();
      }
    } catch {
      toast.add({
        title: "Erro ao salvar",
        description: "Erro ao salvar informações da equipe.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  // Adicionar funcionário na área de administração
  function handleAddMemberToTeam(memberId: string) {
    if (!memberId || teamMemberIds.includes(memberId)) return;
    setTeamMemberIds((prev) => [...prev, memberId]);
    setAddMemberSelectedId("");
  }

  // Remover funcionário na área de administração
  function handleRemoveMemberFromTeam(memberId: string) {
    setTeamMemberIds((prev) => prev.filter((id) => id !== memberId));
  }

  // Salvar alterações de funcionários da equipe
  async function handleSaveTeamMembers() {
    if (!managingMembersTeam) return;
    setSavingMembers(true);

    try {
      const res = await updateTeamMembersAction(
        managingMembersTeam.id,
        teamMemberIds
      );
      if (res.error) {
        toast.add({
          title: "Erro ao atualizar membros",
          description: res.error,
          type: "error",
        });
      } else {
        toast.add({
          title: "Membros atualizados",
          description: "Os membros da equipe foram atualizados com sucesso.",
          type: "success",
        });
        setManagingMembersTeam(null);
        router.refresh();
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Erro ao salvar funcionários da equipe.",
        type: "error",
      });
    } finally {
      setSavingMembers(false);
    }
  }

  // Salvar alterações de unidades da equipe
  async function handleSaveTeamLocations() {
    if (!managingLocationsTeam) return;
    setSavingLocations(true);

    try {
      const res = await updateTeamLocationsAction(
        managingLocationsTeam.id,
        teamLocationIds
      );
      if (res.error) {
        toast.add({
          title: "Erro ao vincular unidades",
          description: res.error,
          type: "error",
        });
      } else {
        toast.add({
          title: "Unidades atualizadas",
          description: "As unidades da equipe foram atualizadas com sucesso.",
          type: "success",
        });
        setManagingLocationsTeam(null);
        router.refresh();
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Erro ao salvar unidades da equipe.",
        type: "error",
      });
    } finally {
      setSavingLocations(false);
    }
  }

  // Lista de membros atualmente alocados na equipe aberta para gestão
  const currentAllocatedMembers = useMemo(() => {
    return teamMemberIds
      .map((id) => {
        const fromAll = allMembers.find((m) => m.id === id);
        if (fromAll) return fromAll;
        const fromTeam = managingMembersTeam?.members.find((m) => m.id === id);
        if (fromTeam) {
          return {
            id: fromTeam.id,
            name: fromTeam.name,
            email: fromTeam.email,
            role: fromTeam.role,
          };
        }
        return null;
      })
      .filter((m): m is OrgMemberOption => m !== null);
  }, [teamMemberIds, allMembers, managingMembersTeam]);

  // Lista filtrada pelo input de busca dentro do modal de funcionários
  const filteredAllocatedMembers = useMemo(() => {
    if (!memberSearchQuery.trim()) return currentAllocatedMembers;
    const q = memberSearchQuery.toLowerCase().trim();
    return currentAllocatedMembers.filter((m) => {
      return (
        m.name.toLowerCase().includes(q) ||
        (m.email && m.email.toLowerCase().includes(q))
      );
    });
  }, [currentAllocatedMembers, memberSearchQuery]);

  // Colaboradores da empresa disponíveis para serem adicionados à equipe
  const availableToAdd = useMemo(() => {
    return allMembers.filter((m) => !teamMemberIds.includes(m.id));
  }, [allMembers, teamMemberIds]);

  // Unidades filtradas dentro do modal de unidades
  const filteredLocations = useMemo(() => {
    if (!locationSearchQuery.trim()) return locations;
    const q = locationSearchQuery.toLowerCase().trim();
    return locations.filter((l) => l.name.toLowerCase().includes(q));
  }, [locations, locationSearchQuery]);

  return (
    <div className="page-stack">
      <PageHeader
        title="Equipes"
        subtitle="Organize as pessoas por turno, função ou responsável."
        actions={
          ["OWNER", "ADMIN"].includes(userRole) ? (
            <Button
              type="button"
              onClick={() => openCreateEditModal()}
              className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-secondary)] shadow-none"
            >
              <Plus className="size-4" data-icon="inline-start" />
              <span>Criar equipe</span>
            </Button>
          ) : undefined
        }
      />



      {/* Barra de Busca Minimalista */}
      {teams.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <InputGroup className="flex-1 py-5!">
              <InputGroupAddon>
                <Search className="size-4 text-muted-foreground" />
              </InputGroupAddon>
              <InputGroupInput
                aria-label="Buscar equipe"
                placeholder="Buscar por equipe, responsável, unidade ou colaborador..."
                value={teamSearchQuery}
                onChange={(e) => setTeamSearchQuery(e.target.value)}
                className="text-sm!"
              />
              {teamSearchQuery && (
                <button
                  type="button"
                  onClick={() => setTeamSearchQuery("")}
                  className="pr-2.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="Limpar busca"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </InputGroup>
          </div>

          <span className="text-xs text-muted-foreground self-end sm:self-center">
            {filteredTeams.length} {filteredTeams.length === 1 ? "equipe" : "equipes"}
          </span>
        </div>
      )}

      {teams.length === 0 && (
        <EmptyState
          title="Nenhuma equipe cadastrada"
          description="Adicione o primeiro registro para organizar sua operação."
          action={
            ["OWNER", "ADMIN"].includes(userRole) ? (
              <Button
                onClick={() => openCreateEditModal()}
                className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-secondary)]"
              >
                <Plus className="size-4 mr-1.5" />
                Criar primeira equipe
              </Button>
            ) : undefined
          }
        />
      )}

      {teams.length > 0 && filteredTeams.length === 0 && (
        <EmptyState
          title="Nenhuma equipe encontrada"
          description="Tente buscar por outro termo."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTeamSearchQuery("")}
            >
              Limpar busca
            </Button>
          }
        />
      )}

      {/* Grid de Equipes */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredTeams.map((team) => (
          <Card
            key={team.id}
            id={`team-${team.id}`}
            className="p-5 flex flex-col justify-between gap-4 rounded-xl border border-border/70 bg-card hover:border-border hover:shadow-xs transition-all duration-200"
          >
            <div>
              {/* Header do Card com badges e menu de ações */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge
                    variant="secondary"
                    className="bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] border-[var(--brand-primary)]/20 font-medium text-xs"
                  >
                    {team.members.length} {team.members.length === 1 ? "integrante" : "integrantes"}
                  </Badge>

                  <Badge
                    variant="outline"
                    className="text-xs text-muted-foreground border-border/50 flex items-center gap-1 font-medium"
                  >
                    <CheckSquare className="size-3 text-[var(--brand-700)]" />
                    <span>{team.activeTasksCount} tarefas</span>
                  </Badge>
                </div>

                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="size-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                          aria-label={`Opções para ${team.name}`}
                        />
                      }
                    >
                      <MoreVertical className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onClick={() => openManageMembersModal(team)}>
                        <Users className="size-3.5 mr-2 text-(--brand-primary)" />
                        <span className="truncate">Gerenciar funcionários</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openManageLocationsModal(team)}>
                        <MapPin className="size-3.5 mr-2 text-(--brand-primary)" />
                        <span className="truncate">Gerenciar unidades</span>
                      </DropdownMenuItem>
                      {["OWNER", "ADMIN"].includes(userRole) && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openCreateEditModal(team)}>
                            <Pencil className="size-3.5 mr-2 text-muted-foreground" />
                            <span>Editar informações</span>
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {/* Título e Descrição */}
              <h3 className="text-foreground text-[length:var(--type-card-title)] font-bold">
                {team.name}
              </h3>
              {team.description ? (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                  {team.description}
                </p>
              ) : (
                <p className="text-xs italic text-muted-foreground/60 mt-1">
                  Sem descrição cadastrada.
                </p>
              )}

              {/* Metadados: Gestor e Unidades */}
              <div className="mt-3 pt-3 border-t border-border/50 flex flex-col gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <User className="size-3.5 text-muted-foreground/70 shrink-0" />
                  <span className="truncate">
                    Responsável:{" "}
                    <strong className="text-foreground font-medium">
                      {team.managerName || "Não atribuído"}
                    </strong>
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1 text-muted-foreground">
                    <MapPin className="size-3.5 text-muted-foreground/70 shrink-0" />
                    {team.locations && team.locations.length > 0 ? (
                      <span className="truncate" title={team.locations.map((l) => l.name).join(", ")}>
                        {team.locations.map((l) => l.name).join(", ")}
                      </span>
                    ) : (
                      <span className="italic text-muted-foreground/60 text-[11px]">
                        Nenhuma unidade vinculada
                      </span>
                    )}
                  </div>

                  {canManage && (
                    <button
                      type="button"
                      onClick={() => openManageLocationsModal(team)}
                      className="text-[11px] text-[var(--brand-primary)] hover:underline font-medium shrink-0 cursor-pointer"
                    >
                      {team.locations && team.locations.length > 0
                        ? `${team.locations.length} un.`
                        : "Vincular"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Área dedicada de funcionários no card */}
            <div className="pt-3 border-t border-border/50 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Funcionários da equipe
                </span>
                <span className="text-xs text-foreground font-medium">
                  {team.members.length} {team.members.length === 1 ? "pessoa" : "pessoas"}
                </span>
              </div>

              {team.members.length > 0 ? (
                <div className="flex items-center justify-between gap-2">
                  {/* Prévia de Avatares */}
                  <div className="flex items-center -space-x-1.5 overflow-hidden py-0.5">
                    {team.members.slice(0, 5).map((m) => (
                      <Avatar
                        key={m.id}
                        className="size-7 rounded-full border-2 border-card ring-1 ring-border/30"
                        title={m.name}
                      >
                        <AvatarFallback className="bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] text-[10px] font-bold">
                          {getInitials(m.name)}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                    {team.members.length > 5 && (
                      <div className="size-7 rounded-full border-2 border-card bg-muted text-[10px] font-semibold text-muted-foreground flex items-center justify-center">
                        +{team.members.length - 5}
                      </div>
                    )}
                  </div>

                  <span className="text-[11px] text-muted-foreground truncate max-w-[140px] text-right">
                    {team.members.slice(0, 2).map((m) => m.name.split(" ")[0]).join(", ")}
                    {team.members.length > 2 && "..."}
                  </span>
                </div>
              ) : (
                <p className="text-xs italic text-muted-foreground/60">
                  Nenhum funcionário vinculado a esta equipe.
                </p>
              )}

              <div className="flex items-center gap-2 mt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openManageMembersModal(team)}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/10 border-[var(--brand-primary)]/20 shadow-none h-8"
                >
                  <Users className="size-3.5" />
                  <span>Gerenciar funcionários ({team.members.length})</span>
                </Button>

                {["OWNER", "ADMIN"].includes(userRole) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openCreateEditModal(team)}
                    className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                    title="Editar informações básicas"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* MODAL ISOLADO 1: Administrar Funcionários da Equipe */}
      {managingMembersTeam && (
        <Modal
          open
          title={`Funcionários — ${managingMembersTeam.name}`}
          onClose={() => {
            if (!savingMembers) setManagingMembersTeam(null);
          }}
          className="sm:max-w-xl max-h-[90vh] flex flex-col"
        >


          <p className="text-xs text-muted-foreground mb-4">
            Adicione ou remova os colaboradores que fazem parte desta equipe.
            As permissões operacionais são sincronizadas automaticamente.
          </p>

          {/* Adicionar Colaborador à Equipe */}
          <div className="p-3 rounded-xl bg-muted/40 border border-border/60 mb-4 flex flex-col gap-2">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <UserPlus className="size-3.5 text-[var(--brand-primary)]" />
              Adicionar colaborador à equipe
            </span>

            {availableToAdd.length > 0 ? (
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Select
                    items={[
                      { value: "", label: "Selecione um colaborador..." },
                      ...availableToAdd.map((m) => ({
                        value: m.id,
                        label: `${m.name} (${ROLE_LABELS[m.role] || m.role})`,
                      })),
                    ]}
                    value={addMemberSelectedId}
                    onValueChange={(val) =>
                      setAddMemberSelectedId((val as string) ?? "")
                    }
                  >
                    <SelectTrigger
                      aria-label="Selecionar colaborador"
                      className="bg-card border-border/60 text-xs h-9 w-full"
                    >
                      <SelectValue placeholder="Selecione um colaborador..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="">Selecione um colaborador...</SelectItem>
                        {availableToAdd.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name} • {ROLE_LABELS[m.role] || m.role}
                            {m.email ? ` (${m.email})` : ""}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  type="button"
                  size="sm"
                  disabled={!addMemberSelectedId || savingMembers}
                  onClick={() => handleAddMemberToTeam(addMemberSelectedId)}
                  className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-secondary)] text-xs h-9 px-3 shrink-0"
                >
                  <Plus className="size-3.5 mr-1" />
                  Adicionar
                </Button>
              </div>
            ) : (
              <p className="text-xs italic text-muted-foreground">
                Todos os colaboradores ativos da empresa já estão nesta equipe.
              </p>
            )}
          </div>

          {/* Lista de Colaboradores Vinculados */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold text-foreground">
                Colaboradores alocados ({teamMemberIds.length})
              </span>

              {teamMemberIds.length > 3 && (
                <div className="w-44">
                  <Input
                    placeholder="Filtrar nesta equipe..."
                    value={memberSearchQuery}
                    onChange={(e) => setMemberSearchQuery(e.target.value)}
                    className="h-7 text-xs bg-card"
                  />
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto max-h-[300px] border border-border/50 rounded-xl divide-y divide-border/40 bg-card">
              {filteredAllocatedMembers.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  {memberSearchQuery ? (
                    "Nenhum colaborador encontrado para o filtro."
                  ) : (
                    <div className="flex flex-col items-center gap-1.5">
                      <Users className="size-8 text-muted-foreground/40" />
                      <span>Nenhum funcionário vinculado a esta equipe ainda.</span>
                      <span className="text-[11px] text-muted-foreground/70">
                        Use o campo acima para adicionar o primeiro integrante.
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                filteredAllocatedMembers.map((member) => (
                  <div
                    key={member.id}
                    className="p-2.5 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar className="size-8 rounded-full border border-border/50 shrink-0">
                        <AvatarFallback className="bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] font-bold text-xs">
                          {getInitials(member.name)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-xs text-foreground truncate">
                            {member.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground px-1.5 py-0.2 rounded bg-muted border border-border/30">
                            {ROLE_LABELS[member.role] || member.role}
                          </span>
                        </div>
                        {member.email && (
                          <span className="text-[11px] text-muted-foreground block truncate">
                            {member.email}
                          </span>
                        )}
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={savingMembers}
                      onClick={() => handleRemoveMemberFromTeam(member.id)}
                      className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                      title={`Remover ${member.name} da equipe`}
                    >
                      <UserMinus className="size-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Footer do Modal de Funcionários */}
          <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-border/60">
            <span className="text-xs text-muted-foreground">
              {teamMemberIds.length} {teamMemberIds.length === 1 ? "colaborador" : "colaboradores"}
            </span>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={savingMembers}
                onClick={() => setManagingMembersTeam(null)}
                className="text-xs h-9"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={savingMembers}
                onClick={handleSaveTeamMembers}
                className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-secondary)] text-xs h-9"
              >
                {savingMembers && (
                  <Spinner className="size-3.5 mr-1.5" />
                )}
                <span>Salvar alterações</span>
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL ISOLADO 2: Administrar Unidades da Equipe */}
      {managingLocationsTeam && (
        <Modal
          open
          title={`Unidades — ${managingLocationsTeam.name}`}
          onClose={() => {
            if (!savingLocations) setManagingLocationsTeam(null);
          }}
          className="sm:max-w-md max-h-[90vh] flex flex-col"
        >


          <p className="text-xs text-muted-foreground mb-4">
            Defina as unidades onde esta equipe tem autorização e atuação operacional.
          </p>

          {locations.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground border border-border/60 rounded-xl bg-card">
              <Building2 className="size-8 text-muted-foreground/40 mx-auto mb-2" />
              <p>Nenhuma unidade cadastrada na organização.</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              {locations.length > 4 && (
                <div className="mb-2">
                  <Input
                    placeholder="Filtrar unidades..."
                    value={locationSearchQuery}
                    onChange={(e) => setLocationSearchQuery(e.target.value)}
                    className="h-8 text-xs bg-card"
                  />
                </div>
              )}

              <div className="flex-1 overflow-y-auto max-h-[320px] p-2 border border-border/60 rounded-xl bg-card flex flex-col gap-1.5">
                {filteredLocations.map((loc) => {
                  const checked = teamLocationIds.includes(loc.id);
                  return (
                    <label
                      key={loc.id}
                      className={cn(
                        "flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors border text-xs",
                        checked
                          ? "bg-[var(--brand-primary)]/5 border-[var(--brand-primary)]/30 text-foreground font-medium"
                          : "border-transparent text-muted-foreground hover:bg-muted/40"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setTeamLocationIds((prev) => [...prev, loc.id]);
                          } else {
                            setTeamLocationIds((prev) =>
                              prev.filter((id) => id !== loc.id)
                            );
                          }
                        }}
                        className="rounded text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] size-4"
                      />
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <MapPin className="size-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{loc.name}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer do Modal de Unidades */}
          <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-border/60">
            <span className="text-xs text-muted-foreground">
              {teamLocationIds.length} {teamLocationIds.length === 1 ? "unidade" : "unidades"} selecionada(s)
            </span>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={savingLocations}
                onClick={() => setManagingLocationsTeam(null)}
                className="text-xs h-9"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={savingLocations}
                onClick={handleSaveTeamLocations}
                className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-secondary)] text-xs h-9"
              >
                {savingLocations && (
                  <Spinner className="size-3.5 mr-1.5" />
                )}
                <span>Salvar unidades</span>
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL ISOLADO 3: Criar / Editar Informações Básicas da Equipe */}
      {showModal && (
        <Modal
          open
          title={editing ? "Editar equipe" : "Criar equipe"}
          onClose={() => setShowModal(false)}
          className="sm:max-w-md max-h-[90vh] overflow-y-auto"
        >

          <p className="text-xs text-muted-foreground mb-4">
            Defina as informações essenciais da equipe. Funcionários e unidades são configurados em seus respectivos painéis.
          </p>

          <form onSubmit={handleCreateOrEditTeam} className="flex flex-col gap-3.5">
            <input type="hidden" name="teamId" value={editing?.id ?? ""} />
            <input
              type="hidden"
              name="managerMemberId"
              value={selectedManagerId}
            />

            <Field>
              <FieldLabel className="text-xs font-semibold text-foreground">
                Nome da equipe *
              </FieldLabel>
              <Input
                aria-label="Nome da equipe"
                type="text"
                name="name"
                defaultValue={editing?.name ?? ""}
                maxLength={200}
                required
                placeholder="Ex.: Operação Manhã"
                className="bg-[var(--canvas)] border-border/60 text-sm h-10"
              />
            </Field>

            <Field>
              <FieldLabel className="text-xs font-semibold text-foreground">
                Descrição
              </FieldLabel>
              <Textarea
                aria-label="Descrição"
                name="description"
                defaultValue={editing?.description ?? ""}
                maxLength={2000}
                rows={3}
                placeholder="Descreva o escopo e responsabilidades desta equipe..."
                className="bg-[var(--canvas)] border-border/60 text-xs min-h-[70px]"
              />
            </Field>

            <Field>
              <FieldLabel className="text-xs font-semibold text-foreground">
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
                  className="bg-[var(--canvas)] border-border/60 text-xs h-10 w-full"
                >
                  <SelectValue placeholder="Selecione um gestor..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="">Selecione um gestor...</SelectItem>
                    {managers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-border/60">
              <Button
                type="button"
                variant="outline"
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
                <span>{editing ? "Salvar alterações" : "Criar equipe"}</span>
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
