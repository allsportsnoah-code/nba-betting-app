import Link from "next/link";
import { redirect } from "next/navigation";
import FoldPanel from "@/app/components/FoldPanel";
import EmailSettingsForm from "@/app/owner/EmailSettingsForm";
import ManualOddsForm from "@/app/owner/ManualOddsForm";
import { isOwnerLoggedIn } from "@/lib/ownerAuth";
import { readTunnelEmailRuntimeStatus, readTunnelEmailSettings } from "@/lib/tunnelEmailSettings";

export default async function OwnerPage() {
  if (!(await isOwnerLoggedIn())) {
    redirect("/login");
  }

  const [settings, runtimeStatus] = await Promise.all([
    readTunnelEmailSettings(),
    readTunnelEmailRuntimeStatus(),
  ]);

  return (
    <main className="mx-auto max-w-[88rem] px-6 py-8">
      <section className="app-card rounded-[2rem] p-6 mb-6">
        <div className="app-eyebrow mb-3">Owner controls</div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold text-slate-950">Owner</h1>
            <p className="mt-2 max-w-3xl text-slate-600">
              Control the tunnel link email timing and wording from the site.
            </p>
          </div>
          {runtimeStatus.latestUrl ? (
            <Link
              href={`${runtimeStatus.latestUrl}/mlb`}
              className="app-button app-button-secondary"
              target="_blank"
            >
              Open latest MLB link
            </Link>
          ) : null}
        </div>
      </section>

      <div className="grid gap-6">
        <FoldPanel
          eyebrow="Odds fallback"
          title="Manual Odds Import"
          summary="Paste a spreadsheet slate when the odds feed is unavailable."
          defaultOpen
        >
          <ManualOddsForm />
        </FoldPanel>

        <FoldPanel
          eyebrow="Email automation"
          title="Tunnel Link Email"
          summary="Pick one or more send times, choose how recipients receive it, and edit the message without touching code."
          defaultOpen
          badge={
            <span className="rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
              {settings.enabled ? "Enabled" : "Paused"}
            </span>
          }
        >
          <EmailSettingsForm initialSettings={settings} />
        </FoldPanel>

        <FoldPanel
          eyebrow="Current tunnel"
          title="Latest Email Status"
          summary="The most recent link and email send result from the tunnel starter."
          defaultOpen
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200/80 bg-white/78 p-4 text-sm text-slate-700 shadow-sm">
              <div className="mb-2 font-semibold text-slate-950">Latest URL</div>
              {runtimeStatus.latestUrl ? (
                <Link href={runtimeStatus.latestUrl} target="_blank" className="break-all text-teal-700">
                  {runtimeStatus.latestUrl}
                </Link>
              ) : (
                <span className="text-slate-500">No tunnel URL saved yet.</span>
              )}
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white/78 p-4 text-sm text-slate-700 shadow-sm">
              <div className="mb-2 font-semibold text-slate-950">Last Email Log</div>
              <div className="break-words text-slate-600">
                {runtimeStatus.lastEmailLog || "No email log saved yet."}
              </div>
            </div>
          </div>
        </FoldPanel>
      </div>
    </main>
  );
}
