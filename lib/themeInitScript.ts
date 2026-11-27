/**
 * Inline script that applies the saved theme before first paint (prevents a
 * light/dark flash). It lives here, not in app/layout.tsx, so next.config.ts
 * can hash exactly these bytes for the Content-Security-Policy. Any edit here
 * changes the hash automatically on the next build/dev start.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t="system";var raw=localStorage.getItem("layernet-settings");if(raw){var p=JSON.parse(raw);if(p&&(p.theme==="light"||p.theme==="dark"||p.theme==="system"))t=p.theme;}if(t==="system")t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;
