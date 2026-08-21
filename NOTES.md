Playground: Accessible Component Fundamentals

Files added (isolated under playground/):
- playground/components/Modal.tsx
- playground/components/Tabs.tsx
- playground/components/Disclosure.tsx
- playground/page.tsx

Implementation notes
- Modal
  - role="dialog" and aria-modal="true" used; aria-labelledby when title provided.
  - Focus is moved into the dialog on open; Tab/Shift+Tab are trapped to the dialog.
  - Escape closes the dialog; clicking the backdrop closes the dialog.
  - The previously focused element is restored when the dialog closes.
  - While open, other page content is set to aria-hidden="true" and document.body scrolling is disabled.
  - Implemented without portals to remain simple and isolated in the playground.

- Tabs
  - Implements WAI-ARIA tabs pattern with role="tablist", role="tab", role="tabpanel".
  - Uses aria-selected, aria-controls, and tabIndex correctly.
  - Keyboard support: ArrowRight, ArrowLeft, Home, End, Enter/Space to activate.
  - Selected tab receives focus.

- Disclosure
  - Button uses aria-expanded and aria-controls; controlled content has a stable ID.
  - Clicking toggles content; Enter/Space activate the button naturally.

Accessibility notes and limitations
- The modal uses aria-hidden on sibling elements to block background interaction. Using the inert attribute or a portal-based modal with an inert polyfill would be more robust across complex apps and for true focus-inert behavior.
- Focusable element detection uses a conservative selector; custom focusable elements or shadow DOM may not be detected.
- The modal is not portaled to document.body; in apps with overflow/stacking contexts, moving the modal to a top-level portal is recommended.
- Manual testing with VoiceOver, NVDA, and JAWS across browsers is recommended to validate screen reader announcements.

Verification commands run (from repository root):
- npm run lint
- npm run build

Do not commit these changes yet.
