"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  Layers,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "../shared/empty-state";
import {
  PlatformIdentity,
  PlatformMetric,
  PlatformPanel,
  PlatformStatus,
} from "./superadmin-ui";
import type { GlobalOrg } from "./superadmin-dashboard-client";

export interface PlatformOverviewData {
  contractedOrganizations: number;
  expiringOrganizations: number;
  overLimitOrganizations: number;
  largestOrganizations: { id: string; name: string; membersCount: number }[];
}

type Metrics = {
  totalOrgs: number;
  activeOrgs: number;
  suspendedOrgs: number;
  totalUsers: number;
  totalProcesses: number;
  totalTasks: number;
};

export function PlatformOverview({
  metrics,
  data,
  organizations,
}: {
  metrics: Metrics;
  data: PlatformOverviewData;
  organizations: GlobalOrg[];
}) {
  const activePercent = metrics.totalOrgs
    ? Math.round((metrics.activeOrgs / metrics.totalOrgs) * 100)
    : 0;
  const maxMembers = Math.max(
    1,
    ...data.largestOrganizations.map((org) => org.membersCount),
  );
  return (
    <>
      <section className="sa-metrics" aria-label="Resumo da plataforma">
        <PlatformMetric
          featured
          label="Organizações"
          value={metrics.totalOrgs}
          description={`${metrics.activeOrgs} ativas · ${metrics.suspendedOrgs} suspensas`}
          href="/superadmin?view=organizations"
        />
        <PlatformMetric
          label="Usuários"
          value={metrics.totalUsers}
          description="Pessoas cadastradas"
          href="/superadmin?view=users"
        />
        <PlatformMetric
          label="Processos"
          value={metrics.totalProcesses}
          description="Em todas as organizações"
          href="/superadmin?view=usage"
        />
        <PlatformMetric
          label="Tarefas"
          value={metrics.totalTasks}
          description="Registros não excluídos"
          href="/superadmin?view=usage"
        />
      </section>
      <div className="sa-overview-grid">
        <PlatformPanel
          title="Pessoas por organização"
          description="Maiores bases de pessoas ativas."
          className="sa-distribution"
          action={
            <Link className="sa-text-link" href="/superadmin?view=usage">
              Ver uso <ArrowRight size={14} />
            </Link>
          }
        >
          {data.largestOrganizations.length ? (
            <div className="sa-bars">
              {data.largestOrganizations.map((org, index) => (
                <Link
                  key={org.id}
                  href={`/superadmin?view=users&organization=${org.id}`}
                  className="sa-bar-item"
                >
                  <span className="sa-bar-value">{org.membersCount}</span>
                  <div className="sa-bar-track">
                    <div
                      className="sa-bar-fill"
                      data-highlight={index === 0 || undefined}
                      style={
                        {
                          "--bar-height": `${org.membersCount ? Math.max(3, (org.membersCount / maxMembers) * 100) : 0}%`,
                        } as CSSProperties
                      }
                    />
                  </div>
                  <span className="sa-bar-label" title={org.name}>
                    {org.name}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Users}
              title="Nenhuma organização"
              description="Cadastre o primeiro cliente para acompanhar a adoção."
            />
          )}
        </PlatformPanel>
        <PlatformPanel
          title="Organizações ativas"
          description="Situação atual da base de clientes."
          className="sa-health"
        >
          <div
            className="sa-donut"
            style={
              { "--active-angle": `${activePercent * 3.6}deg` } as CSSProperties
            }
            role="img"
            aria-label={`${activePercent}% das organizações estão ativas`}
          >
            <div>
              <strong>{activePercent}%</strong>
              <span>da base ativa</span>
            </div>
          </div>
          <div className="sa-legend">
            <span>
              <i />
              {metrics.activeOrgs} ativas
            </span>
            <span>
              <i />
              {metrics.suspendedOrgs} suspensas
            </span>
          </div>
        </PlatformPanel>
        <PlatformPanel
          title="Pontos de atenção"
          description="Prioridades para a administração."
          className="sa-attention"
        >
          <Link href="/superadmin?view=subscriptions">
            <span className="sa-attention-icon">
              <CalendarClock size={17} />
            </span>
            <span>
              <strong>Sem assinatura</strong>
              <small>
                {metrics.totalOrgs - data.contractedOrganizations} organizações
              </small>
            </span>
            <ArrowRight size={15} />
          </Link>
          <Link href="/superadmin?view=subscriptions">
            <span className="sa-attention-icon">
              <CalendarClock size={17} />
            </span>
            <span>
              <strong>Vigência a revisar</strong>
              <small>
                {data.expiringOrganizations} vencidas ou vencendo em 7 dias
              </small>
            </span>
            <ArrowRight size={15} />
          </Link>
          <Link href="/superadmin?view=usage">
            <span className="sa-attention-icon">
              <Layers size={17} />
            </span>
            <span>
              <strong>Acima dos limites</strong>
              <small>
                {data.overLimitOrganizations}{" "}
                {data.overLimitOrganizations === 1
                  ? "organização"
                  : "organizações"}
              </small>
            </span>
            <ArrowRight size={15} />
          </Link>
        </PlatformPanel>
        <PlatformPanel
          title="Organizações recentes"
          description="Os últimos clientes cadastrados na plataforma."
          className="sa-recent"
          action={
            <Link
              className="sa-text-link"
              href="/superadmin?view=organizations"
            >
              Ver todas <ArrowRight size={14} />
            </Link>
          }
        >
          {organizations.length ? (
            <div className="sa-recent-list">
              {organizations.slice(0, 4).map((org) => (
                <Link
                  key={org.id}
                  href={`/superadmin?view=organizations&organization=${org.id}`}
                >
                  <PlatformIdentity
                    name={org.name}
                    description={`/${org.slug}`}
                  />
                  <PlatformStatus
                    tone={org.status === "ACTIVE" ? "success" : "danger"}
                  >
                    {org.status === "ACTIVE" ? "Ativa" : "Suspensa"}
                  </PlatformStatus>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Building2}
              title="Sua base começa aqui"
              description="Adicione uma organização pelo botão no topo da página."
            />
          )}
        </PlatformPanel>
        <PlatformPanel
          title="Administração"
          description="Acesse as rotinas da plataforma."
          className="sa-shortcuts"
        >
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/superadmin?view=users" />}
          >
            <Users data-icon="inline-start" />
            Gerenciar usuários
            <ArrowRight data-icon="inline-end" />
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/superadmin?view=subscriptions" />}
          >
            <CalendarClock data-icon="inline-start" />
            Planos e assinaturas
            <ArrowRight data-icon="inline-end" />
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/superadmin?view=support" />}
          >
            <Building2 data-icon="inline-start" />
            Histórico de suporte
            <ArrowRight data-icon="inline-end" />
          </Button>
          <p>
            Dados atuais da plataforma. As alterações ficam registradas na
            auditoria.
          </p>
        </PlatformPanel>
      </div>
    </>
  );
}
