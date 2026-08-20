export const SETTINGS_KEY = "layernet-settings";

export type ThemeMode = "system" | "light" | "dark";

export type LayerNetSettings = {
  theme: ThemeMode;
};

const VALID_THEMES: ThemeMode[] = ["system", "light", "dark"];

export function resolveTheme(theme: ThemeMode): "light" | "dark" {
  if (theme === "system") {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  return theme;
}

export function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolveTheme(theme));
}

export function readSettings(): LayerNetSettings {
  if (typeof window === "undefined") return { theme: "system" };

  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { theme: "system" };

    const parsed = JSON.parse(raw) as Partial<LayerNetSettings>;
    const theme = parsed.theme;

    if (theme && VALID_THEMES.includes(theme as ThemeMode)) {
      return { theme: theme as ThemeMode };
    }
  } catch {
    // Ignore invalid stored values and fallback to the default system preference.
  }

  return { theme: "system" };
}

export function saveSettings(theme: ThemeMode) {
  if (typeof window === "undefined") return;

  const settings: LayerNetSettings = { theme };
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  applyTheme(theme);
}
