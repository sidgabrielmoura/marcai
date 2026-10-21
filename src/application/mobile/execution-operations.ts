import type { AuthenticatedContext } from "@/application/security/auth-context";
import { taskScope } from "@/application/security/operational-scope";
import { resolveExecutionStatus } from "@/domain/rules/execution-state";
import { synchronizeExecution } from "@/application/tasks/synchronize-execution";
import { readable } from "./data";
import { idempotent } from "./idempotency";

/** The web action and mobile endpoint both finish through this transaction. */
export async function completeExecution(
  request: Request | null,
  context: AuthenticatedContext,
  executionId: string,
) {
  return idempotent(
    request,
    context,
    { operation: "complete-execution", executionId },
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"execution:" + executionId}))`;
      const execution = await tx.processExecution.findFirst({
        where: {
          id: executionId,
          organizationId: context.organizationId,
          tasks: {
            some:
              context.role === "EMPLOYEE"
                ? readable(context)
                : taskScope(context),
          },
        },
        include: {
          tasks: {
            where: { deletedAt: null },
            include: { approvalWorkflow: true },
          },
        },
      });
      if (!execution) return { error: "Execução de processo não encontrada." };
      const now = new Date();
      if (execution.status === "PAUSED")
        return { error: "Este processo está bloqueado pela gestão." };
      if (
        Math.max(
          execution.scheduledAt.getTime(),
          execution.availableAt.getTime(),
        ) > now.getTime()
      )
        return { error: "Aguarde o horário agendado do processo." };
      if (resolveExecutionStatus(execution, now) !== "COMPLETED")
        return {
          error:
            "Ainda existem etapas obrigatórias ou aprovações pendentes no processo.",
        };
      await synchronizeExecution(tx, context.organizationId, executionId, now);
      return { success: true };
    },
  );
}
