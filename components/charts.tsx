"use client";

import React, { useEffect, useId, useRef, useState } from "react";

/* ============================================================
   LayerNet V2 chart kit — internal SVG, zero dependencies.
   Real data only; every chart has an empty state, tooltip,
   and a screen-reader data alternative.
   ============================================================ */

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      setWidth(next);
    });
    observer.observe(node);
    setWidth(node.clientWidth);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/* ---------------- Donut ---------------- */

export type DonutDatum = { label: string; value: number; color: string };

export function DonutChart({
  data,
  centerCaption = "records",
  size = 176,
}: {
  data: DonutDatum[];
  centerCaption?: string;
  size?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const tableId = useId();
  const total = data.reduce((sum, item) => sum + item.value, 0);

  if (total === 0) {
    return <p className="py-8 text-center text-sm text-[var(--muted-text)]">No records to distribute yet.</p>;
  }

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const segments = data.map((item, index) => {
    const length = (item.value / total) * circumference;
    const start = data.slice(0, index).reduce((sum, prev) => sum + (prev.value / total) * circumference, 0);
    return { length, start };
  });

  return (
    <div className="@container w-full">
    <div className="flex flex-col items-center gap-5 @sm:flex-row @sm:items-center @sm:gap-8">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-describedby={tableId}>
          <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--surface-strong)" strokeWidth="12" />
          {data.map((item, index) => {
            if (item.value === 0) return null;
            const { length, start: currentOffset } = segments[index];
            const dash = `${Math.max(0, length - 1)} ${circumference - Math.max(0, length - 1)}`;
            return (
              <circle
                key={item.label}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={item.color}
                strokeWidth={active === index ? 14 : 12}
                strokeDasharray={dash}
                strokeDashoffset={-currentOffset}
                transform="rotate(-90 50 50)"
                tabIndex={0}
                aria-label={`${item.label}: ${item.value} (${Math.round((item.value / total) * 100)}%)`}
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                style={{ transition: "stroke-width 0.15s ease", cursor: "default", outline: "none" }}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {active !== null && data[active].value > 0 ? (
            <>
              <span className="ln-data text-2xl font-semibold text-[var(--text)]">{data[active].value}</span>
              <span className="text-[11px] text-[var(--muted-text)]">
                {data[active].label} · {Math.round((data[active].value / total) * 100)}%
              </span>
            </>
          ) : (
            <>
              <span className="ln-data text-2xl font-semibold text-[var(--text)]">{total}</span>
              <span className="text-[11px] text-[var(--muted-text)]">{centerCaption}</span>
            </>
          )}
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-2.5">
        {data.map((item) => (
          <li key={item.label} className="flex items-center gap-2.5 text-sm">
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
            <span className="min-w-0 flex-1 truncate text-[var(--text)]">{item.label}</span>
            <span className="ln-data font-medium text-[var(--text)]">{item.value}</span>
            <span className="ln-data w-11 text-right text-xs text-[var(--muted-text)]">
              {total ? Math.round((item.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
      <table id={tableId} className="sr-only">
        <caption>Risk distribution</caption>
        <thead>
          <tr><th>Level</th><th>Count</th></tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.label}><td>{item.label}</td><td>{item.value}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  );
}

/* ---------------- Trend (line + area) ---------------- */

export type TrendPoint = { t: number; score: number; id: string };

export function TrendChart({ points, height = 230 }: { points: TrendPoint[]; height?: number }) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const tableId = useId();

  if (points.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--muted-text)]">No activity in this range.</p>;
  }

  const margin = { top: 14, right: 14, bottom: 26, left: 34 };
  const innerW = Math.max(10, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;

  const sorted = [...points].sort((a, b) => a.t - b.t);
  let tMin = sorted[0].t;
  let tMax = sorted[sorted.length - 1].t;
  if (tMax - tMin < 3_600_000) {
    tMin -= 1_800_000;
    tMax += 1_800_000;
  }
  const x = (t: number) => margin.left + ((t - tMin) / (tMax - tMin)) * innerW;
  const y = (score: number) => margin.top + (1 - Math.max(0, Math.min(100, score)) / 100) * innerH;

  const linePath = sorted.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${x(sorted[sorted.length - 1].t).toFixed(1)},${(margin.top + innerH).toFixed(1)} L${x(sorted[0].t).toFixed(1)},${(margin.top + innerH).toFixed(1)} Z`;

  const spanDays = (tMax - tMin) / 86_400_000;
  // Fewer, shorter ticks on narrow charts so labels never collide.
  const narrow = width < 520;
  const tickCount = narrow ? 2 : 4;
  const xTicks = Array.from({ length: tickCount }, (_, i) => tMin + ((tMax - tMin) * i) / (tickCount - 1));
  const tickFormatter = narrow || spanDays > 3 ? dayFormatter : timeFormatter;

  const handleMove = (event: React.MouseEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left + margin.left;
    let nearest = 0;
    let best = Infinity;
    sorted.forEach((p, i) => {
      const distance = Math.abs(x(p.t) - px);
      if (distance < best) {
        best = distance;
        nearest = i;
      }
    });
    setHover(nearest);
  };

  const hovered = hover !== null ? sorted[hover] : null;

  const handleKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      setHover((current) => {
        const step = event.key === "ArrowRight" ? 1 : -1;
        if (current === null) return step === 1 ? 0 : sorted.length - 1;
        return Math.min(sorted.length - 1, Math.max(0, current + step));
      });
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setHover(event.key === "Home" ? 0 : sorted.length - 1);
    } else if (event.key === "Escape") {
      setHover(null);
    }
  };

  return (
    <div
      ref={ref}
      className="relative w-full rounded-md"
      tabIndex={0}
      role="group"
      aria-label="Priority score trend. Use left and right arrow keys to inspect each saved analysis."
      onKeyDown={handleKey}
      onBlur={() => setHover(null)}
    >
      <p className="sr-only" aria-live="polite">
        {hovered ? `${hovered.id}: score ${hovered.score} of 100 at ${timeFormatter.format(new Date(hovered.t))} UTC` : ""}
      </p>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-describedby={tableId}>
          {[0, 25, 50, 75, 100].map((tick) => (
            <g key={tick}>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--border)"
                strokeDasharray={tick === 0 ? undefined : "3 4"}
              />
              <text x={margin.left - 7} y={y(tick) + 3.5} textAnchor="end" fontSize="10" fill="var(--muted-text)" className="ln-data">
                {tick}
              </text>
            </g>
          ))}
          {xTicks.map((tick, i) => (
            <text
              key={i}
              x={x(tick)}
              y={height - 8}
              textAnchor={i === 0 ? "start" : i === tickCount - 1 ? "end" : "middle"}
              fontSize="10"
              fill="var(--muted-text)"
            >
              {tickFormatter.format(new Date(tick))}
            </text>
          ))}
          <path d={areaPath} fill="var(--rose-tint)" className="ln-chart-area" />
          <path
            d={linePath}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            className="ln-chart-line"
            style={{ "--ln-path-len": 2400 } as React.CSSProperties}
          />
          {sorted.map((p, i) => (
            <circle
              key={`${p.id}-${i}`}
              cx={x(p.t)}
              cy={y(p.score)}
              r={hover === i ? 4.5 : sorted.length > 40 ? 0 : 2.5}
              fill="var(--primary)"
              stroke="var(--surface)"
              strokeWidth="1.5"
            />
          ))}
          {hovered && (
            <line
              x1={x(hovered.t)}
              x2={x(hovered.t)}
              y1={margin.top}
              y2={margin.top + innerH}
              stroke="var(--rose-soft)"
              strokeDasharray="3 3"
            />
          )}
          <rect
            x={margin.left}
            y={margin.top}
            width={innerW}
            height={innerH}
            fill="transparent"
            onMouseMove={handleMove}
            onMouseLeave={() => setHover(null)}
          />
        </svg>
      )}
      {hovered && width > 0 && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs shadow-[var(--shadow-2)]"
          style={{
            left: Math.min(Math.max(x(hovered.t), 70), width - 70),
            top: Math.max(0, y(hovered.score) - 64),
          }}
        >
          <p className="font-medium text-[var(--text)]">{hovered.id}</p>
          <p className="ln-data mt-0.5 text-[var(--primary)]">score {hovered.score}/100</p>
          <p className="mt-0.5 text-[var(--muted-text)]">{timeFormatter.format(new Date(hovered.t))} UTC</p>
        </div>
      )}
      <p className="mt-1 flex flex-wrap justify-between gap-x-4 gap-y-0.5 text-[11px] text-[var(--muted-text)]">
        <span>Y: heuristic priority score (0–100, uncalibrated)</span>
        <span>X: analysis timestamp (UTC)</span>
      </p>
      <table id={tableId} className="sr-only">
        <caption>Priority score over time</caption>
        <thead>
          <tr><th>Transaction</th><th>Time (UTC)</th><th>Score</th></tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => (
            <tr key={`${p.id}-${i}`}><td>{p.id}</td><td>{timeFormatter.format(new Date(p.t))}</td><td>{p.score}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Horizontal breakdown bars ---------------- */

export type BarDatum = { label: string; value: number; color?: string };

export function BarBreakdown({ items, unit = "records" }: { items: BarDatum[]; unit?: string }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  const total = items.reduce((sum, item) => sum + item.value, 0);

  if (total === 0) {
    return <p className="py-6 text-center text-sm text-[var(--muted-text)]">No records to break down yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-[var(--text)]">{item.label}</span>
            <span className="ln-data shrink-0 text-xs text-[var(--muted-text)]">
              <span className="font-medium text-[var(--text)]">{item.value}</span>{" "}
              {item.value === 1 ? unit.replace(/s$/, "") : unit} ·{" "}
              {Math.round((item.value / total) * 100)}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-strong)]">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${(item.value / max) * 100}%`, background: item.color ?? "var(--primary)" }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
