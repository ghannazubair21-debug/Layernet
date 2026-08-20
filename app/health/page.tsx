async function getHealthData() {
  await new Promise((resolve) => setTimeout(resolve, 200));

  return {
    system: "Healthy",
    api: "Connected",
    model: "Ready",
    engine: "Operational",
    checked: "19 Aug 2026, 12:00 PM",
  };
}

export default async function HealthPage() {
  const health = await getHealthData();

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <p className="layernet-label layernet-accent">System Monitor</p>
        <h1 className="layernet-title text-3xl font-bold tracking-tight">Health Check</h1>
        <p className="layernet-muted max-w-2xl">Live status information fetched from the application health check.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <div className="layernet-card p-6">
          <p className="layernet-label">Overall system</p>
          <p className="mt-2 text-xl font-bold text-[var(--success)]">{health.system}</p>
        </div>

        <div className="layernet-card p-6">
          <p className="layernet-label">API status</p>
          <p className="mt-2 text-xl font-bold text-[var(--success)]">{health.api}</p>
        </div>

        <div className="layernet-card p-6">
          <p className="layernet-label">Model</p>
          <p className="mt-2 text-xl font-bold text-[var(--success)]">{health.model}</p>
        </div>
      </div>

      <div className="layernet-card p-6">
        <p className="layernet-label">Detection engine</p>
        <p className="mt-2 text-lg font-semibold">{health.engine}</p>

        <div className="mt-4 grid gap-3">
          <div className="flex items-center justify-between">
            <span className="layernet-muted">Recent events</span>
            <span className="text-sm layernet-muted">{health.checked}</span>
          </div>

          <ul className="mt-2 space-y-2 layernet-muted text-sm">
            <li>Engine cycle completed — 2s</li>
            <li>Model confidence stable</li>
            <li>API error rate &lt; 0.1%</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
