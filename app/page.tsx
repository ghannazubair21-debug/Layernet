export default function Home() {
  return (
    <section className="space-y-8">
      <div className="space-y-4">
        <p className="layernet-label layernet-accent">AI-Powered Fraud Detection</p>
        <h1 className="layernet-title text-4xl font-bold tracking-tight">Welcome to LayerNet</h1>
        <p className="layernet-muted max-w-2xl text-base">
          A transformer-based system for analyzing transactions and identifying
          potentially fraudulent activity.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {[
          ["Real-time Analysis", "Analyze suspicious transactions."],
          ["Smart Insights", "Understand fraud patterns and trends."],
          ["Secure Monitoring", "Track system and model health."],
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
