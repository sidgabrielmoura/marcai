import { AppShell } from "../shared/app-shell";

export function EmployeeShell({
  role = "EMPLOYEE",
  ...props
}: {
  children: React.ReactNode;
  userName: string;
  orgName: string;
  role?: string;
}) {
  return (
    <AppShell
      {...props}
      role={role}
      mode={role === "EMPLOYEE" ? "employee" : "management"}
    />
  );
}
