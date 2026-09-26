"use client";

import { Modal } from "../shared/modal";
import { MemberAccessEditor, type MemberAccessDetails } from "./member-access-editor";
import { canManageMember } from "@/domain/rules/member-access";
import { useState } from "react";
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
} from "lucide-react";
import {
  inviteMemberAction,
  updateMemberStatusAction,
  resetMemberPinAction,
} from "@/presentation/actions/org-management-actions";

import { PageHeader } from "@/presentation/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  access: MemberAccessDetails;
}

interface PeopleClientProps {
  members: MemberItem[];
  locations: Array<{ id: string; name: string }>;
  teams: Array<{ id: string; name: string }>;
  userRole: string;
  currentMemberId: string;
}

export function PeopleClient({
  members,
  locations,
  teams,
  userRole,
  currentMemberId,
}: PeopleClientProps) {
  const router = useRouter();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showPinModal, setShowPinModal] = useState<string | null>(null);
  const [editMember, setEditMember] = useState<MemberItem | null>(null);
  const [newPin, setNewPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Invite form state
  const [selectedRole, setSelectedRole] = useState("EMPLOYEE");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");

  async function handleInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
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
        setErrorMsg(res.error);
      } else {
        setShowInviteModal(false);
        router.refresh();
      }
    } catch {
      setErrorMsg("Erro ao adicionar colaborador.");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleStatus(memberId: string, currentStatus: string) {
    const nextStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setLoading(true);
    try {
      const result = await updateMemberStatusAction(memberId, nextStatus);
      if (result.error) setErrorMsg(result.error); else router.refresh();
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
        setErrorMsg(res.error);
      } else {
        setShowPinModal(null);
        setNewPin("");
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Pessoas"
        subtitle="Gerencie pessoas, equipes e permissões de acesso."
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

      {errorMsg && (
        <Alert variant="destructive">
          <AlertCircle className="size-4 shrink-0" />
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}

      {/* Lista de Membros */}
      <div className="flex flex-col gap-3">
        {members.map((member) => (
          <Card
            key={member.id}
            id={`member-${member.id}`}
            className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <Badge className="bg-brand-900 text-white hover:bg-brand-900">
                  {(
                    {
                      OWNER: "Proprietário",
                      ADMIN: "Administrador",
                      MANAGER: "Gestor",
                      EMPLOYEE: "Colaborador",
                    } as Record<string, string>
                  )[member.role] || member.role}
                </Badge>
                <Badge
                  variant="outline"
                  className={
                    member.status === "ACTIVE"
                      ? "bg-emerald-100 text-emerald-900 border-transparent"
                      : "bg-red-100 text-red-900 border-transparent"
                  }
                >
                  {member.status === "ACTIVE" ? "Ativo" : "Inativo"}
                </Badge>
                {member.availabilityStatus && (
                  <Badge
                    variant="outline"
                    className={
                      member.availabilityStatus === "AVAILABLE"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : member.availabilityStatus === "BUSY"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-zinc-100 text-zinc-600 border-zinc-200"
                    }
                  >
                    {member.availabilityStatus === "AVAILABLE"
                      ? "Disponível"
                      : member.availabilityStatus === "BUSY"
                      ? "Em tarefa"
                      : "Indisponível"}
                  </Badge>
                )}
                {member.employeeCode && (
                  <Badge
                    variant="secondary"
                    className="font-mono text-[length:var(--type-caption)] bg-[var(--canvas)] border-[var(--border-subtle)] text-[var(--brand-700)]"
                  >
                    Matrícula: {member.employeeCode}
                  </Badge>
                )}
              </div>

              <h3 className="text-[var(--text-primary)] text-[length:var(--type-card-title)] font-bold">
                {member.name}
              </h3>
              <div className="text-[length:var(--type-label)] text-[var(--text-secondary)] mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                {member.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="size-3" />
                    <span>{member.email}</span>
                  </span>
                )}
                {member.locations.length > 0 && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" />
                    <span>{member.locations.join(", ")}</span>
                  </span>
                )}
                {member.teams.length > 0 && (
                  <span className="flex items-center gap-1 text-[var(--brand-700)] font-medium">
                    <Users className="size-3" />
                    <span>{member.teams.join(", ")}</span>
                  </span>
                )}
              </div>
            </div>

            {canManageMember(userRole, currentMemberId, member) && (
              <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
                <Button variant="outline" size="sm" disabled={loading} onClick={() => { setErrorMsg(null); setEditMember(member); }}>Editar acessos</Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPinModal(member.id)}
                  className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)] hover:bg-[var(--neutral-200)] shadow-none"
                >
                  <Key
                    className="size-3.5 text-[var(--brand-700)]"
                    data-icon="inline-start"
                  />
                  <span>Redefinir PIN</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggleStatus(member.id, member.status)}
                  className={`text-[length:var(--type-label)] font-semibold shadow-none ${member.status === "ACTIVE"
                    ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                    }`}
                >
                  {member.status === "ACTIVE" ? (
                    <>
                      <UserX className="size-3.5" data-icon="inline-start" />
                      <span>Desativar</span>
                    </>
                  ) : (
                    <>
                      <UserCheck
                        className="size-3.5"
                        data-icon="inline-start"
                      />
                      <span>Ativar</span>
                    </>
                  )}
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Modal Adicionar Pessoa */}
      {editMember && <MemberAccessEditor member={editMember} teams={teams} locations={locations} userRole={userRole} onClose={() => setEditMember(null)} />}
      {showInviteModal && (
        <Modal
          open
          title="Adicionar pessoa"
          onClose={() => setShowInviteModal(false)}
        >
          {errorMsg && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="size-4 shrink-0" />
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}
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

            <Field><FieldLabel htmlFor="initial-password">Senha inicial (opcional, mínimo 12 caracteres)</FieldLabel><Input id="initial-password" name="password" type="password" autoComplete="new-password" minLength={12} /><p className="text-caption text-muted-foreground">Defina um PIN ou uma senha. Pessoas com e-mail já cadastrado mantêm a senha atual.</p></Field>
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
                  <SelectContent><SelectGroup>
                    <SelectItem value="EMPLOYEE">Colaborador</SelectItem>
                    <SelectItem value="MANAGER">Gestor</SelectItem>
                    <SelectItem value="ADMIN">Administrador</SelectItem>
                  </SelectGroup></SelectContent>
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
                  <SelectContent><SelectGroup>
                    <SelectItem value="">Selecione a unidade...</SelectItem>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectGroup></SelectContent>
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
                  <SelectContent><SelectGroup>
                    <SelectItem value="">Nenhuma equipe inicial</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectGroup></SelectContent>
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
          {errorMsg && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="size-4 shrink-0" />
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}
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
