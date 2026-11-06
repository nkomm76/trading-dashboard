import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/session";
import { getTotp } from "@/lib/auth-store";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await isLoggedIn()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="mb-1 text-lg font-semibold">Dividenden-Dashboard</h1>
        <p className="mb-5 text-sm text-muted">Bitte anmelden.</p>
        <LoginForm withCode={Boolean(await getTotp())} />
      </div>
    </main>
  );
}
