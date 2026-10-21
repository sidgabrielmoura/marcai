"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Users, ShieldAlert, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { PlatformPanel } from "@/presentation/components/superadmin/superadmin-ui";
import { ProcessEditorWizard } from "@/presentation/components/processes/process-editor-wizard";
import {
  templateJobs,
  templateToProcess,
  wizardToTemplate,
  type ReusableTemplateDefinition,
  type TemplateJob,
} from "@/domain/rules/reusable-template-definition";
import { savePlatformTemplateDefinitionAction } from "@/presentation/actions/superadmin-actions";

export interface SuperadminTemplateEditorProps {
  segment: {
    id: string;
    name: string;
    slug: string;
  };
  templateId?: string;
  initial: ReusableTemplateDefinition;
}

export function SuperadminTemplateEditor({
  segment,
  templateId,
  initial,
}: SuperadminTemplateEditorProps) {
  const [identity, setIdentity] = useState({ id: templateId });
  const [jobKey, setJobKey] = useState<TemplateJob>(initial.jobKey || "CUSTOM");
  const [teamSlots, setTeamSlots] = useState(
    initial.teamSlots?.length
      ? initial.teamSlots
      : [{ id: "team-1", label: "Operação" }]
  );
  const [memberSlots, setMemberSlots] = useState(
    initial.memberSlots?.length
      ? initial.memberSlots
      : [
          { id: "executor-1", label: "Executor", kind: "EXECUTOR" as const },
          { id: "approver-1", label: "Gestor", kind: "APPROVER" as const },
        ]
  );
  const [savedMetadata, setSavedMetadata] = useState(() =>
    JSON.stringify({ jobKey, teamSlots, memberSlots })
  );

  const [start] = useState(() =>
    templateToProcess(
      initial,
      {
        locationId: "template-unit",
        timezone: "America/Sao_Paulo",
        teams: Object.fromEntries(teamSlots.map((s) => [s.id, s.id])),
        members: Object.fromEntries(memberSlots.map((s) => [s.id, s.id])),
      },
      false
    )
  );

  const teams = useMemo(
    () => teamSlots.map((s) => ({ id: s.id, name: s.label || "Papel sem nome" })),
    [teamSlots]
  );

  const members = useMemo(
    () =>
      memberSlots.map((s) => ({
        id: s.id,
        name: s.label || "Papel sem nome",
        role: s.kind === "APPROVER" ? "ADMIN" : "EMPLOYEE",
        teamIds: teamSlots.map((t) => t.id),
        locationIds: ["template-unit"],
      })),
    [memberSlots, teamSlots]
  );

  return (
    <div className="space-y-6">
      <PlatformPanel
        title="Papéis recomendados do template"
        description={`Segmento: ${segment.name}. Defina as funções genéricas deste modelo (ex: "Cozinha", "Caixa", "Fiscal de Loja"). Ao ativar este template em uma empresa, a gestão mapeará seus colaboradores reais para estes papéis.`}
        className="sa-list-panel"
      >
        <div className="space-y-5">
          <div className="max-w-xs">
            <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1.5">
              Ramo / Categoria de Processo
            </label>
            <NativeSelect
              value={jobKey}
              onChange={(e) => setJobKey(e.target.value as TemplateJob)}
              className="w-full h-10 rounded-xl"
            >
              {Object.entries(templateJobs).map(([key, label]) => (
                <NativeSelectOption value={key} key={key}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Equipes */}
            <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] p-4 bg-[var(--canvas)]/40">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                    Papéis de Equipe
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Áreas responsáveis pelas etapas.
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {teamSlots.length} equipe(s)
                </Badge>
              </div>

              <div className="space-y-2">
                {teamSlots.map((slot, index) => (
                  <div key={slot.id} className="flex items-center gap-2">
                    <Input
                      aria-label={`Nome da equipe ${index + 1}`}
                      value={slot.label}
                      placeholder="Ex: Operação, Limpeza, Cozinha"
                      onChange={(e) =>
                        setTeamSlots((current) =>
                          current.map((t) =>
                            t.id === slot.id ? { ...t, label: e.target.value } : t
                          )
                        )
                      }
                      className="h-9 text-xs bg-[var(--surface)]"
                    />
                    {teamSlots.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remover equipe ${slot.label || index + 1}`}
                        onClick={() =>
                          setTeamSlots((current) =>
                            current.filter((t) => t.id !== slot.id)
                          )
                        }
                        className="size-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setTeamSlots((current) => [
                    ...current,
                    { id: `team-${crypto.randomUUID().slice(0, 8)}`, label: "" },
                  ])
                }
                className="w-full text-xs gap-1.5 h-8 mt-1"
              >
                <Plus className="size-3.5" />
                Adicionar equipe
              </Button>
            </div>

            {/* Executores e Aprovadores */}
            <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] p-4 bg-[var(--canvas)]/40">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                    Papéis de Responsáveis
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Funções operacionais e níveis de aprovação.
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {memberSlots.length} papel(éis)
                </Badge>
              </div>

              <div className="space-y-2">
                {memberSlots.map((slot, index) => (
                  <div key={slot.id} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <Input
                        aria-label={`Nome do responsável ${index + 1}`}
                        value={slot.label}
                        placeholder={
                          slot.kind === "APPROVER"
                            ? "Ex: Gerente, Supervisor"
                            : "Ex: Atendente, Cozinheiro"
                        }
                        onChange={(e) =>
                          setMemberSlots((current) =>
                            current.map((t) =>
                              t.id === slot.id ? { ...t, label: e.target.value } : t
                            )
                          )
                        }
                        className="h-9 text-xs bg-[var(--surface)] flex-1"
                      />
                      <Badge
                        variant="secondary"
                        className="text-[10px] shrink-0 font-normal px-2"
                      >
                        {slot.kind === "APPROVER" ? "Aprovador" : "Executor"}
                      </Badge>
                    </div>

                    {memberSlots.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remover responsável ${slot.label || index + 1}`}
                        onClick={() =>
                          setMemberSlots((current) =>
                            current.filter((t) => t.id !== slot.id)
                          )
                        }
                        className="size-8 text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setMemberSlots((current) => [
                      ...current,
                      {
                        id: `executor-${crypto.randomUUID().slice(0, 8)}`,
                        label: "",
                        kind: "EXECUTOR",
                      },
                    ])
                  }
                  className="flex-1 text-xs gap-1.5 h-8"
                >
                  <Plus className="size-3.5" />
                  Executor
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setMemberSlots((current) => [
                      ...current,
                      {
                        id: `approver-${crypto.randomUUID().slice(0, 8)}`,
                        label: "",
                        kind: "APPROVER",
                      },
                    ])
                  }
                  className="flex-1 text-xs gap-1.5 h-8"
                >
                  <Plus className="size-3.5" />
                  Aprovador
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PlatformPanel>

      <ProcessEditorWizard
        templateMode
        hideHeader
        metadataDirty={savedMetadata !== JSON.stringify({ jobKey, teamSlots, memberSlots })}
        locations={[{ id: "template-unit", name: "Unidade definida na ativação" }]}
        teams={teams}
        members={members}
        initial={start}
        returnUrl={`/superadmin?view=templates&segment=${segment.id}`}
        onSaveDefinition={async (d, publish) => {
          const templateDef = wizardToTemplate(d, { jobKey, teamSlots, memberSlots });
          const result = await savePlatformTemplateDefinitionAction({
            id: identity.id,
            segmentId: segment.id,
            definition: templateDef,
          });

          if (result.error) {
            return { error: result.error };
          }

          if (result.id) {
            setIdentity({ id: result.id });
            setSavedMetadata(JSON.stringify({ jobKey, teamSlots, memberSlots }));
          }

          return { data: { id: result.id || identity.id || "" } };
        }}
      />
    </div>
  );
}
