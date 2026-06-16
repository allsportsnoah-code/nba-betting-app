import type { ReactNode } from "react";

type FoldPanelProps = {
  eyebrow?: string;
  title: string;
  summary?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
};

export default function FoldPanel({
  eyebrow,
  title,
  summary,
  badge,
  actions,
  defaultOpen = false,
  children,
  className = "",
}: FoldPanelProps) {
  return (
    <details open={defaultOpen} className={`app-fold app-panel rounded-[1.75rem] p-4 ${className}`.trim()}>
      <summary className="app-fold-summary list-none">
        <div className="min-w-0 flex-1">
          {eyebrow ? <div className="app-eyebrow mb-2">{eyebrow}</div> : null}
          <div className="app-fold-header flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
              {summary ? <p className="mt-1 text-sm text-slate-600">{summary}</p> : null}
            </div>
            <div className="app-fold-actions flex items-center gap-3 flex-wrap justify-end">
              {badge}
              {actions}
              <span className="app-fold-toggle">
                <span className="app-fold-closed">Show details</span>
                <span className="app-fold-open">Hide details</span>
              </span>
            </div>
          </div>
        </div>
      </summary>
      <div className="app-fold-body mt-4 pt-4">{children}</div>
    </details>
  );
}
