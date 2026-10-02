"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateMemberAccessAction } from "@/presentation/actions/org-management-actions";
import type { MemberAccessInput } from "@/domain/rules/member-access";
import { Modal } from "../shared/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toast";

type Option = { id: string; name: string };
export type MemberAccessDetails = Omit<MemberAccessInput, "memberId" | "role">;
const roles = { EMPLOYEE: "Colaborador — executa tarefas", MANAGER: "Gestor — gerencia as equipes e unidades selecionadas", ADMIN: "Administrador — gerencia toda a organização" };
function localTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function MemberAccessEditor({ member, teams, locations, userRole, onClose }: { member: { id: string; name: string; role: string; access: MemberAccessDetails }; teams: Option[]; locations: Option[]; userRole: string; onClose: () => void }) {
  const router = useRouter();
  const [role, setRole] = useState(member.role as MemberAccessInput["role"]);
  const [teamIds, setTeamIds] = useState(member.access.teamIds);
  const [primaryTeamId, setPrimaryTeamId] = useState(member.access.primaryTeamId);
  const [accesses, setAccesses] = useState(member.access.locations);
  const [busy, setBusy] = useState(false);
  function updateLocation(id: string, patch: Partial<MemberAccessInput["locations"][number]>) {
    setAccesses(current => current.map(location => location.locationId === id ? { ...location, ...patch } : patch.type === "PRIMARY" && location.type === "PRIMARY" ? { ...location, type: "SECONDARY" } : location));
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const result = await updateMemberAccessAction({ memberId: member.id, role, teamIds, primaryTeamId, locations: accesses });
      if (result.error) {
        toast.add({
          title: "Erro ao salvar acessos",
          description: result.error,
          type: "error",
        });
      } else {
        toast.add({
          title: "Acessos atualizados",
          description: `Os acessos de ${member.name} foram salvos com sucesso.`,
          type: "success",
        });
        router.refresh();
        onClose();
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Não foi possível salvar os acessos. Tente novamente.",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }
  return <Modal open title={`Acessos de ${member.name}`} onClose={() => { if (!busy) onClose(); }} className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto">
    <form onSubmit={submit} className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">Defina o que esta pessoa pode fazer e onde pode atuar. A alteração vale no próximo acesso, inclusive em uma sessão já aberta.</p>
      <Field><FieldLabel htmlFor="member-role">Permissão</FieldLabel><NativeSelect id="member-role" value={role} onChange={e => setRole(e.target.value as typeof role)} className="w-full">{Object.entries(roles).filter(([value]) => userRole === "OWNER" || value !== "ADMIN").map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></Field>
      <fieldset className="flex flex-col gap-3"><legend className="font-semibold mb-2">Equipes</legend>
        {!teams.length && <p className="text-sm text-muted-foreground">Cadastre uma equipe para vincular esta pessoa.</p>}
        {teams.map(team => <label key={team.id} className="flex min-h-11 items-center gap-3 rounded-lg border p-3"><input type="checkbox" checked={teamIds.includes(team.id)} onChange={e => { const next = e.target.checked ? [...teamIds, team.id] : teamIds.filter(id => id !== team.id); setTeamIds(next); if (!next.includes(primaryTeamId)) setPrimaryTeamId(next[0] ?? ""); }} /><span>{team.name}</span></label>)}
        {teamIds.length > 0 && <Field><FieldLabel htmlFor="primary-team">Equipe principal</FieldLabel><NativeSelect id="primary-team" value={primaryTeamId} onChange={e => setPrimaryTeamId(e.target.value)} className="w-full">{teams.filter(team => teamIds.includes(team.id)).map(team => <NativeSelectOption key={team.id} value={team.id}>{team.name}</NativeSelectOption>)}</NativeSelect></Field>}
      </fieldset>
      <fieldset className="flex flex-col gap-3"><legend className="font-semibold mb-2">Unidades e vigência do acesso</legend>
        {!locations.length && <p className="text-sm text-muted-foreground">Cadastre uma unidade para liberar acesso operacional.</p>}
        {locations.map(location => { const access = accesses.find(item => item.locationId === location.id); return <div key={location.id} className="rounded-xl border p-3 flex flex-col gap-3">
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={!!access} onChange={e => setAccesses(current => e.target.checked ? [...current, { locationId: location.id, type: current.length ? "SECONDARY" : "PRIMARY", startsAt: null, expiresAt: null }] : current.filter(item => item.locationId !== location.id))} /><span className="font-medium">{location.name}</span></label>
          {access && <><Field><FieldLabel htmlFor={`type-${location.id}`}>Tipo de acesso</FieldLabel><NativeSelect id={`type-${location.id}`} value={access.type} className="w-full" onChange={e => updateLocation(location.id, { type: e.target.value as typeof access.type })}><NativeSelectOption value="PRIMARY">Unidade principal</NativeSelectOption><NativeSelectOption value="SECONDARY">Unidade adicional</NativeSelectOption><NativeSelectOption value="TEMPORARY">Acesso temporário</NativeSelectOption></NativeSelect></Field>
            <div className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel htmlFor={`start-${location.id}`}>Início {access.type === "TEMPORARY" ? "*" : "(opcional)"}</FieldLabel><Input id={`start-${location.id}`} type="datetime-local" required={access.type === "TEMPORARY"} value={localTime(access.startsAt)} onChange={e => updateLocation(location.id, { startsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} /></Field><Field><FieldLabel htmlFor={`end-${location.id}`}>Fim {access.type === "TEMPORARY" ? "*" : "(opcional)"}</FieldLabel><Input id={`end-${location.id}`} type="datetime-local" required={access.type === "TEMPORARY"} value={localTime(access.expiresAt)} onChange={e => updateLocation(location.id, { expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null })} /></Field></div>
          </>}
        </div>; })}
        <p className="text-xs text-muted-foreground">Datas e horários no fuso deste dispositivo. Acesso temporário é revogado automaticamente no horário final.</p>
      </fieldset>
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Voltar</Button><Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar acessos"}</Button></div>
    </form>
  </Modal>;
}
