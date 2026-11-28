import React from "react";
import { riskForScore } from "@/lib/riskBands";

const RISK_COLOR = { High: "var(--danger)", Medium: "var(--warning)", Low: "var(--success)" } as const;

function riskColor(score: number): string {
  return RISK_COLOR[riskForScore(score)];
}

/** Semicircular 0–100 priority gauge. The score is an uncalibrated heuristic priority. */
export default function ScoreIndicator({
  score,
  size = 160,
  caption = "Priority score",
}: {
  score: number;
  size?: number;
  caption?: string;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 42;
  const circumference = Math.PI * radius;
  const filled = (clamped / 100) * circumference;
  const color = riskColor(clamped);

  return (
    <figure className="flex flex-col items-center" role="img" aria-label={`${caption}: ${clamped} out of 100`}>
      <svg viewBox="0 0 100 58" width={size} height={size * 0.58} aria-hidden="true">
        <path
          d="M 8 52 A 42 42 0 0 1 92 52"
          fill="none"
          stroke="color-mix(in srgb, var(--muted-text) 22%, transparent)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M 8 52 A 42 42 0 0 1 92 52"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          style={{ transition: "stroke-dasharray 0.5s cubic-bezier(0.32,0.72,0,1)" }}
        />
        <text
          x="50"
          y="46"
          textAnchor="middle"
          className="ln-data"
          fill="var(--text)"
          fontSize="17"
          fontWeight="600"
        >
          {clamped}
        </text>
        <text x="50" y="55" textAnchor="middle" fill="var(--muted-text)" fontSize="5.5">
          / 100
        </text>
      </svg>
      <figcaption className="mt-1 text-xs text-[var(--muted-text)]">{caption} · uncalibrated</figcaption>
    </figure>
  );
}
