"use client";

type Point = {
  label: string;
  value: number;
};

export default function PerformanceChart({ points }: { points: Point[] }) {
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

  return (
    <div className="app-panel rounded-3xl p-5 overflow-x-auto">
      <svg width={width} height={height} className="block">
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
        />

        {points.map((point, index) => {
          const x = getX(index);
          const y = getY(point.value);

          return (
            <g key={`${point.label}-${index}`}>
              <circle cx={x} cy={y} r="3" fill="#0f5f75" />
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
        >
          {finalPoint.value.toFixed(2)}u
        </text>
      </svg>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
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
