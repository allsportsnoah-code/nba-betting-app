"use client";

import { useState, type PointerEvent } from "react";

type Point = {
  label: string;
  value: number;
};

export default function PerformanceChart({ points }: { points: Point[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (!points || points.length === 0) {
    return (
      <div className="app-panel rounded-3xl p-4">
        <p>No data to display yet.</p>
      </div>
    );
  }

  const width = 950;
  const height = 320;
  const padding = 45;

  const values = points.map((p) => p.value);
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 0);

  const range = Math.max(maxValue - minValue, 1);

  const xStep =
    points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;

  const getX = (index: number) => padding + index * xStep;
  const getY = (value: number) =>
    height - padding - ((value - minValue) / range) * (height - padding * 2);

  const pathData = points
    .map((point, index) => {
      const x = getX(index);
      const y = getY(point.value);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  const zeroY = getY(0);
  const finalPoint = points[points.length - 1];
  const finalX = getX(points.length - 1);
  const finalY = getY(finalPoint.value);
  const activePoint = activeIndex === null ? null : points[activeIndex];
  const activeX = activeIndex === null ? null : getX(activeIndex);
  const activeY = activePoint ? getY(activePoint.value) : null;
  const activeValueLabel = activePoint ? `${activePoint.value.toFixed(2)}u` : "";
  const highPoint = points.reduce((best, point) => (point.value > best.value ? point : best), points[0]);
  const lowPoint = points.reduce((worst, point) => (point.value < worst.value ? point : worst), points[0]);
  const tooltipWidth = activePoint
    ? Math.max(118, activePoint.label.length * 7 + 24, activeValueLabel.length * 9 + 24)
    : 118;
  const tooltipHeight = 50;
  const tooltipX =
    activeX === null
      ? 0
      : Math.min(Math.max(activeX + 12, padding), width - tooltipWidth - 8);
  const tooltipY =
    activeY === null
      ? 0
      : activeY - tooltipHeight - 14 < 8
        ? activeY + 14
        : activeY - tooltipHeight - 14;

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = ((event.clientX - rect.left) / rect.width) * width;
    const rawIndex = xStep === 0 ? 0 : Math.round((relativeX - padding) / xStep);
    const nextIndex = Math.min(Math.max(rawIndex, 0), points.length - 1);
    setActiveIndex(nextIndex);
  }

  return (
    <div className="app-panel performance-chart-panel rounded-3xl p-5 overflow-hidden">
      <div className="performance-chart-canvas">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="block h-full w-full cursor-crosshair"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setActiveIndex(null)}
        >
          <line
            x1={padding}
            y1={zeroY}
            x2={width - padding}
            y2={zeroY}
            stroke="#aac1d1"
            strokeWidth="1"
          />

          <path
            d={pathData}
            fill="none"
            stroke="#0f766e"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {activePoint && activeX !== null && activeY !== null && (
            <>
              <line
                x1={activeX}
                y1={padding}
                x2={activeX}
                y2={height - padding}
                stroke="#64748b"
                strokeWidth="1"
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={padding}
                y1={activeY}
                x2={width - padding}
                y2={activeY}
                stroke="#94a3b8"
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.8"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}

          {points.map((point, index) => {
            const x = getX(index);
            const y = getY(point.value);
            const isActive = activeIndex === index;

            return (
              <g key={`${point.label}-${index}`}>
                <circle cx={x} cy={y} r={isActive ? "7" : "3"} fill={isActive ? "#0f172a" : "#0f5f75"} />
                <circle cx={x} cy={y} r="12" fill="transparent" />
              </g>
            );
          })}

          <circle cx={finalX} cy={finalY} r="6" fill="#155e75" />
          <text
            x={finalX + 10}
            y={finalY - 10}
            fontSize="12"
            fill="#0f172a"
            fontWeight="600"
            className="performance-chart-final-label"
          >
            {finalPoint.value.toFixed(2)}u
          </text>

          {activePoint && activeX !== null && activeY !== null && (
            <g className="performance-chart-tooltip">
              <rect
                x={tooltipX}
                y={tooltipY}
                width={tooltipWidth}
                height={tooltipHeight}
                rx="8"
                fill="#0f172a"
                opacity="0.95"
              />
              <text
                x={tooltipX + 12}
                y={tooltipY + 20}
                fontSize="12"
                fill="#cbd5e1"
                fontWeight="500"
              >
                {activePoint.label}
              </text>
              <text
                x={tooltipX + 12}
                y={tooltipY + 38}
                fontSize="16"
                fill="#ffffff"
                fontWeight="700"
              >
                {activeValueLabel}
              </text>
            </g>
          )}
        </svg>
      </div>

      <div className="performance-chart-mobile-summary mt-3 grid grid-cols-3 gap-2 text-xs md:hidden">
        <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-3 py-2">
          <div className="text-slate-500">Current</div>
          <div className="font-semibold text-slate-950">{finalPoint.value.toFixed(2)}u</div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-3 py-2">
          <div className="text-slate-500">High</div>
          <div className="font-semibold text-emerald-700">{highPoint.value.toFixed(2)}u</div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-3 py-2">
          <div className="text-slate-500">Low</div>
          <div className="font-semibold text-rose-700">{lowPoint.value.toFixed(2)}u</div>
        </div>
      </div>

      <div className="mt-4 hidden grid-cols-2 gap-2 text-sm md:grid md:grid-cols-4">
        {points.map((p) => (
          <div key={p.label} className="rounded-2xl border border-slate-200/80 bg-white/70 px-3 py-2">
            <div className="text-slate-600">{p.label}</div>
            <div className="font-semibold text-slate-950">{p.value.toFixed(2)}u</div>
          </div>
        ))}
      </div>
    </div>
  );
}
