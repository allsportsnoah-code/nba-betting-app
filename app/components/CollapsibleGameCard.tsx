import type { ReactNode } from "react";

type CollapsibleGameCardProps = {
  title: string;
  subtitle?: string | null;
  controls?: ReactNode;
  badges?: ReactNode;
  summary: ReactNode;
  details?: ReactNode;
  defaultOpen?: boolean;
};

export default function CollapsibleGameCard({
  title,
  subtitle,
  controls,
  badges,
  summary,
  details,
  defaultOpen = false,
}: CollapsibleGameCardProps) {
  return (
    <details open={defaultOpen} className="slate-game-card app-panel rounded-3xl p-5">
      <summary className="slate-game-summary list-none cursor-pointer">
        <div className="slate-game-summary-row flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <h2 className="slate-game-title text-xl font-semibold text-slate-950">{title}</h2>
            {subtitle ? <p className="slate-game-time text-sm text-slate-500">{subtitle}</p> : null}
            {badges ? <div className="slate-game-badges flex items-center gap-2 flex-wrap mt-2">{badges}</div> : null}
          </div>

          <span className="slate-game-toggle rounded-full border border-slate-200/80 bg-white/75 px-4 py-2 text-sm font-medium text-slate-700 transition">
            <span className="slate-game-toggle-closed">Expand</span>
            <span className="slate-game-toggle-open">Minimize</span>
          </span>
        </div>
      </summary>

      {controls ? <div className="slate-game-controls mt-4 flex items-center gap-3 flex-wrap">{controls}</div> : null}

      <div className="slate-game-content mt-4">{summary}</div>

      {details ? <div className="slate-game-details mt-4">{details}</div> : null}
    </details>
  );
}
