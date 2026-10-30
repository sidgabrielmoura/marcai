import { getAuthenticatedContext } from "@/application/security/auth-context";
import { getSession } from "@/infrastructure/security/session";
import { PushNotificationRegistrar } from "@/presentation/components/shared/push-notification-registrar";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  await getAuthenticatedContext();
  const session = await getSession();
  return <>{session?.sessionId && <PushNotificationRegistrar key={session.sessionId} sessionId={session.sessionId} />}{children}</>;
}
