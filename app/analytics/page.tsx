import PageHeader from "@/components/PageHeader";
import ChartCard from "@/components/ChartCard";
import { transactions, getMetrics } from "@/lib/mockData";

export default function Page() {
  const metrics = getMetrics();

  return (
    <section className="space-y-6">
      <PageHeader title="Analytics" subtitle="Explore fraud trends, patterns, and detection insights." />

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <ChartCard title="Fraud trend (recent)">
            <div className="mt-3 h-44 flex items-end gap-2">
              {transactions.map((t) => (
                <div key={t.id} className="flex-1">
                  <div className="mx-auto h-full w-full rounded-t-md bg-[var(--primary)]" style={{ height: `${Math.max(8, t.riskScore)}%` }} />
                  <p className="mt-2 text-xs text-center text-[var(--muted-text)]">{t.id}</p>
                </div>
              ))}
            </div>
          </ChartCard>

          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <ChartCard title="Fraud rate">
              <p className="text-2xl font-bold">{metrics.fraudRate}%</p>
              <p className="layernet-muted mt-2">Percentage of transactions flagged as non-low risk.</p>
            </ChartCard>

            <ChartCard title="Transaction volume">
              <p className="text-2xl font-bold">{metrics.total}</p>
              <p className="layernet-muted mt-2">Total sample transactions</p>
            </ChartCard>

            <ChartCard title="Avg risk score">
              <p className="text-2xl font-bold">{metrics.avgRisk}</p>
              <p className="layernet-muted mt-2">Average risk score across sample</p>
            </ChartCard>
          </div>
        </div>

        <div>
          <ChartCard title="High risk summary">
            <ul className="mt-3 space-y-3 text-sm layernet-muted">
              {transactions.filter((t) => t.risk === "High").map((t) => (
                <li key={t.id} className="flex items-center justify-between">
                  <span>{t.id} — {t.location}</span>
                  <span className="font-medium">{t.riskScore}</span>
                </li>
              ))}
            </ul>
          </ChartCard>

          <div className="mt-4 layernet-card p-4">
            <p className="layernet-label">Top signals</p>
            <ul className="mt-3 text-sm layernet-muted">
              <li>Velocity anomalies</li>
              <li>Geo mismatches</li>
              <li>Device anomalies</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
