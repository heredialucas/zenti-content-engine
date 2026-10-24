import { authIsConfigured, hasSession } from "@/src/lib/auth";
import { LoginForm } from "@/src/components/login-form";
import { Workspace } from "@/src/components/workspace";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!(await hasSession())) return <LoginForm configured={authIsConfigured()} />;
  return <Workspace />;
}
