import { getAuthenticatedContext } from "@/application/security/auth-context";
import { isManagement } from "@/application/security/operational-scope";
import { redirect } from "next/navigation";

export default async function ManagementLayout({ children }: { children: React.ReactNode }) {
  const context = await getAuthenticatedContext();
  if (!context || !isManagement(context)) redirect("/tasks");
  return children;
}
