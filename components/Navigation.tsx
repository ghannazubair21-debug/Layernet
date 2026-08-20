import Link from "next/link";

const links = [
  ["Dashboard", "/dashboard"],
  ["Analysis", "/analysis"],
  ["History", "/history"],
  ["Analytics", "/analytics"],
  ["Settings", "/settings"],
  ["Health", "/health"],
];

export default function Navigation() {
  return (
    <nav className="border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <Link href="/" className="text-xl font-bold text-[var(--primary)]">
          LayerNet
        </Link>

        <div className="flex flex-wrap gap-2">
          {links.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-[var(--muted-text)] transition-colors hover:border-[var(--border)] hover:bg-[var(--surface-strong)] hover:text-[var(--primary)]"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
