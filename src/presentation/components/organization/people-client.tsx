"use client";

import { Modal } from "../shared/modal";
import { MemberAccessEditor, type MemberAccessDetails } from "./member-access-editor";
import { canManageMember, canDeleteMember } from "@/domain/rules/member-access";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Plus,
  UserCheck,
  UserX,
  Key,
  Mail,
  MapPin,
  AlertCircle,
  MoreVertical,
  Shield,
  Search,
  X,
  User,
  Pencil,
  Trash2,
  Lock,
  AlertTriangle,
} from "lucide-react";
import {
  inviteMemberAction,
  updateMemberStatusAction,
  resetMemberPinAction,
  updateMemberDetailsAction,
  deleteMemberAction,
} from "@/presentation/actions/org-management-actions";

import { PageHeader, EmptyState } from "@/presentation/components/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  SelectGroup,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
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
import { cn } from "@/lib/utils";

interface MemberItem {
  id: string;
  name: string;
  email: string | null;
  role: string;
  status: string;
  employeeCode: string | null;
  availabilityStatus?: string;
  manualAvailability?: string;
  locations: string[];
  teams: string[];
  primaryLocationId?: string;
  primaryTeamId?: string;
  access: MemberAccessDetails;
}

interface PeopleClientProps {
  members: MemberItem[];
  locations: Array<{ id: string; name: string }>;
  teams: Array<{ id: string; name: string }>;
  userRole: string;
  currentMemberId: string;
  allowManagersToEditSensitiveData?: boolean;
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

export function PeopleClient({
  members,
  locations,
  teams,
  userRole,
  currentMemberId,
  allowManagersToEditSensitiveData = false,
}: PeopleClientProps) {
  const router = useRouter();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showPinModal, setShowPinModal] = useState<string | null>(null);
  const [accessMember, setAccessMember] = useState<MemberItem | null>(null);
  const [newPin, setNewPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Edição de dados do colaborador
  const [editMember, setEditMember] = useState<MemberItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState("EMPLOYEE");
  const [editPin, setEditPin] = useState("");
  const [editLocationId, setEditLocationId] = useState("");
  const [editTeamId, setEditTeamId] = useState("");

  // Exclusão permanente
  const [deleteConfirmMember, setDeleteConfirmMember] = useState<MemberItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Filtros e busca
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Invite form state
  const [selectedRole, setSelectedRole] = useState("EMPLOYEE");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");

  const canEditSensitiveGlobal =
    userRole === "OWNER" ||
    userRole === "ADMIN" ||
    (userRole === "MANAGER" && Boolean(allowManagersToEditSensitiveData));

  function handleOpenEdit(member: MemberItem) {
    setErrorMsg(null);
    setEditMember(member);
    setEditName(member.name);
    setEditEmail(member.email || "");
    setEditPassword("");
    setEditRole(member.role);
    setEditPin("");
    const primaryLoc =
      member.primaryLocationId ||
      member.access.locations.find((l) => l.type === "PRIMARY")?.locationId ||
      member.access.locations[0]?.locationId ||
      "";
    setEditLocationId(primaryLoc);
    const primaryTeam =
      member.primaryTeamId ||
      member.access.primaryTeamId ||
      member.access.teamIds[0] ||
      "";
    setEditTeamId(primaryTeam);
  }

  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      if (roleFilter !== "ALL" && member.role !== roleFilter) {
        return false;
      }
      if (statusFilter !== "ALL" && member.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = member.name.toLowerCase().includes(q);
        const matchEmail = member.email?.toLowerCase().includes(q) ?? false;
        const matchCode = member.employeeCode?.toLowerCase().includes(q) ?? false;
        const matchTeam = member.teams.some((t) => t.toLowerCase().includes(q));
        const matchLoc = member.locations.some((l) => l.toLowerCase().includes(q));
        return matchName || matchEmail || matchCode || matchTeam || matchLoc;
      }
      return true;
    });
  }, [members, searchQuery, roleFilter, statusFilter]);

  const hasActiveFilters = searchQuery.trim() !== "" || roleFilter !== "ALL" || statusFilter !== "ALL";

  function handleResetFilters() {
    setSearchQuery("");
    setRoleFilter("ALL");
    setStatusFilter("ALL");
  }

  async function handleInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    if (!formData.get("role") && selectedRole) {
      formData.set("role", selectedRole);
    }
    if (!formData.get("primaryLocationId") && selectedLocationId) {
      formData.set("primaryLocationId", selectedLocationId);
    }
    if (!formData.get("teamId") && selectedTeamId) {
      formData.set("teamId", selectedTeamId);
    }
    try {
      const res = await inviteMemberAction(formData);
      if (res.error) {
        toast.add({
          title: "Erro ao adicionar",
          description: res.error,
          type: "error",
        });
      } else {
        setShowInviteModal(false);
        toast.add({
          title: "Colaborador adicionado",
          description: "O novo membro foi cadastrado com sucesso.",
          type: "success",
        });
        router.refresh();
      }
    } catch {
      toast.add({
        title: "Erro",
        description: "Erro ao adicionar colaborador.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleStatus(memberId: string, currentStatus: string) {
    const nextStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setLoading(true);
    try {
      const result = await updateMemberStatusAction(memberId, nextStatus);
      if (result.error) {
        toast.add({
          title: "Erro ao alterar status",
          description: result.error,
          type: "error",
        });
      } else {
        toast.add({
          title: "Status atualizado",
          description: `O colaborador foi ${nextStatus === "ACTIVE" ? "ativado" : "desativado"}.`,
          type: "success",
        });
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPin(e: React.FormEvent) {
    e.preventDefault();
    if (!showPinModal || newPin.length !== 6) return;
    setLoading(true);
    try {
      const res = await resetMemberPinAction(showPinModal, newPin);
      if (res.error) {
        toast.add({
          title: "Erro ao redefinir PIN",
          description: res.error,
          type: "error",
        });
      } else {
        setShowPinModal(null);
        setNewPin("");
        toast.add({
          title: "PIN redefinido",
          description: "Novo PIN de acesso configurado com sucesso.",
          type: "success",
        });
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editMember) return;
    setLoading(true);

    const isSensitive = canEditSensitiveGlobal;

    try {
      const res = await updateMemberDetailsAction({
        memberId: editMember.id,
        name: editName,
        email: editEmail ? editEmail.trim() : null,
        password: isSensitive && editPassword.trim() ? editPassword.trim() : null,
        role: isSensitive ? (editRole as any) : undefined,
        pin: isSensitive && editPin.trim() ? editPin.trim() : null,
        locationId: isSensitive ? (editLocationId || null) : undefined,
        teamId: editTeamId || null,
      });

      if (res.error) {
        toast.add({
          title: "Erro ao salvar",
          description: res.error,
          type: "error",
        });
      } else {
        setEditMember(null);
        toast.add({
          title: "Dados atualizados",
          description: "Os dados do colaborador foram salvos com sucesso.",
          type: "success",
        });
        router.refresh();
      }
    } catch {
      toast.add({
        title: "Erro",
        description: "Erro ao salvar dados do colaborador.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handlePermanentDelete() {
    if (!deleteConfirmMember) return;
    setDeleteLoading(true);
    try {
      const res = await deleteMemberAction(deleteConfirmMember.id);
      if (res.error) {
        toast.add({
          title: "Erro ao excluir",
          description: res.error,
          type: "error",
        });
      } else {
        setDeleteConfirmMember(null);
        toast.add({
          title: "Colaborador excluído",
          description: "O colaborador foi removido permanentemente.",
          type: "success",
        });
        router.refresh();
      }
    } catch {
      toast.add({
        title: "Erro",
        description: "Erro ao excluir colaborador permanentemente.",
        type: "error",
      });
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Pessoas"
        subtitle="Gerencie colaboradores, equipes e permissões de acesso da empresa."
        actions={
          ["OWNER", "ADMIN"].includes(userRole) ? (
            <Button
              type="button"
              onClick={() => setShowInviteModal(true)}
              className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-secondary)] shadow-none"
            >
              <Plus className="size-4" data-icon="inline-start" />
              <span>Adicionar pessoa</span>
            </Button>
          ) : undefined
        }
      />

      {/* Barra de Busca e Filtros Minimalista */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 max-w-2xl">
          <InputGroup className="flex-1 py-5!">
            <InputGroupAddon>
              <Search className="size-4 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Buscar pessoa"
              placeholder="Buscar por nome, e-mail, matrícula ou equipe..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-sm!"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="pr-2.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="Limpar busca"
              >
                <X className="size-3.5" />
              </button>
            )}
          </InputGroup>

          <NativeSelect
            aria-label="Filtrar por cargo"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="sm:w-40 text-xs"
          >
            <NativeSelectOption value="ALL">Todos os cargos</NativeSelectOption>
            <NativeSelectOption value="OWNER">Proprietário</NativeSelectOption>
            <NativeSelectOption value="ADMIN">Administrador</NativeSelectOption>
            <NativeSelectOption value="MANAGER">Gestor</NativeSelectOption>
            <NativeSelectOption value="EMPLOYEE">Colaborador</NativeSelectOption>
          </NativeSelect>

          <NativeSelect
            aria-label="Filtrar por status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="sm:w-36 text-xs"
          >
            <NativeSelectOption value="ALL">Todos os status</NativeSelectOption>
            <NativeSelectOption value="ACTIVE">Ativos</NativeSelectOption>
            <NativeSelectOption value="INACTIVE">Inativos</NativeSelectOption>
          </NativeSelect>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 text-xs text-muted-foreground">
          <span>
            {filteredMembers.length} {filteredMembers.length === 1 ? "pessoa" : "pessoas"}
          </span>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="xs"
              onClick={handleResetFilters}
              className="h-6 text-xs text-[var(--brand-700)] hover:text-[var(--brand-900)] px-2"
            >
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {/* Grid de Membros */}
      {filteredMembers.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? "Nenhum resultado encontrado" : "Nenhuma pessoa cadastrada"}
          description={
            hasActiveFilters
              ? "Tente ajustar seus termos de busca ou filtros para encontrar o que procura."
              : "Adicione o primeiro colaborador para organizar os acessos da sua equipe."
          }
          icon={User}
          action={
            hasActiveFilters ? (
              <Button variant="outline" size="sm" onClick={handleResetFilters}>
                Limpar filtros
              </Button>
            ) : ["OWNER", "ADMIN"].includes(userRole) ? (
              <Button
                size="sm"
                onClick={() => setShowInviteModal(true)}
                className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-secondary)]"
              >
                <Plus className="size-4 mr-1.5" />
                Adicionar primeira pessoa
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredMembers.map((member) => {
            const canManage = canManageMember(userRole, currentMemberId, member);

            return (
              <Card
                key={member.id}
                id={`member-${member.id}`}
                className={cn(
                  "relative flex flex-col justify-between rounded-xl border border-border/70 bg-card p-4.5 transition-all duration-200 hover:border-border hover:shadow-xs",
                  member.status === "INACTIVE" && "opacity-75 bg-muted/20"
                )}
              >
                <div>
                  {/* Top: Avatar à esquerda, Identificação ao centro, Dropdown de ações à direita */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Avatar ao lado esquerdo com indicador de status */}
                      <div className="relative shrink-0">
                        <Avatar className="size-11 rounded-full border border-border/50 shadow-xs">
                          <AvatarFallback className="bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] font-bold text-sm tracking-tight">
                            {getInitials(member.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span
                          className={cn(
                            "absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-card",
                            member.status === "ACTIVE" ? "bg-emerald-500" : "bg-zinc-400"
                          )}
                          title={member.status === "ACTIVE" ? "Colaborador ativo" : "Colaborador inativo"}
                        />
                      </div>

                      {/* Nome, Cargo e Badges */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h3
                            className="font-semibold text-sm sm:text-base text-foreground truncate"
                            title={member.name}
                          >
                            {member.name}
                          </h3>
                        </div>

                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <Badge
                            variant="secondary"
                            className="text-[11px] font-medium py-0 px-2 h-5 bg-muted text-muted-foreground border border-border/40"
                          >
                            {ROLE_LABELS[member.role] || member.role}
                          </Badge>

                          {member.employeeCode && (
                            <span className="inline-flex items-center text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted/60 border border-border/30">
                              #{member.employeeCode}
                            </span>
                          )}

                          {member.availabilityStatus && (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] font-medium py-0 px-1.5 h-5 border",
                                member.availabilityStatus === "AVAILABLE" &&
                                "bg-emerald-50 text-emerald-700 border-emerald-200/80",
                                member.availabilityStatus === "BUSY" &&
                                "bg-amber-50 text-amber-700 border-amber-200/80",
                                member.availabilityStatus === "UNAVAILABLE" &&
                                "bg-zinc-100 text-zinc-600 border-zinc-200"
                              )}
                            >
                              {member.availabilityStatus === "AVAILABLE"
                                ? "Disponível"
                                : member.availabilityStatus === "BUSY"
                                  ? "Em tarefa"
                                  : "Indisponível"}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Ações em Dropdown */}
                    {canManage && (
                      <div className="shrink-0 -mr-1 -mt-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                                aria-label={`Mais opções para ${member.name}`}
                              />
                            }
                          >
                            <MoreVertical className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => handleOpenEdit(member)}>
                              <Pencil className="size-4 mr-2 text-muted-foreground" />
                              <span>Editar dados</span>
                            </DropdownMenuItem>

                            {canEditSensitiveGlobal && (
                              <DropdownMenuItem onClick={() => setShowPinModal(member.id)}>
                                <Key className="size-4 mr-2 text-muted-foreground" />
                                <span>Redefinir PIN</span>
                              </DropdownMenuItem>
                            )}

                            {["OWNER", "ADMIN"].includes(userRole) && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setErrorMsg(null);
                                  setAccessMember(member);
                                }}
                              >
                                <Shield className="size-4 mr-2 text-muted-foreground" />
                                <span>Gerenciar acessos</span>
                              </DropdownMenuItem>
                            )}

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                              variant={member.status === "ACTIVE" ? "destructive" : "default"}
                              onClick={() => handleToggleStatus(member.id, member.status)}
                            >
                              {member.status === "ACTIVE" ? (
                                <>
                                  <UserX className="size-4 mr-2" />
                                  <span className="truncate">Desativar acesso</span>
                                </>
                              ) : (
                                <>
                                  <UserCheck className="size-4 mr-2 text-emerald-600" />
                                  <span className="text-emerald-700 font-medium">Ativar acesso</span>
                                </>
                              )}
                            </DropdownMenuItem>

                            {canDeleteMember(userRole, currentMemberId, member) && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  className="text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer"
                                  onClick={() => setDeleteConfirmMember(member)}
                                >
                                  <Trash2 className="size-4 mr-2 text-red-600" />
                                  <span className="truncate">Excluir funcionário</span>
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>

                  <div className="mt-3.5 pt-3 border-t border-border/50 flex flex-col gap-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2 truncate">
                      <Mail className="size-3.5 shrink-0 text-muted-foreground/70" />
                      {member.email ? (
                        <span className="truncate text-foreground/80" title={member.email}>
                          {member.email}
                        </span>
                      ) : (
                        <span className="italic text-muted-foreground/50 text-[11px]">
                          Sem e-mail cadastrado
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 truncate">
                      <MapPin className="size-3.5 shrink-0 text-muted-foreground/70" />
                      {member.locations.length > 0 ? (
                        <span className="truncate text-foreground/80" title={member.locations.join(", ")}>
                          {member.locations.join(", ")}
                        </span>
                      ) : (
                        <span className="italic text-muted-foreground/50 text-[11px]">
                          Sem unidade atribuída
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer do Card: Equipes minimalistas */}
                {member.teams.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Users className="size-3.5 shrink-0 text-[var(--brand-primary)]" />
                      <span
                        className="text-xs font-medium text-[var(--brand-primary)] truncate"
                        title={member.teams.join(", ")}
                      >
                        {member.teams.join(", ")}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-medium shrink-0">
                      {member.teams.length === 1 ? "1 equipe" : `${member.teams.length} equipes`}
                    </span>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal Gerenciar Acessos Detalhados */}
      {accessMember && (
        <MemberAccessEditor
          member={accessMember}
          teams={teams}
          locations={locations}
          userRole={userRole}
          onClose={() => setAccessMember(null)}
        />
      )}

      {/* Modal Editar Dados do Colaborador */}
      {editMember && (
        <Modal
          open
          title={`Editar dados: ${editMember.name}`}
          onClose={() => setEditMember(null)}
          className="sm:max-w-xl max-h-[90dvh] overflow-y-auto"
        >
          {!canEditSensitiveGlobal && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 text-xs text-amber-950 dark:text-amber-200 mb-4 flex items-start gap-2.5">
              <Lock className="size-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong className="font-semibold text-amber-900 dark:text-amber-100">Permissão restrita de Gestor:</strong> Você pode alterar dados simples (nome, e-mail e equipe). Dados sensíveis de acesso (senha, PIN, permissão e unidade) estão bloqueados para gestores segundo a política atual da empresa.
              </div>
            </div>
          )}

          <form onSubmit={handleSaveEdit} className="flex flex-col gap-4">
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-[var(--brand-900)] uppercase tracking-wider">
                Dados Cadastrais
              </h4>

              <Field>
                <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                  Nome completo *
                </FieldLabel>
                <Input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nome do colaborador"
                  className="bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] h-10"
                />
              </Field>

              <Field>
                <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                  E-mail corporativo
                </FieldLabel>
                <Input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="email@empresa.com"
                  className="bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] h-10"
                />
              </Field>

              <Field>
                <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                  Equipe principal
                </FieldLabel>
                <NativeSelect
                  value={editTeamId}
                  onChange={(e) => setEditTeamId(e.target.value)}
                  className="w-full bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] h-10"
                >
                  <NativeSelectOption value="">Nenhuma equipe atribuída</NativeSelectOption>
                  {teams.map((t) => (
                    <NativeSelectOption key={t.id} value={t.id}>
                      {t.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            </div>

            {canEditSensitiveGlobal && (
              <div className="space-y-3 pt-3 border-t border-[var(--border-subtle)]">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[var(--brand-900)] uppercase tracking-wider">
                    Acesso e Credenciais
                  </h4>
                  <Badge variant="outline" className="text-[10px] text-amber-700 bg-amber-50 border-amber-200">
                    Dados Sensíveis
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                      Unidade principal
                    </FieldLabel>
                    <NativeSelect
                      value={editLocationId}
                      onChange={(e) => setEditLocationId(e.target.value)}
                      className="w-full bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] h-10"
                    >
                      <NativeSelectOption value="">Nenhuma unidade atribuída</NativeSelectOption>
                      {locations.map((loc) => (
                        <NativeSelectOption key={loc.id} value={loc.id}>
                          {loc.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>

                  <Field>
                    <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                      Permissão de acesso
                    </FieldLabel>
                    <NativeSelect
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      className="w-full bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] h-10"
                    >
                      <NativeSelectOption value="EMPLOYEE">Colaborador</NativeSelectOption>
                      <NativeSelectOption value="MANAGER">Gestor</NativeSelectOption>
                      {userRole === "OWNER" && (
                        <NativeSelectOption value="ADMIN">Administrador</NativeSelectOption>
                      )}
                    </NativeSelect>
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                      Nova senha
                    </FieldLabel>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      placeholder="Deixe em branco p/ manter"
                      minLength={12}
                      className="bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] h-10"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">Mínimo 12 caracteres.</p>
                  </Field>

                  <Field>
                    <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                      Novo PIN (6 dígitos)
                    </FieldLabel>
                    <Input
                      type="password"
                      value={editPin}
                      onChange={(e) => setEditPin(e.target.value)}
                      placeholder="Deixe em branco p/ manter"
                      maxLength={6}
                      className="bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] h-10 font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">Exatamente 6 dígitos numéricos.</p>
                  </Field>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 mt-2 pt-3 border-t border-[var(--border-subtle)]">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditMember(null)}
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
                <span>Salvar alterações</span>
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {deleteConfirmMember && (
        <AlertDialog open onOpenChange={(open) => !open && setDeleteConfirmMember(null)}>
          <AlertDialogContent className="max-w-lg!">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-red-600/80 flex items-center gap-2">
                <AlertTriangle className="size-5 text-red-600/80 shrink-0" />
                <span>Excluir colaborador?</span>
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 text-left">
                <span className="block text-sm text-foreground">
                  Você está prestes a remover o colaborador <strong>{deleteConfirmMember.name}</strong> definitivamente.
                </span>
                <span className="block text-xs text-red-600 font-medium bg-red-50 p-2.5 rounded-lg border border-red-200">
                  Esta ação é irreversível. Todos os vínculos de acesso, unidades e histórico de atribuições associados a esta pessoa serão removidos permanentemente.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeleteConfirmMember(null)} disabled={deleteLoading}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={deleteLoading}
                onClick={handlePermanentDelete}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteLoading ? (
                  <Spinner className="size-3.5 mr-1" />
                ) : (
                  <Trash2 className="size-3.5 mr-1" />
                )}
                <span>Excluir</span>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {showInviteModal && (
        <Modal
          open
          title="Adicionar pessoa"
          onClose={() => setShowInviteModal(false)}
        >
          <p className="text-[length:var(--type-label)] text-[var(--text-secondary)] mb-4">
            Informe os dados da pessoa e defina sua unidade e permissão de
            acesso.
          </p>

          <form onSubmit={handleInvite} className="flex flex-col gap-3">
            <input type="hidden" name="role" value={selectedRole} />
            <input
              type="hidden"
              name="primaryLocationId"
              value={selectedLocationId}
            />
            <input type="hidden" name="teamId" value={selectedTeamId} />

            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                Nome completo *
              </FieldLabel>
              <Input
                aria-label="Nome completo"
                type="text"
                name="name"
                required
                placeholder="Ex.: Juliana Martins"
                className="bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] h-10"
              />
            </Field>

            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                E-mail corporativo
              </FieldLabel>
              <Input
                aria-label="E-mail corporativo"
                type="email"
                name="email"
                placeholder="juliana@empresa.com"
                className="bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] h-10"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="initial-password">
                Senha inicial (opcional, mínimo 12 caracteres)
              </FieldLabel>
              <Input
                id="initial-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
              />
              <p className="text-caption text-muted-foreground">
                Defina um PIN ou uma senha. Pessoas com e-mail já cadastrado mantêm a senha atual.
              </p>
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field>
                <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                  Permissão de acesso *
                </FieldLabel>
                <Select
                  items={[
                    { value: "EMPLOYEE", label: "Colaborador" },
                    { value: "MANAGER", label: "Gestor" },
                    { value: "ADMIN", label: "Administrador" },
                  ]}
                  name="role"
                  value={selectedRole}
                  onValueChange={(val) =>
                    setSelectedRole((val as string) ?? "EMPLOYEE")
                  }
                >
                  <SelectTrigger
                    aria-label="Permissão de acesso"
                    className="bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] h-10 w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="EMPLOYEE">Colaborador</SelectItem>
                      <SelectItem value="MANAGER">Gestor</SelectItem>
                      <SelectItem value="ADMIN">Administrador</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                  PIN (6 dígitos)
                </FieldLabel>
                <Input
                  aria-label="PIN (6 dígitos)"
                  type="password"
                  name="pin"
                  maxLength={6}
                  placeholder="Ex: 123456"
                  className="bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] h-10 font-mono"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field>
                <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                  Unidade principal
                </FieldLabel>
                <Select
                  items={[
                    { value: "", label: "Selecione a unidade..." },
                    ...locations.map((loc) => ({
                      value: loc.id,
                      label: loc.name,
                    })),
                  ]}
                  name="primaryLocationId"
                  value={selectedLocationId}
                  onValueChange={(val) =>
                    setSelectedLocationId((val as string) ?? "")
                  }
                >
                  <SelectTrigger
                    aria-label="Unidade principal"
                    className="bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] h-10 w-full"
                  >
                    <SelectValue placeholder="Selecione a unidade..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="">Selecione a unidade...</SelectItem>
                      {locations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                  Equipe
                </FieldLabel>
                <Select
                  items={[
                    { value: "", label: "Nenhuma equipe inicial" },
                    ...teams.map((t) => ({ value: t.id, label: t.name })),
                  ]}
                  name="teamId"
                  value={selectedTeamId}
                  onValueChange={(val) =>
                    setSelectedTeamId((val as string) ?? "")
                  }
                >
                  <SelectTrigger
                    aria-label="Equipe"
                    className="bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] h-10 w-full"
                  >
                    <SelectValue placeholder="Nenhuma equipe inicial" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="">Nenhuma equipe inicial</SelectItem>
                      {teams.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-[var(--border-subtle)]">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowInviteModal(false)}
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
                <span>Adicionar pessoa</span>
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Redefinir PIN */}
      {showPinModal && (
        <Modal open title="Redefinir PIN" onClose={() => setShowPinModal(null)}>
          <p className="text-[length:var(--type-label)] text-[var(--text-secondary)] mb-4">
            Defina um novo PIN de seis dígitos para o acesso desta pessoa.
          </p>

          <form onSubmit={handleResetPin} className="flex flex-col gap-3">
            <Input
              type="password"
              maxLength={6}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              placeholder="000000"
              required
              className="text-center text-lg font-mono tracking-widest bg-[var(--canvas)] border-[var(--border-subtle)] h-12"
            />

            <div className="flex items-center justify-end gap-2 mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPinModal(null)}
                className="text-[length:var(--type-label)]"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={newPin.length !== 6 || loading}
                className="bg-[var(--brand-900)] text-white text-[length:var(--type-label)] hover:bg-[var(--brand-700)] shadow-none"
              >
                {loading && (
                  <Spinner className="size-3.5" data-icon="inline-start" />
                )}
                <span>Salvar novo PIN</span>
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
