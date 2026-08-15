# LayerNet Frontend Project Plan

## Project Context
LayerNet is the frontend repository for a future AI-powered fraud detection dashboard. The application will be part of a broader fraud detection system that connects to a backend and AI model based on a Transformer architecture. For the FE-01 setup phase, this repository is being initialized with project-level infrastructure only.

## Planned Frontend Stack
- React
- Vite
- TypeScript
- Tailwind CSS

## Future Application Scope
The dashboard will eventually display fraud insights, risk scores, alerts, and detailed transaction analytics. It will integrate with an AI/backend system to surface model predictions, explainability data, and real-time monitoring for fraud detection.

## Development Conventions
- Use clean component architecture and structure components for reuse and separation of concerns.
- Build responsive UI layouts that adapt across desktop, tablet, and mobile screens.
- Favor semantic HTML and accessible interactive components.
- Apply TypeScript best practices, including strict typing, clear props interfaces, and safe state management.
- Keep code maintainable by minimizing duplication, using composable utilities, and organizing feature-specific modules.
- Use consistent styling patterns that align with Tailwind CSS conventions and design system principles.

## Notes
- No application source code is being created in this setup phase.
- This repository is prepared for future frontend development while preserving a clean foundation.
## FE-03 Project Rules

1. Forms must use controlled React inputs and keep form state inside the form component. Do not use uncontrolled inputs for application settings forms.

2. All settings form fields must have accessible labels and validation feedback. Required fields must show clear error messages, and invalid fields should use appropriate accessibility attributes such as `aria-invalid`.

3. Settings data must use the `layernet-settings` localStorage key and must be validated before saving. Theme changes must support System, Light, and Dark options and must persist across page reloads.