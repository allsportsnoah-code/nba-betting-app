import type { ReactNode } from "react";

export default function ResponsivePickDetails({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="compact-pick-desktop-details compact-pick-detail-body mt-3 space-y-1 text-sm text-slate-700">
        {children}
      </div>

      <details className="compact-pick-details compact-pick-mobile-details">
        <summary className="compact-pick-toggle">
          <span className="compact-pick-closed">More details</span>
          <span className="compact-pick-open">Minimize</span>
        </summary>
        <div className="compact-pick-detail-body mt-3 space-y-1 text-sm text-slate-700">
          {children}
        </div>
      </details>
    </>
  );
}
