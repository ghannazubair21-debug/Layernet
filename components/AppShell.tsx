"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  FlaskConical,
  HeartPulse,
  History,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  Monitor,
  Moon,
  Search,
  Shapes,
  Settings,
  Sun,
  X,
} from "lucide-react";
import AIChat from "@/components/AIChat";
import {
  readThemeMode,
  saveSettings,
  serverThemeMode,
  subscribeToSettings,
  type ThemeMode,
} from "@/components/theme";
import { useStoredTransactions } from "@/lib/useStoredTransactions";
import { cn } from "@/lib/utils";

type NavItem = { label: string; href: string; icon: typeof LayoutDashboard; also?: string[] };

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  { title: "Overview", items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }] },
  {
    title: "Investigation",
    items: [
      { label: "Analysis", href: "/analysis", icon: Search },
      { label: "History", href: "/history", icon: History },
      { label: "Analytics", href: "/analytics", icon: BarChart3 },
    ],
  },
  {
    title: "Intelligence",
    items: [{ label: "Benchmark", href: "/benchmark", icon: FlaskConical }],
  },
  {
    title: "System",
    items: [
      { label: "Health", href: "/health", icon: HeartPulse },
      { label: "Settings", href: "/settings", icon: Settings },
      { label: "Component Lab", href: "/micro-interactions", icon: Shapes, also: ["/playground"] },
    ],
  },
];

function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <circle cx="16" cy="16" r="13" fill="none" stroke="var(--rose-gold)" strokeWidth="1.5" />
      <path d="M3 16h26" stroke="var(--rose-gold)" strokeWidth="1.5" />
      <path d="M16 3c5 4.5 5 21.5 0 26M16 3c-5 4.5-5 21.5 0 26" fill="none" stroke="var(--sidebar-active)" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="3" fill="var(--sidebar-active)" />
    </svg>
  );
}

function ThemeControl() {
  const theme = useSyncExternalStore(subscribeToSettings, readThemeMode, serverThemeMode);

  const options: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
    { mode: "system", label: "System", icon: Monitor },
    { mode: "light", label: "Light", icon: Sun },
    { mode: "dark", label: "Dark", icon: Moon },
  ];

  return (
    <div role="group" aria-label="Color theme" className="flex rounded-lg bg-[var(--sidebar-hover)] p-0.5">
      {options.map(({ mode, label, icon: Icon }) => (
        <button
          key={mode}
          type="button"
          aria-label={`${label} theme`}
          aria-pressed={theme === mode}
          onClick={() => saveSettings(mode)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs transition-colors",
            theme === mode
              ? "bg-[var(--sidebar)] text-[var(--sidebar-text-strong)] shadow-sm"
              : "text-[var(--sidebar-text)] hover:text-[var(--sidebar-text-strong)]",
          )}
        >
          <Icon aria-hidden="true" className="size-3.5" />
          <span className="hidden xl:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

function SidebarContent({
  pathname,
  compact,
  onNavigate,
  onOpenAssistant,
}: {
  pathname: string;
  compact: boolean;
  onNavigate?: () => void;
  onOpenAssistant: () => void;
}) {
  const { transactions, loadError } = useStoredTransactions();

  return (
    <div className="flex h-full flex-col">
      <Link
        href="/"
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 border-b border-white/10 px-4 py-5",
          compact && "justify-center px-2",
        )}
      >
        <BrandMark className="size-8 shrink-0" />
        {!compact && (
          <span className="min-w-0">
            <span className="ln-display block text-lg leading-tight text-[var(--sidebar-text-strong)]">
              LayerNet
            </span>
            <span className="block text-[10px] uppercase tracking-[0.14em] text-[var(--rose-gold)]">
              Financial Intelligence
            </span>
          </span>
        )}
      </Link>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-5">
            {!compact && (
              <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--sidebar-text)]/70">
                {group.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map(({ label, href, icon: Icon, also }) => {
                const active = pathname === href || Boolean(also?.includes(pathname));
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-label={compact ? label : undefined}
                      aria-current={active ? "page" : undefined}
                      title={compact ? label : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                        compact && "justify-center px-0",
                        active
                          ? "bg-[var(--sidebar-hover)] font-medium text-[var(--sidebar-active)]"
                          : "text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-text-strong)]",
                      )}
                    >
                      {active && (
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-[var(--sidebar-active)]"
                        />
                      )}
                      <Icon aria-hidden="true" className="size-4 shrink-0" />
                      {!compact && <span>{label}</span>}
                    </Link>
                  </li>
                );
              })}
              {group.title === "Intelligence" && (
                <li>
                  <button
                    type="button"
                    onClick={onOpenAssistant}
                    aria-label={compact ? "AI Assistant" : undefined}
                    title={compact ? "AI Assistant" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-[var(--sidebar-text)] transition-colors hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-text-strong)]",
                      compact && "justify-center px-0",
                    )}
                  >
                    <MessageSquareText aria-hidden="true" className="size-4 shrink-0" />
                    {!compact && <span>AI Assistant</span>}
                  </button>
                </li>
              )}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn("space-y-3 border-t border-white/10 px-3 py-4", compact && "px-2")}>
        {!compact && <ThemeControl />}
        {!compact && (
          <p className="flex items-center gap-2 px-1 text-[11px] text-[var(--sidebar-text)]">
            <Activity aria-hidden="true" className="size-3.5 text-[var(--rose-gold)]" />
            Local vault · <span className="ln-data">{loadError ? "unavailable" : transactions.length}</span>{" "}
            {loadError ? "" : transactions.length === 1 ? "record" : "records"}
          </p>
        )}
      </div>
    </div>
  );
}

