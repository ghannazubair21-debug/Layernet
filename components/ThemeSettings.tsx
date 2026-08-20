"use client";

import { useEffect, useState } from "react";
import { readSettings, saveSettings, type ThemeMode } from "@/components/theme";

const OPTIONS: { label: string; value: ThemeMode }[] = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];

export default function ThemeSettings() {
  const [theme, setTheme] = useState<ThemeMode>("system");

  useEffect(() => {
    const syncTheme = () => {
      const settings = readSettings();
      setTheme(settings.theme);
    };

    const frameId = window.requestAnimationFrame(syncTheme);
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  const handleThemeChange = (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    saveSettings(nextTheme);
  };

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <p className="layernet-label layernet-accent">Preferences</p>
        <h1 className="layernet-title text-3xl font-bold tracking-tight">Settings</h1>
        <p className="layernet-muted max-w-2xl">
          Choose how LayerNet should display across the dashboard and route pages.
        </p>
      </div>

      <div className="layernet-card p-6 sm:p-8">
        <fieldset>
          <legend className="layernet-label mb-4 block text-[var(--text)]">Theme</legend>

          <div
            role="radiogroup"
            aria-label="Theme selection"
            aria-describedby="theme-help"
            className="grid gap-3 sm:grid-cols-3"
          >
            {OPTIONS.map((option) => {
              const checked = theme === option.value;

              return (
                <label
                  key={option.value}
                  className={
                    "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors " +
                    (checked
                      ? "border-[var(--primary)] bg-[var(--surface-strong)] text-[var(--text)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-text)]")
                  }
                >
                  <input
                    type="radio"
                    name="theme"
                    value={option.value}
                    checked={checked}
                    onChange={() => handleThemeChange(option.value)}
                    className="h-4 w-4 accent-[var(--primary)]"
                    aria-label={option.label}
                  />
                  <span className="font-medium">{option.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <p id="theme-help" className="mt-4 text-sm text-[var(--muted-text)]">
          System follows your operating system theme. Light and Dark apply immediately and persist across refreshes.
        </p>
      </div>
    </section>
  );
}
