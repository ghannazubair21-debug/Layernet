export default function HealthPage() {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <p className="layernet-label layernet-accent">Prototype Configuration</p>
        <h1 className="layernet-title text-3xl font-bold tracking-tight">System Status</h1>
        <p className="layernet-muted max-w-2xl">Current application capabilities. Live service and model telemetry is not configured.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <div className="layernet-card p-6">
          <p className="layernet-label">Scoring</p>
          <p className="mt-2 text-xl font-bold text-[var(--text)]">Rules baseline v1</p>
        </div>

        <div className="layernet-card p-6">
          <p className="layernet-label">Trained ML inference</p>
          <p className="mt-2 text-xl font-bold text-[var(--text)]">Not connected</p>
        </div>

        <div className="layernet-card p-6">
          <p className="layernet-label">Transaction storage</p>
          <p className="mt-2 text-xl font-bold text-[var(--text)]">This browser</p>
        </div>
      </div>

      <div className="layernet-card p-6">
        <p className="layernet-label">Known limitations</p>
        <ul className="mt-3 list-disc space-y-2 pl-5 layernet-muted text-sm">
          <li>Scores are uncalibrated heuristic priorities, not fraud probabilities or validated model predictions.</li>
          <li>Behavioral features are calculated when identifiers and saved history are available, but they do not currently affect the score.</li>
          <li>No durable backend, model-serving endpoint, or live health telemetry is configured.</li>
        </ul>
      </div>
    </section>
  );
}