/** Lightweight focus trap for drawers and slide-overs. */
function useFocusTrap(active: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ),
      );
    focusables()[0]?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, [active, onClose]);

  return ref;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  // Once opened, the assistant stays mounted (hidden when closed) so closing it — including an accidental
  // Escape — does not discard the in-memory conversation or abort a reply that is still streaming.
  const [assistantMounted, setAssistantMounted] = useState(false);
  if (assistantOpen && !assistantMounted) setAssistantMounted(true);

  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const closeAssistant = useCallback(() => setAssistantOpen(false), []);
  const openAssistant = useCallback(() => {
    setMobileOpen(false);
    setAssistantOpen(true);
  }, []);

  // Close the mobile drawer whenever the route changes (state adjusted during render).
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setMobileOpen(false);
  }

  useEffect(() => {
    const open = () => setAssistantOpen(true);
    window.addEventListener("layernet-open-assistant", open);
    return () => window.removeEventListener("layernet-open-assistant", open);
  }, []);

  const mobileRef = useFocusTrap(mobileOpen, closeMobile);
  const assistantRef = useFocusTrap(assistantOpen, closeAssistant);

  return (
    <div className="min-h-screen">
      <a
        href="#ln-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-[var(--primary)] focus:px-4 focus:py-2 focus:text-[var(--primary-foreground)]"
      >
        Skip to content
      </a>

      {/* Desktop / tablet sidebar — full height from the very top */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-16 bg-[var(--sidebar)] md:block lg:w-60">
        <div className="hidden h-full lg:block">
          <SidebarContent pathname={pathname} compact={false} onOpenAssistant={openAssistant} />
        </div>
        <div className="h-full lg:hidden">
          <SidebarContent pathname={pathname} compact onOpenAssistant={openAssistant} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-[var(--sidebar)] px-4 py-3 md:hidden">
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-2 text-[var(--sidebar-text-strong)] transition-colors hover:bg-[var(--sidebar-hover)]"
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>
        <Link href="/" className="flex items-center gap-2">
          <BrandMark className="size-6" />
          <span className="ln-display text-base text-[var(--sidebar-text-strong)]">LayerNet</span>
        </Link>
        <button
          type="button"
          aria-label="Open AI assistant"
          onClick={openAssistant}
          className="ml-auto rounded-lg p-2 text-[var(--sidebar-text)] transition-colors hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-text-strong)]"
        >
          <MessageSquareText aria-hidden="true" className="size-5" />
        </button>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={closeMobile}
            className="ln-fade absolute inset-0 bg-black/50"
          />
          <div ref={mobileRef} className="ln-drawer absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-[var(--sidebar)] shadow-2xl">
            <button
              type="button"
              aria-label="Close navigation"
              onClick={closeMobile}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-text-strong)]"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
            <SidebarContent pathname={pathname} compact={false} onNavigate={closeMobile} onOpenAssistant={openAssistant} />
          </div>
        </div>
      )}

      {/* AI assistant slide-over */}
      {assistantMounted && (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="AI investigation assistant"
          hidden={!assistantOpen}
        >
          <button
            type="button"
            aria-label="Close AI assistant"
            onClick={closeAssistant}
            className="ln-fade absolute inset-0 bg-black/40"
          />
          <div
            ref={assistantRef}
            className="ln-slide-over absolute inset-y-0 right-0 flex w-full flex-col bg-[var(--page-bg)] shadow-2xl sm:w-[520px]"
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <p className="layernet-label">AI investigation assistant</p>
              <button
                type="button"
                aria-label="Close AI assistant"
                onClick={closeAssistant}
                className="rounded-lg p-1.5 text-[var(--muted-text)] transition-colors hover:bg-[var(--surface-strong)] hover:text-[var(--text)]"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <AIChat />
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex min-h-screen flex-col md:pl-16 lg:pl-60">
        <main id="ln-main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
        <footer className="border-t border-[var(--border)] px-4 py-4 sm:px-6 lg:px-8">
          <p className="text-xs text-[var(--muted-text)]">
            LayerNet research prototype · heuristic priorities are not fraud probabilities · benchmark replay is
            dataset-scoped, not live prediction.
          </p>
        </footer>
      </div>
    </div>
  );
}
