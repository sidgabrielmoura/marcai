
"use client";

import { useState } from "react";
import { ArrowRight, Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

import { PageHeader } from "@/presentation/components/shared";
import {
  ProcessEditorWizard,
  type ProcessMemberOption,
} from "@/presentation/components/processes/process-editor-wizard";

import {
  templateToProcess,
  type TemplateItem,
  type TemplateBindings,
} from "@/domain/rules/reusable-template-definition";

import type { ProcessDefinition } from "@/domain/rules/process-definition";

type Option = {
  id: string;
  name: string;
};

export function TemplateProcessStarter({
  template,
  locations,
  teams,
  members,
}: {
  template: TemplateItem;
  locations: (Option & { timezone: string })[];
  teams: Option[];
  members: ProcessMemberOption[];
}) {
  const [bindings, setBindings] = useState<TemplateBindings>({
    locationId: locations.length === 1 ? locations[0].id : "",
    timezone:
      locations.length === 1
        ? locations[0].timezone
        : "America/Sao_Paulo",
    teams: {},
    members: {},
  });

  const [definition, setDefinition] =
    useState<ProcessDefinition | null>(null);

  const [error, setError] = useState("");

  const usedTeams = template.definition.teamSlots.filter((slot) =>
    template.definition.tasks.some(
      (task) => task.teamSlotId === slot.id,
    ),
  );

  const usedMembers = template.definition.memberSlots.filter((slot) =>
    template.definition.tasks.some(
      (task) =>
        task.assigneeSlotId === slot.id ||
        task.approverSlotIds.includes(slot.id),
    ),
  );

  function candidates(id: string, approver: boolean) {
    const taskTeams = [
      ...new Set(
        template.definition.tasks
          .filter((task) =>
            approver
              ? task.approverSlotIds.includes(id)
              : task.assigneeSlotId === id,
          )
          .map((task) => bindings.teams[task.teamSlotId]),
      ),
    ];

    return members.filter(
      (member) =>
        (!approver ||
          ["OWNER", "ADMIN", "MANAGER"].includes(member.role)) &&
        ((approver && ["OWNER", "ADMIN"].includes(member.role)) ||
          (member.locationIds.includes(bindings.locationId) &&
            taskTeams.every(
              (teamId) =>
                teamId && member.teamIds.includes(teamId),
            ))),
    );
  }

  function proceed() {
    if (
      !bindings.locationId ||
      usedTeams.some((slot) => !bindings.teams[slot.id])
    ) {
      setError("Escolha a unidade e uma equipe para cada papel.");
      return;
    }

    if (
      usedMembers.some(
        (slot) =>
          slot.kind === "APPROVER" && !bindings.members[slot.id],
      )
    ) {
      setError(
        "Escolha quem aprovará cada etapa. Você poderá editar as aprovações na revisão.",
      );
      return;
    }

    setError("");
    setDefinition(templateToProcess(template.definition, bindings));
  }

  if (definition) {
    return (
      <>
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-brand-soft p-3 text-xs text-brand-900">
          <Layers className="size-4" />

          <span>
            {template.name} · versão {template.version}. Personalize
            todas as etapas abaixo.
          </span>
        </div>

        <ProcessEditorWizard
          locations={locations}
          teams={teams}
          members={members}
          initial={definition}
          templateReference={template.reference}
        />
      </>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Prepare seu processo"
        subtitle={`${template.name} · escolha onde e com quem este fluxo será executado.`}
        backHref="/management/templates"
      />

      <section className="w-full! space-y-5 rounded-2xl border border-(--border-subtle) bg-surface p-5">
        <p className="text-sm text-muted-foreground">
          {template.description}
        </p>

        <label className="block text-sm font-medium">
          Unidade

          <NativeSelect
            className="mt-2"
            value={bindings.locationId}
            onChange={(event) =>
              setBindings((current) => ({
                ...current,
                locationId: event.target.value,
                timezone:
                  locations.find(
                    (location) =>
                      location.id === event.target.value,
                  )?.timezone ?? "America/Sao_Paulo",
                members: {},
              }))
            }
          >
            <NativeSelectOption value="">
              Escolha uma unidade
            </NativeSelectOption>

            {locations.map((location) => (
              <NativeSelectOption
                key={location.id}
                value={location.id}
              >
                {location.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>

        {usedTeams.map((slot) => (
          <label
            key={slot.id}
            className="block text-sm font-medium"
          >
            Equipe: {slot.label}

            <NativeSelect
              className="mt-2"
              value={bindings.teams[slot.id] ?? ""}
              onChange={(event) =>
                setBindings((current) => ({
                  ...current,
                  teams: {
                    ...current.teams,
                    [slot.id]: event.target.value,
                  },
                  members: {},
                }))
              }
            >
              <NativeSelectOption value="">
                Escolha uma equipe
              </NativeSelectOption>

              {teams.map((team) => (
                <NativeSelectOption
                  key={team.id}
                  value={team.id}
                >
                  {team.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        ))}

        {usedMembers.map((slot) => (
          <label
            key={slot.id}
            className="block text-sm font-medium"
          >
            {slot.kind === "APPROVER" ? "Aprovador" : "Responsável"}:
            {" "}
            {slot.label}

            <NativeSelect
              className="mt-2"
              value={bindings.members[slot.id] ?? ""}
              onChange={(event) =>
                setBindings((current) => ({
                  ...current,
                  members: {
                    ...current.members,
                    [slot.id]: event.target.value,
                  },
                }))
              }
            >
              <NativeSelectOption value="">
                {slot.kind === "EXECUTOR"
                  ? "Qualquer membro poderá assumir"
                  : "Escolha um aprovador"}
              </NativeSelectOption>

              {candidates(
                slot.id,
                slot.kind === "APPROVER",
              ).map((member) => (
                <NativeSelectOption
                  key={member.id}
                  value={member.id}
                >
                  {member.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        ))}

        {(!locations.length || !teams.length) && (
          <p className="text-sm text-muted-foreground">
            Cadastre uma unidade e uma equipe para usar este template.
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Revise os horários e as datas antes de salvar. As tarefas
          serão criadas ao salvar o processo.
        </p>

        <Button
          onClick={proceed}
          disabled={!locations.length || !teams.length}
        >
          Personalizar processo
          <ArrowRight className="size-4" />
        </Button>
      </section>
    </div>
  );
}
