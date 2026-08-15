# AI-Assisted Workflow Comparison

## Feature

For FE-03, I built a settings form twice in the Layernet React + TypeScript project: first using a vague prompt and then using a precise, structured prompt.

## Round 1 — Vague Prompt

The first round used a fresh AI session and a deliberately simple prompt: “Create a simple settings form for this React project with name, email, theme, and a save button.”

The AI produced a working form with Name, Email, Theme, and Save fields. It added `SettingsForm.tsx`, `SettingsForm.css`, and integrated the form into `App.tsx`. It also added basic localStorage persistence and theme handling.

The result was functional, but the prompt did not explicitly request validation, accessibility requirements, automated tests, reusable utilities, or edge-case handling. As a result, I had to rely more heavily on manual review to determine whether the implementation met those requirements.

## Round 2 — Precise Prompt

For the second round, I used a fresh AI session and a separate branch. The prompt instructed the AI to inspect the project, create an implementation plan, follow specific validation and accessibility requirements, avoid unnecessary dependencies, preserve the existing styling, and verify the implementation with tests and a production build.

The implementation was more structured. It introduced separate utilities for types, validation, localStorage, and theme handling. The form included required-field validation, email-format validation, accessible labels, `aria-invalid`, error messages, immediate theme application, and persisted settings.

The AI also created automated tests covering labels, validation, saving, theme changes, and loading saved settings. `npm test` passed all 6 tests, and `npm run build` completed successfully.

## Comparison and Review

The main difference was not simply the amount of code but the amount of verification and review effort. Round 1 was quicker to generate, but its vague requirements meant more manual checking was necessary. Round 2 required more initial prompting and planning, but the verification loop reduced uncertainty and made the result easier to review.

A specific AI issue I caught was the pre-existing ESLint configuration problem involving the duplicate `Layernet/` subfolder. I recorded it rather than incorrectly treating it as a new feature bug.

Round 2 also handled more edge cases, especially invalid input, missing required values, saved settings, and theme persistence. Accessibility was explicitly considered instead of being left to chance.

## Lessons Learned

The main lesson is that AI output quality depends heavily on how clearly the task, constraints, examples, and verification steps are specified. A vague prompt can produce a functional result, but a precise prompt with an explore → plan → code → test → review workflow produces a result that is easier to verify and maintain.

For future work, I will use precise requirements, project-specific constraints, automated verification, and a final manual review instead of simply accepting generated code.
