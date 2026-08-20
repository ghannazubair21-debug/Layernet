"use client";

import { useEffect } from "react";
import { applyTheme, readSettings } from "@/components/theme";

export default function ThemeProvider() {
  useEffect(() => {
    const syncTheme = () => {
      const settings = readSettings();
      applyTheme(settings.theme);
    };

    syncTheme();

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => {
      const settings = readSettings();
      if (settings.theme === "system") {
        applyTheme("system");
      }
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleSystemThemeChange);
    } else {
      mediaQuery.addListener(handleSystemThemeChange);
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === "layernet-settings") {
        syncTheme();
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", handleSystemThemeChange);
      } else {
        mediaQuery.removeListener(handleSystemThemeChange);
      }

      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return null;
}
