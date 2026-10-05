import "@testing-library/jest-dom";
import { afterEach, vi } from "vitest";

// Reset DOM between tests so styles/attributes don't leak across cases.
afterEach(() => {
  document.body.innerHTML = "";
});
Element.prototype.scrollTo = vi.fn();
// Polyfill for CSS.supports / getComputedStyle in jsdom (the app reads CSS
// custom properties via Tailwind, but jsdom doesn't compute them — tests that
// assert on styling rely on class/attribute presence instead).
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
}

