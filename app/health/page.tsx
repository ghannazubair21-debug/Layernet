"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Bot, Database, FlaskConical, ScanSearch } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Panel from "@/components/Panel";
import { Skeleton } from "@/components/LoadingSkeleton";
import { useStoredTransactions } from "@/lib/useStoredTransactions";
import { GEMINI_MODEL_ID } from "@/lib/ai-config";

type ProbeState = "loading" | "ok" | "unavailable" | "error";

function StatusPill({ state, okText, badText }: { state: ProbeState; okText: string; badText: string }) {
  if (state === "loading") return <Skeleton className="h-6 w-28 rounded-full" />;
  const ok = state === "ok";
  return (
    <span className={`layernet-status ${ok ? "layernet-status--success" : "layernet-status--warning"}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${ok ? "bg-[var(--success)]" : "bg-[var(--warning)]"}`} />
      {ok ? okText : badText}
    </span>
  );
}

function storageProbe(): boolean {
  try {
    const key = "layernet-health-probe";
    window.localStorage.setItem(key, "1");
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function noopSubscribe() {
  return () => {};
}

export default function HealthPage() {
  const { transactions, loadError } = useStoredTransactions();
  const storage = useSyncExternalStore<ProbeState>(
    noopSubscribe,
    () => (storageProbe() ? "ok" : "unavailable"),
    () => "loading",
  );
  const [ai, setAi] = useState<ProbeState>("loading");
  const [benchmark, setBenchmark] = useState<ProbeState>("loading");
  const [benchmarkReason, setBenchmarkReason] = useState("");
  const [artifacts, setArtifacts] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {

    let active = true;
    fetch("/api/chat")
      .then((response) => response.json())
      .then((payload: { configured?: boolean }) => {
        if (active) setAi(payload.configured ? "ok" : "unavailable");
      })
      .catch(() => {
        if (active) setAi("error");
      });

    fetch("/api/benchmark")
      .then((response) => response.json())
      .then((payload: { available?: boolean; reason?: string; models?: Record<string, boolean> }) => {
        if (!active) return;
        setBenchmark(payload.available ? "ok" : "unavailable");
        setArtifacts(payload.models ?? null);
        setBenchmarkReason(payload.reason ?? "Saved artifacts or ML virtualenv not accessible.");
      })
      .catch(() => {
        if (active) setBenchmark("error");
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="System"
        title="System Health"
        subtitle="Actual configuration and live local probes. No operational monitoring or model telemetry is invented."
      />

      <div className="ln-enter-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="layernet-card p-5">
          <span className="flex size-10 items-center justify-center rounded-lg bg-[var(--rose-tint)] text-[var(--primary)]">
            <ScanSearch aria-hidden="true" className="size-5" />
          </span>
          <p className="layernet-label mt-3">Scoring engine</p>
          <p className="mt-1.5 text-lg font-semibold text-[var(--text)]">Rules baseline v1</p>
          <p className="mt-1 text-xs text-[var(--muted-text)]">Active for all normal transaction analysis.</p>
        </div>

        <div className="layernet-card p-5">
          <span className="flex size-10 items-center justify-center rounded-lg bg-[var(--rose-tint)] text-[var(--primary)]">
            <FlaskConical aria-hidden="true" className="size-5" />
          </span>
          <p className="layernet-label mt-3">Trained ML inference</p>
          <div className="mt-2">
            <StatusPill state={benchmark} okText="Artifacts present" badText={benchmark === "error" ? "Probe failed" : "Unavailable"} />
          </div>
          <p className="mt-2 text-xs text-[var(--muted-text)]">
            {benchmark === "ok"
              ? "XGBoost + Random Forest manifests found. Loading and inference are not proven by this probe. Benchmark replay only."
              : benchmark === "loading"
                ? "Checking saved artifacts…"
                : benchmarkReason}
          </p>
        </div>

        <div className="layernet-card p-5">
          <span className="flex size-10 items-center justify-center rounded-lg bg-[var(--rose-tint)] text-[var(--primary)]">
            <Bot aria-hidden="true" className="size-5" />
          </span>
          <p className="layernet-label mt-3">AI assistant</p>
          <div className="mt-2">
            <StatusPill state={ai} okText="Key configured" badText={ai === "error" ? "Probe failed" : "Not configured"} />
          </div>
          <p className="mt-2 text-xs text-[var(--muted-text)]">
            {ai === "ok" ? `Gemini (${GEMINI_MODEL_ID}) · general investigation chat only.` : "Set GOOGLE_GENERATIVE_AI_API_KEY to enable the assistant."}
          </p>
        </div>

        <div className="layernet-card p-5">
          <span className="flex size-10 items-center justify-center rounded-lg bg-[var(--rose-tint)] text-[var(--primary)]">
            <Database aria-hidden="true" className="size-5" />
          </span>
          <p className="layernet-label mt-3">Transaction storage</p>
          <div className="mt-2">
            <StatusPill state={storage} okText="This browser" badText="Unavailable" />
          </div>
          <p className="mt-2 text-xs text-[var(--muted-text)]">
            {loadError
              ? "Saved local records could not be read; existing data was left unchanged."
              : storage === "ok"
                ? `${transactions.length} records in local storage. No durable backend is configured.`
                : "Local storage is not writable in this context."}
          </p>
        </div>
      </div>

      <Panel
        title="ML benchmark readiness"
        subtitle="Each stage is reported separately — artifact presence does not imply a working model."
        className="ln-enter"
      >
        <ul className="divide-y divide-[var(--border)] text-sm">
          {[
            {
              label: "Benchmark API route",
              state: benchmark === "loading" ? "Checking…" : benchmark === "error" ? "Unreachable" : "Reachable",
              tone: benchmark === "loading" ? "muted" : benchmark === "error" ? "bad" : "good",
            },
            {
              label: "Python ML runtime (ml/.venv)",
              state:
                benchmark === "loading"
                  ? "Checking…"
                  : artifacts
                    ? "Ran availability probe"
                    : "Not confirmed",
              tone: benchmark === "loading" ? "muted" : artifacts ? "good" : "bad",
            },
            {
              label: "Saved artifacts (manifest.json)",
              state: artifacts
                ? Object.entries(artifacts)
                    .map(([family, present]) => `${family}: ${present ? "present" : "missing"}`)
                    .join(" · ")
                : benchmark === "loading"
                  ? "Checking…"
                  : "Unknown",
              tone: artifacts && Object.values(artifacts).every(Boolean) ? "good" : benchmark === "loading" ? "muted" : "bad",
            },
            { label: "Model loadability", state: "Not checked by this probe", tone: "muted" },
            {
              label: "Successful inference",
              state: "Verified only when a Benchmark upload completes",
              tone: "muted",
            },
          ].map((row) => (
            <li key={row.label} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[var(--text)]">{row.label}</span>
              <span
                className={
                  row.tone === "good"
                    ? "ln-data text-xs text-[var(--success)]"
                    : row.tone === "bad"
                      ? "ln-data text-xs text-[var(--danger)]"
                      : "ln-data text-xs text-[var(--muted-text)]"
                }
              >
                {row.state}
              </span>
            </li>
          ))}
        </ul>
        <Link href="/benchmark" className="mt-3 inline-flex text-xs font-medium text-[var(--primary)] hover:text-[var(--primary-hover)]">
          Run a real inference check on the Benchmark page →
        </Link>
      </Panel>

      <Panel title="Known limitations" className="ln-enter">
        <ul className="space-y-2.5 text-sm text-[var(--muted-text)]">
          <li className="flex gap-2.5">
            <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--rose-gold)]" />
            Scores are uncalibrated heuristic priorities, not fraud probabilities or validated model predictions.
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--rose-gold)]" />
            Behavioral features are calculated when identifiers and saved history are available, but they do not currently affect the score.
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--rose-gold)]" />
            ULB-trained models score only genuine ULB dataset rows in the Benchmark replay — never normal app-form transactions.
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--rose-gold)]" />
            No durable backend, model-serving endpoint, or live health telemetry is configured.
          </li>
        </ul>
        <Link href="/benchmark" className="layernet-button mt-4 px-4 py-2 text-sm">
          Open ULB Benchmark Replay
        </Link>
      </Panel>
    </section>
  );
}
