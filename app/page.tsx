export default function Home() {
  return (
    <section className="space-y-8">
      <div className="space-y-4">
        <p className="layernet-label layernet-accent">Fraud Intelligence Research Prototype</p>
        <h1 className="layernet-title text-4xl font-bold tracking-tight">Welcome to LayerNet</h1>
        <p className="layernet-muted max-w-2xl text-base">
          Analyze transaction details with an evidence-visible rules baseline, review available historical behavior, and keep investigation decisions organized. No trained fraud model is currently connected.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {[
          ["Heuristic Analysis", "Review transparent score contributions; the priority score is not a fraud probability."],
          ["Behavior Context", "Compare against earlier saved activity when an account identifier and history are provided."],
          ["Investigation History", "Review analyses saved in this browser; no ground-truth fraud labels are inferred."],
        ].map(([title, text]) => (
          <article key={title} className="layernet-card p-6">
            <h2 className="text-lg font-semibold text-[var(--text)]">{title}</h2>
            <p className="mt-2 text-sm text-[var(--muted-text)]">{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
