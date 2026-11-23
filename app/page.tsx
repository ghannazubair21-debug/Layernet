import Link from "next/link";
import { ArrowRight, FlaskConical, History, ScanSearch } from "lucide-react";

const tiles = [
  {
    title: "Heuristic Scoring",
    text: "Review transparent score contributions; the priority score is not a fraud probability.",
    href: "/analysis",
    icon: ScanSearch,
  },
  {
    title: "Behavior Context",
    text: "Compare against earlier saved activity when an account identifier and history are provided.",
    href: "/analysis",
    icon: History,
  },
  {
    title: "Investigation History",
    text: "Review analyses saved in this browser; no ground-truth fraud labels are inferred.",
    href: "/history",
    icon: History,
  },
];

export default function Home() {
  return (
    <section className="space-y-8">
      <div className="ln-enter max-w-3xl space-y-4">
        <p className="layernet-label layernet-accent">Fraud Intelligence Research Prototype</p>
        <h1 className="ln-display text-4xl text-[var(--text)] sm:text-5xl">Welcome to LayerNet</h1>
        <p className="text-base text-[var(--muted-text)]">
          Analyze transaction details with an evidence-visible rules baseline, review available historical behavior,
          and keep investigation decisions organized. No trained fraud model is currently connected to normal
          analysis.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <Link href="/dashboard" className="layernet-button layernet-button--primary px-5 py-2.5 text-sm">
            Open Dashboard <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
          <Link href="/analysis" className="layernet-button px-5 py-2.5 text-sm">
            Analyze a transaction
          </Link>
        </div>
      </div>

      <div className="ln-enter-stagger grid gap-4 md:grid-cols-3">
        {tiles.map(({ title, text, href, icon: Icon }) => (
          <Link
            key={title}
            href={href}
            className="layernet-card group p-6 transition-colors hover:border-[var(--rose-soft)]"
          >
            <span className="flex size-10 items-center justify-center rounded-lg bg-[var(--rose-tint)] text-[var(--primary)]">
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <h2 className="mt-4 text-base font-semibold text-[var(--text)]">{title}</h2>
            <p className="mt-2 text-sm text-[var(--muted-text)]">{text}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              Open <ArrowRight aria-hidden="true" className="size-3" />
            </span>
          </Link>
        ))}
      </div>

      <div className="ln-enter rounded-lg border border-[var(--rose-gold)]/40 border-l-4 border-l-[var(--rose-gold)] bg-[var(--rose-tint)] px-4 py-3.5">
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
          <FlaskConical aria-hidden="true" className="size-4 text-[var(--rose-gold)]" />
          Trained models are available for ULB benchmark replay only.
        </p>
        <p className="mt-1 text-sm text-[var(--muted-text)]">
          Saved XGBoost and Random Forest artifacts score genuine ULB dataset rows server-side — never ordinary
          app-form transactions.{" "}
          <Link href="/benchmark" className="font-medium text-[var(--primary)] hover:text-[var(--primary-hover)]">
            Open the benchmark →
          </Link>
        </p>
      </div>
    </section>
  );
}
