import { redirect } from "next/navigation";
import LoginForm from "@/app/login/LoginForm";
import { isOwnerLoggedIn } from "@/lib/ownerAuth";

export default async function LoginPage() {
  if (await isOwnerLoggedIn()) {
    redirect("/");
  }

  return (
    <main className="max-w-xl mx-auto p-8">
      <div className="app-card rounded-[2rem] p-8 mb-6">
        <div className="inline-flex items-center rounded-full border border-teal-700/15 bg-white/75 px-3 py-1 text-sm font-medium text-teal-900 mb-3">
          Owner access
        </div>
        <h1 className="text-4xl font-semibold text-slate-950 mb-2">Login</h1>
        <p className="text-slate-600">
          Owner login unlocks manual sync buttons and extra refreshes, while public visitors can still view the site.
        </p>
      </div>

      <LoginForm />
    </main>
  );
}
