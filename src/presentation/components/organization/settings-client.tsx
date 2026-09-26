"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Settings,
  Shield,
  Clock,
  Database,
  CheckCircle2,
  AlertCircle,
  Save,
  Trash2,
  Info,
} from "lucide-react";
import {
  updateOrganizationSettingsAction,
  executeRetentionPurgeAction,
} from "@/presentation/actions/org-management-actions";

import { PageHeader } from "@/presentation/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

interface SettingsClientProps {
  organization: {
    id: string;
    name: string;
    slug: string;
    status: string;
    settings?: any;
  };
  userRole: string;
}

export function SettingsClient({
  organization,
  userRole,
}: SettingsClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>("org");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const orgSettings = organization.settings || {};
  const [policy, setPolicy] = useState(
    orgSettings.earlyExecutionPolicy || "ALLOW_AND_LOG",
  );

  const initialMilestones: number[] =
    Array.isArray(orgSettings.delayMilestones) && orgSettings.delayMilestones.length > 0
      ? orgSettings.delayMilestones
      : [15, 30, 60, 120];

  const [milestones, setMilestones] = useState<{ [stage: number]: number }>({
    1: initialMilestones[0] ?? 15,
    2: initialMilestones[1] ?? 30,
    3: initialMilestones[2] ?? 60,
    4: initialMilestones[3] ?? 120,
  });

  const [purgeLoading, setPurgeLoading] = useState(false);
  const [purgeResult, setPurgeResult] = useState<string | null>(null);

  async function handleRunPurge() {
    setPurgeLoading(true);
    setPurgeResult(null);
    try {
      const res = await executeRetentionPurgeAction();
      if (res.success && res.data) {
        const d = res.data as { trashedTasksPurged: number; evidencesPurged: number; executionsArchived: number };
        setPurgeResult(`Expurgo concluído: ${d.trashedTasksPurged} tarefas excluídas, ${d.evidencesPurged} arquivos removidos, ${d.executionsArchived} execuções arquivadas.`);
      } else {
        setPurgeResult(res.error || "Erro ao executar expurgo.");
      }
    } catch {
      setPurgeResult("Erro ao executar expurgo.");
    } finally {
      setPurgeLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    const formData = new FormData(e.currentTarget);
    if (!formData.get("earlyExecutionPolicy") && policy) {
      formData.set("earlyExecutionPolicy", policy);
    }
    try {
      const res = await updateOrganizationSettingsAction(formData);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg("Configurações atualizadas.");
        router.refresh();
      }
    } catch {
      setErrorMsg("Erro ao atualizar configurações.");
    } finally {
      setLoading(false);
    }
  }

  const tabs = [
    { id: "org", label: "Organização", icon: Settings },
    { id: "sla", label: "Prazos e alertas", icon: Clock },
    { id: "security", label: "Acesso", icon: Shield },
    { id: "retention", label: "Histórico", icon: Database },
  ];

  return (
    <div className="w-full">
      <PageHeader
        title="Configurações"
        subtitle="Ajuste os dados da organização, os prazos e os acessos."
      />

      {errorMsg && (
        <Alert variant="destructive">
          <AlertCircle className="size-4 shrink-0" />
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}

      {successMsg && (
        <Alert className="bg-emerald-50 border-emerald-200 text-emerald-800">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
          <AlertDescription>{successMsg}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as string)}
          className="w-full"
        >
          <TabsList className="bg-canvas border border-(--border-subtle) p-1 rounded-[14px] h-fit! flex flex-wrap gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="gap-1.5 px-3.5 py-2 text-(length:--type-label) font-semibold rounded-[10px] data-active:bg-surface data-active:text-brand-900"
                >
                  <Icon className="size-4" data-icon="inline-start" />
                  <span>{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="org" keepMounted>
            <Card className="p-6">
              <CardContent className="p-0 flex flex-col gap-4">
                <h3 className="text-[var(--text-primary)] text-[length:var(--type-card-title)] font-bold">
                  Dados da organização
                </h3>

                <Field>
                  <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                    Nome da empresa
                  </FieldLabel>
                  <Input
                    aria-label="Nome da empresa"
                    type="text"
                    name="name"
                    defaultValue={organization.name}
                    required
                    className="bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] h-10"
                  />
                </Field>

                <Field>
                  <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                    Código da empresa
                  </FieldLabel>
                  <Input
                    aria-label="Código da empresa"
                    type="text"
                    value={organization.slug}
                    disabled
                    className="bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] h-10 opacity-70 font-mono"
                  />
                  <FieldDescription className="text-[length:var(--type-caption)] text-[var(--text-secondary)]">
                    Este código é fixo e identifica a empresa no acesso por PIN.
                  </FieldDescription>
                </Field>

                <Field className="flex flex-col gap-2">
                  <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                    Início de rotinas antes do horário previsto
                  </FieldLabel>
                  <FieldDescription className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Define o comportamento do sistema quando um colaborador tenta iniciar uma rotina ou tarefa antes do horário oficial agendado (ex.: a rotina está programada para 08:00, mas o colaborador chegou às 07:30 e deseja iniciar o checklist).
                  </FieldDescription>
                  <NativeSelect
                    name="earlyExecutionPolicy"
                    value={policy}
                    onChange={(e) => setPolicy(e.target.value)}
                    className="w-full h-10"
                  >
                    <NativeSelectOption value="ALLOW_AND_LOG">
                      Permitir e registrar no histórico (Recomendado) — Inicia livremente e registra o adiantamento para auditoria
                    </NativeSelectOption>
                    <NativeSelectOption value="ALLOW">
                      Permitir livremente — Colaborador inicia a qualquer momento sem avisos especiais
                    </NativeSelectOption>
                    <NativeSelectOption value="ALLOW_AND_ALERT">
                      Permitir com aviso ao gestor — Colaborador inicia e o gestor recebe notificação imediata
                    </NativeSelectOption>
                    <NativeSelectOption value="BLOCK">
                      Bloquear execução antecipada — Só permite iniciar a partir do minuto exato agendado
                    </NativeSelectOption>
                  </NativeSelect>

                  <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 text-xs text-slate-700 flex items-start gap-2.5 mt-1">
                    <Info className="size-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      {policy === "ALLOW_AND_LOG" && (
                        <span><strong>Como funciona na prática:</strong> O colaborador não fica travado se quiser adiantar o trabalho. A execução é liberada e o sistema anota que foi iniciada antes do horário para seus relatórios de pontualidade.</span>
                      )}
                      {policy === "ALLOW" && (
                        <span><strong>Como funciona na prática:</strong> Total flexibilidade. Tarefas programadas podem ser abertas e preenchidas a qualquer momento sem restrições.</span>
                      )}
                      {policy === "ALLOW_AND_ALERT" && (
                        <span><strong>Como funciona na prática:</strong> O colaborador consegue iniciar a tarefa antes da hora, mas o sistema envia uma notificação aos gestores da unidade/equipe avisando do adiantamento.</span>
                      )}
                      {policy === "BLOCK" && (
                        <span><strong>Como funciona na prática:</strong> Controle rígido. O colaborador visualiza a tarefa na lista, mas o botão de início permanece travado até o horário agendado.</span>
                      )}
                    </div>
                  </div>
                </Field>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba SLA */}
          <TabsContent value="sla" keepMounted>
            <Card className="p-6">
              <CardContent className="p-0 flex flex-col gap-5">
                <div>
                  <h3 className="text-[var(--text-primary)] text-[length:var(--type-card-title)] font-bold">
                    Alertas progressivos de atraso
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                    Quando uma tarefa ultrapassar o prazo estipulado (SLA), o sistema enviará notificações em fases para garantir que a equipe não perca os prazos. Escolha o tempo de tolerância para cada alerta.
                  </p>
                </div>

                {/* Input oculto com a lista de minutos separados por vírgula */}
                <input
                  type="hidden"
                  name="delayMilestones"
                  value={Object.values(milestones)
                    .filter((m) => m > 0)
                    .sort((a, b) => a - b)
                    .join(",")}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Card 1 */}
                  <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/40 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="size-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                          1º
                        </div>
                        <span className="font-semibold text-sm text-[var(--brand-900)]">
                          Lembrete de Tolerância
                        </span>
                      </div>
                      <span className="text-[10px] font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        Início do atraso
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Primeiro aviso à equipe assim que o prazo limite da tarefa expirar.
                    </p>
                    <div className="mt-1">
                      <NativeSelect
                        value={milestones[1]}
                        onChange={(e) =>
                          setMilestones((prev) => ({
                            ...prev,
                            1: Number(e.target.value),
                          }))
                        }
                        className="w-full h-9 bg-white"
                      >
                        <NativeSelectOption value={5}>5 minutos de atraso</NativeSelectOption>
                        <NativeSelectOption value={10}>10 minutos de atraso</NativeSelectOption>
                        <NativeSelectOption value={15}>15 minutos de atraso (Padrão)</NativeSelectOption>
                        <NativeSelectOption value={20}>20 minutos de atraso</NativeSelectOption>
                        <NativeSelectOption value={30}>30 minutos de atraso</NativeSelectOption>
                      </NativeSelect>
                    </div>
                  </div>

                  {/* Card 2 */}
                  <div className="p-4 rounded-xl border border-amber-100 bg-amber-50/40 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="size-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs">
                          2º
                        </div>
                        <span className="font-semibold text-sm text-[var(--brand-900)]">
                          Atenção Operacional
                        </span>
                      </div>
                      <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                        Atraso moderado
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Segundo aviso caso a tarefa permaneça sem finalização.
                    </p>
                    <div className="mt-1">
                      <NativeSelect
                        value={milestones[2]}
                        onChange={(e) =>
                          setMilestones((prev) => ({
                            ...prev,
                            2: Number(e.target.value),
                          }))
                        }
                        className="w-full h-9 bg-white"
                      >
                        <NativeSelectOption value={15}>15 minutos de atraso</NativeSelectOption>
                        <NativeSelectOption value={30}>30 minutos de atraso (Padrão)</NativeSelectOption>
                        <NativeSelectOption value={45}>45 minutos de atraso</NativeSelectOption>
                        <NativeSelectOption value={60}>60 minutos (1 hora)</NativeSelectOption>
                        <NativeSelectOption value={90}>90 minutos (1h 30m)</NativeSelectOption>
                      </NativeSelect>
                    </div>
                  </div>

                  {/* Card 3 */}
                  <div className="p-4 rounded-xl border border-orange-100 bg-orange-50/40 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="size-7 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-xs">
                          3º
                        </div>
                        <span className="font-semibold text-sm text-[var(--brand-900)]">
                          Atraso Crítico
                        </span>
                      </div>
                      <span className="text-[10px] font-medium bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                        Aviso aos gestores
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Notificação direta aos gestores e supervisores da equipe.
                    </p>
                    <div className="mt-1">
                      <NativeSelect
                        value={milestones[3]}
                        onChange={(e) =>
                          setMilestones((prev) => ({
                            ...prev,
                            3: Number(e.target.value),
                          }))
                        }
                        className="w-full h-9 bg-white"
                      >
                        <NativeSelectOption value={45}>45 minutos de atraso</NativeSelectOption>
                        <NativeSelectOption value={60}>60 minutos (1 hora - Padrão)</NativeSelectOption>
                        <NativeSelectOption value={90}>90 minutos (1h 30m)</NativeSelectOption>
                        <NativeSelectOption value={120}>120 minutos (2 horas)</NativeSelectOption>
                        <NativeSelectOption value={180}>180 minutos (3 horas)</NativeSelectOption>
                      </NativeSelect>
                    </div>
                  </div>

                  {/* Card 4 */}
                  <div className="p-4 rounded-xl border border-red-100 bg-red-50/40 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="size-7 rounded-lg bg-red-100 text-red-700 flex items-center justify-center font-bold text-xs">
                          4º
                        </div>
                        <span className="font-semibold text-sm text-[var(--brand-900)]">
                          Incidente Grave
                        </span>
                      </div>
                      <span className="text-[10px] font-medium bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                        Escalação máxima
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Alerta máximo por estouro severo de prazo de entrega.
                    </p>
                    <div className="mt-1">
                      <NativeSelect
                        value={milestones[4]}
                        onChange={(e) =>
                          setMilestones((prev) => ({
                            ...prev,
                            4: Number(e.target.value),
                          }))
                        }
                        className="w-full h-9 bg-white"
                      >
                        <NativeSelectOption value={90}>90 minutos (1h 30m)</NativeSelectOption>
                        <NativeSelectOption value={120}>120 minutos (2 horas - Padrão)</NativeSelectOption>
                        <NativeSelectOption value={180}>180 minutos (3 horas)</NativeSelectOption>
                        <NativeSelectOption value={240}>240 minutos (4 horas)</NativeSelectOption>
                        <NativeSelectOption value={0}>Desativar 4º alerta</NativeSelectOption>
                      </NativeSelect>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba Segurança */}
          <TabsContent value="security" keepMounted>
            <Card className="p-6">
              <CardContent className="p-0 flex flex-col gap-4">
                <h3 className="text-[var(--text-primary)] text-[length:var(--type-card-title)] font-bold">
                  Permissões e acesso
                </h3>

                <p className="text-[length:var(--type-label)] text-[var(--text-secondary)]">
                  Na área de pessoas, adicione colaboradores, defina permissões
                  e redefina PINs.
                </p>
                <div>
                  <Button nativeButton={false}
                    variant="outline"
                    size="sm"
                    render={<Link href="/management/people" />}
                    className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]"
                  >
                    Gerenciar pessoas e acessos
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba Retenção */}
          <TabsContent value="retention" keepMounted>
            <Card className="p-6">
              <CardContent className="p-0 flex flex-col gap-5">
                <div>
                  <h3 className="text-[var(--text-primary)] text-[length:var(--type-card-title)] font-bold">
                    Tempo de armazenamento do histórico
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                    Configure por quanto tempo os dados da sua empresa permanecem guardados. Isso garante que você tenha histórico suficiente para relatórios e auditorias sem acumular lixo desnecessário no banco de dados.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Card Histórico Operacional */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col gap-2.5 shadow-xs">
                    <div className="flex items-center gap-2">
                      <div className="size-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                        <Database className="size-4" />
                      </div>
                      <span className="font-semibold text-sm text-[var(--brand-900)]">
                        Histórico de Execuções e Tarefas
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      Tempo em que checklists realizados, evidências e dados de conclusão ficam salvos para consultas em relatórios e auditorias.
                    </p>
                    <div className="mt-1">
                      <NativeSelect
                        name="operationalRetentionMonths"
                        defaultValue={String(orgSettings.operationalRetentionMonths || 12)}
                        className="w-full h-9 bg-slate-50"
                      >
                        <NativeSelectOption value="6">6 meses</NativeSelectOption>
                        <NativeSelectOption value="12">1 ano (Recomendado — Padrão)</NativeSelectOption>
                        <NativeSelectOption value="24">2 anos</NativeSelectOption>
                        <NativeSelectOption value="36">3 anos</NativeSelectOption>
                        <NativeSelectOption value="60">5 anos (Conformidade estendida)</NativeSelectOption>
                      </NativeSelect>
                    </div>
                  </div>

                  {/* Card Limpeza da Lixeira */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col gap-2.5 shadow-xs">
                    <div className="flex items-center gap-2">
                      <div className="size-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                        <Trash2 className="size-4" />
                      </div>
                      <span className="font-semibold text-sm text-[var(--brand-900)]">
                        Lixeira e Histórico de Alertas
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      Tarefas excluídas e logs temporários de alertas de atraso são mantidos por esse período antes de serem apagados definitivamente.
                    </p>
                    <div className="mt-1">
                      <NativeSelect
                        name="delayRetentionDays"
                        defaultValue={String(orgSettings.delayRetentionDays || 90)}
                        className="w-full h-9 bg-slate-50"
                      >
                        <NativeSelectOption value="30">30 dias (1 mês)</NativeSelectOption>
                        <NativeSelectOption value="60">60 dias (2 meses)</NativeSelectOption>
                        <NativeSelectOption value="90">90 dias (3 meses — Recomendado)</NativeSelectOption>
                        <NativeSelectOption value="180">180 dias (6 meses)</NativeSelectOption>
                        <NativeSelectOption value="365">1 ano</NativeSelectOption>
                      </NativeSelect>
                    </div>
                  </div>
                </div>

                <div className="mt-2 pt-4 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-[var(--brand-900)]">
                      Executar expurgo manual agora
                    </h4>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Aplica as regras acima imediatamente: remove permanentemente itens na lixeira há mais tempo que o configurado e arquiva históricos antigos.
                    </p>
                    {purgeResult && (
                      <p className="text-xs text-[var(--brand-700)] font-medium mt-1">
                        {purgeResult}
                      </p>
                    )}
                  </div>
                  {["OWNER", "ADMIN"].includes(userRole) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={purgeLoading}
                      onClick={handleRunPurge}
                      className="shrink-0 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="size-3.5 mr-1" />
                      <span>{purgeLoading ? "Processando..." : "Executar expurgo"}</span>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {["OWNER", "ADMIN"].includes(userRole) && activeTab !== "security" && (
          <Button
            type="submit"
            disabled={loading}
            className="w-full min-h-[48px] bg-[var(--brand-900)] text-white text-[length:var(--type-label)] font-semibold hover:bg-[var(--brand-700)] shadow-sm"
          >
            {loading ? (
              <Spinner className="size-4" data-icon="inline-start" />
            ) : (
              <Save className="size-4" data-icon="inline-start" />
            )}
            <span>
              {loading ? "Salvando alterações..." : "Salvar alterações"}
            </span>
          </Button>
        )}
      </form>
    </div>
  );
}
