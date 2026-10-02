import { AppShell } from "../shared/app-shell";

export function ManagementShell(props: {
  children: React.ReactNode;
  userName: string;
  orgName: string;
  role: string;
  userId?: string;
}) {
  return <AppShell {...props} mode="management" />;
}

