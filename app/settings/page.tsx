"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Database, FlaskConical, Palette, Trash2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Panel from "@/components/Panel";
import ThemeSettings from "@/components/ThemeSettings";
import { useStoredTransactions } from "@/lib/useStoredTransactions";
import { transactionService } from "@/lib/transactionService";
import { GEMINI_MODEL_ID } from "@/lib/ai-config";

export default function SettingsPage() {
  const { transactions, isLoading, loadError } = useStoredTransactions();
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [clearError, setClearError] = useState("");
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/chat")
      .then((response) => response.json())
      .then((payload: { configured?: boolean }) => {
        if (active) setAiConfigured(Boolean(payload.configured));
      })
      .catch(() => {
        if (active) setAiConfigured(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleClear = async () => {
    setClearError("");
    try {
      await transactionService.clear();
      setConfirming(false);
      setCleared(true);
    } catch {
      setClearError("Local data could not be cleared. Check browser storage permissions and try again.");
    }
  };

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="System"
        title="Settings"
        subtitle="Appearance, local data, and integration scope. Preferences persist in this browser."
      />

      {loadError ? <p role="alert" className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning-tint)] px-4 py-3 text-sm text-[var(--text)]">{loadError} You can clear the unreadable local store below; no records will be silently replaced.</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Appearance" className="ln-enter">
          <div className="mb-4 flex items-center gap-2 text-sm text-[var(--muted-text)]">
            <Palette aria-hidden="true" className="size-4 text-[var(--primary)]" />
            Rose Quartz adapts to your system, or stays fixed to light or dark.
          </div>
          <ThemeSettings />
        </Panel>

        <Panel title="Data & privacy" className="ln-enter">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--rose-tint)] text-[var(--primary)]">
              <Database aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-[var(--text)]">
                <span className="ln-data font-semibold">{isLoading ? "…" : loadError ? "Unavailable" : transactions.length}</span> analyzed records
                are stored in this browser only. Nothing is sent to a server except benchmark CSV uploads and AI chat
                messages you explicitly submit.
              </p>
              {cleared ? (
                <p role="status" className="mt-3 text-sm font-medium text-[var(--success)]">
                  Local vault cleared.
                </p>
              ) : confirming ? (
                <div className="mt-3 rounded-lg bg-[var(--danger-tint)] p-3">
                  <p className="text-sm text-[var(--danger)]">
                    {loadError
                      ? "The saved records could not be read. Delete the local transaction store? This cannot be undone."
                      : `Delete all ${transactions.length} saved records? This cannot be undone.`}
                  </p>
                  {clearError ? <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{clearError}</p> : null}
                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleClear()}
                      className="rounded-lg bg-[var(--danger)] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                    >
                      Yes, clear everything
                    </button>
                    <button type="button" onClick={() => setConfirming(false)} className="layernet-button px-3 py-1.5 text-xs">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isLoading || (transactions.length === 0 && !loadError)}
                  onClick={() => setConfirming(true)}
                  className="layernet-button mt-3 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 aria-hidden="true" className="size-4 text-[var(--danger)]" /> Clear local vault
                </button>
              )}
            </div>
          </div>
        </Panel>

        <Panel title="AI assistant" className="ln-enter">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--rose-tint)] text-[var(--primary)]">
              <Bot aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-sm text-[var(--text)]">
                Gemini <span className="ln-data">{GEMINI_MODEL_ID}</span> ·{" "}
                {aiConfigured === null ? "configuration unknown" : aiConfigured ? "configured" : "not configured"}
              </p>
              <p className="mt-1.5 text-xs text-[var(--muted-text)]">
                General investigation conversation only. It cannot read saved history, attach transactions
                automatically, or change any score. Configure with the GOOGLE_GENERATIVE_AI_API_KEY environment
                variable.
              </p>
            </div>
          </div>
        </Panel>

        <Panel title="Benchmark scope" className="ln-enter">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--rose-tint)] text-[var(--primary)]">
              <FlaskConical aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-sm text-[var(--text)]">ULB benchmark replay is dataset-scoped research inference.</p>
              <p className="mt-1.5 text-xs text-[var(--muted-text)]">
                Saved XGBoost and Random Forest models score only genuine ULB rows you upload. They never score
                normal transaction-form submissions, and their scores are uncalibrated.
              </p>
              <Link href="/benchmark" className="mt-2.5 inline-block text-xs font-medium text-[var(--primary)] hover:text-[var(--primary-hover)]">
                Open Benchmark →
              </Link>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Component lab" className="ln-enter">
        <p className="text-sm text-[var(--muted-text)]">
          Interaction and accessibility demonstrations retained from earlier phases.
        </p>
        <div className="mt-3 flex flex-wrap gap-2.5">
          <Link href="/micro-interactions" className="layernet-button px-4 py-2 text-sm">
            Micro-interactions
          </Link>
          <Link href="/playground" className="layernet-button px-4 py-2 text-sm">
            Accessible component playground
          </Link>
        </div>
      </Panel>
    </section>
  );
}
