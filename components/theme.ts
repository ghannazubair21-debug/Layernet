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
  window.dispatchEvent(new Event(SETTINGS_CHANGE_EVENT));
}

/** Fired in the current tab whenever settings are saved (storage only fires cross-tab). */
export const SETTINGS_CHANGE_EVENT = "layernet-settings-change";

/** useSyncExternalStore subscription for the saved theme preference. */
export function subscribeToSettings(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === SETTINGS_KEY) onChange();
  };
  window.addEventListener(SETTINGS_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SETTINGS_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function readThemeMode(): ThemeMode {
  return readSettings().theme;
}

export function serverThemeMode(): ThemeMode {
  return "system";
}
