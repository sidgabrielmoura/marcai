import { AppShell } from "../shared/app-shell";
import type { SubscriptionNotice } from "@/application/superadmin/manual-subscription";

export function ManagementShell(props: {
  children: React.ReactNode;
  userName: string;
  orgName: string;
  role: string;
  userId?: string;
  initialSubscriptionNotice?: SubscriptionNotice | null;
}) {
  return <AppShell {...props} mode="management" />;
}

