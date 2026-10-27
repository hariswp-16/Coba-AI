import { LoginClient } from "@/components/auth/LoginClient";
import { authEnabled } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!authEnabled()) redirect("/");
  if (await isAuthenticated()) redirect("/");
  return <LoginClient />;
}
