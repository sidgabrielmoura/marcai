import { getAuthenticatedContext } from "@/application/security/auth-context";
import { getSession } from "@/infrastructure/security/session";
import { EmployeeShell } from "@/presentation/components/mobile/employee-shell";
import { NotificationStatus } from "@/presentation/components/mobile/notification-status";

export default async function NotificationStatusPage() {
  const context = await getAuthenticatedContext();
  const session = await getSession();
  if (!context || !session?.sessionId) return null;
  return <EmployeeShell userName={context.userName} orgName={context.organizationName} role={context.role} userId={context.userId}>
    <NotificationStatus sessionId={session.sessionId} />
  </EmployeeShell>;
}
