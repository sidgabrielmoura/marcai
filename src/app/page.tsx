import { getSession } from "@/infrastructure/security/session";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.role === "SUPERADMIN") {
    redirect("/superadmin");
  }

  if (session.role === "EMPLOYEE") {
    redirect("/tasks");
  } else {
    redirect("/overview");
  }
}
