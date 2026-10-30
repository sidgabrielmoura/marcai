import { getAuthenticatedContext } from "@/application/security/auth-context";
import { isManagement } from "@/application/security/operational-scope";
import { redirect } from "next/navigation";
import { getSession } from "@/infrastructure/security/session";
import { PushNotificationRegistrar } from "@/presentation/components/shared/push-notification-registrar";

export default async function ManagementLayout({ children }: { children: React.ReactNode }) {
  const context = await getAuthenticatedContext();
  if (!context || !isManagement(context)) redirect("/tasks");
  const session = await getSession();
  return <>{session?.sessionId && <PushNotificationRegistrar key={session.sessionId} sessionId={session.sessionId} />}{children}</>;
}
