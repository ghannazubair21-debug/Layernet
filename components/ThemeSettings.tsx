"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { readSettings, saveSettings, type ThemeMode } from "@/components/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { label: string; value: ThemeMode; icon: typeof Sun; description: string }[] = [
  { label: "System", value: "system", icon: Monitor, description: "Follow your operating system appearance." },
  { label: "Light", value: "light", icon: Sun, description: "Warm white and blush surfaces." },
  { label: "Dark", value: "dark", icon: Moon, description: "Deep plum-charcoal surfaces." },
];

/** Theme preference contract (pinned): radios System/Light/Dark, layernet-settings persistence, data-theme. */
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
    <fieldset>
      <legend className="layernet-label mb-3 block">Theme</legend>
      <div role="radiogroup" aria-label="Theme selection" aria-describedby="theme-help" className="grid gap-3 sm:grid-cols-3">
        {OPTIONS.map((option) => {
          const checked = theme === option.value;
          const Icon = option.icon;
          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors",
                checked
                  ? "border-[var(--primary)] bg-[var(--rose-tint)]"
                  : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--rose-soft)]",
              )}
            >
              <input
                type="radio"
                name="theme"
                value={option.value}
                checked={checked}
                onChange={() => handleThemeChange(option.value)}
                className="mt-0.5 size-4 accent-[var(--primary)]"
                aria-label={option.label}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--text)]">
                  <Icon aria-hidden="true" className="size-4 text-[var(--primary)]" />
                  {option.label}
                </span>
                <span className="mt-1 block text-xs text-[var(--muted-text)]">{option.description}</span>
              </span>
            </label>
          );
        })}
      </div>
      <p id="theme-help" className="mt-3 text-xs text-[var(--muted-text)]">
        System follows your operating system theme. Light and Dark apply immediately and persist across refreshes.
      </p>
    </fieldset>
  );
}
