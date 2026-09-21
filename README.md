\# LayerNet



LayerNet is an AI-powered transaction risk analysis dashboard built as the capstone project for the FlyRank Frontend AI Engineering internship.



The application combines a modern Next.js frontend, structured transaction-risk analysis, browser-based history and analytics, theme customization, and a Gemini-powered AI analyst interface.



\## Live Application



Production URL:



https://layernet.vercel.app/



\## Features



\- Transaction risk analysis with structured risk scores

\- Risk levels: Low, Medium, and High

\- Transaction history with browser persistence

\- Analytics dashboard with visual transaction insights

\- Health/status dashboard

\- Theme settings and UI customization

\- AI analyst chat powered by Google Gemini

\- Structured AI tool results

\- Responsive dashboard interface

\- Keyboard-accessible navigation and interactive controls

\- Automated component and end-to-end testing



\## Tech Stack



\- Next.js 16

\- React 19

\- TypeScript

\- Tailwind CSS v4

\- Google Gemini

\- Vercel AI SDK

\- Zod

\- Vitest

\- React Testing Library

\- Playwright

\- GitHub Actions



\## Application Structure



```text

app/

├── api/

│   └── chat/

│       └── route.ts

├── analysis/

├── analytics/

├── dashboard/

├── health/

├── history/

├── micro-interactions/

├── settings/

├── globals.css

├── layout.tsx

└── page.tsx



components/

├── AIChat.tsx

├── RiskBadge.tsx

├── SmartActionButton.tsx

├── ThemeProvider.tsx

├── ThemeSettings.tsx

├── TransactionTable.tsx

└── ui/lib/

└── tools/

&#x20;   └── score-transaction.ts



e2e/

└── analysis-flow.spec.ts



\## AI Architecture



LayerNet uses Google Gemini through the Vercel AI SDK.



The main AI request flow is:



```text

User

&#x20; ↓

AI Chat Interface

&#x20; ↓

Next.js API Route

&#x20; ↓

Google Gemini

&#x20; ↓

Structured Tool / AI Response

&#x20; ↓

LayerNet UI

The Gemini API key is handled server-side and is never exposed directly to the browser.



The chat API route also defines a maximum execution duration for the AI request.



Transaction Risk Tool



The transaction analysis functionality uses a structured Zod-defined tool:



lib/tools/score-transaction.ts



The tool accepts transaction information such as:



Amount

Country

Transaction type

Unusual activity



It returns structured information including:



riskScore

riskLevel

transaction

reasons

recommendation



This structured output allows the frontend to display consistent risk information instead of relying only on free-form text.



Environment Variables



Create a .env.local file in the project root:



GOOGLE\_GENERATIVE\_AI\_API\_KEY=your\_gemini\_api\_key



The API key must remain server-side.



Do not commit .env.local or any API keys to Git.



Local Development



Clone the repository and install dependencies:



npm install



Create .env.local and add the Gemini API key.



Start the development server:



npm run dev



Then open:



http://localhost:3000

Testing



LayerNet uses Vitest and React Testing Library for component and application tests.



Run the test suite:



npm run test



The tests cover important application behavior including:



AI chat rendering and interaction states

Analysis form behavior

Risk badge states

Theme settings



AI chat tests mock the AI transport so tests do not call the real Gemini API.



End-to-End Testing



Playwright is used for the primary user flow.



Run:



npm run test:e2e



The primary flow covers:



Home

&#x20; ↓

Analysis

&#x20; ↓

Enter transaction details

&#x20; ↓

Submit analysis

&#x20; ↓

Verify risk result

&#x20; ↓

Verify supporting risk factors

&#x20; ↓

Save confirmation



The E2E tests use accessible role and label-based locators.



Continuous Integration



GitHub Actions runs the project's automated checks so that test failures can be detected before changes are merged.



The CI workflow is located at:



.github/workflows/ci.yml

\## Accessibility



LayerNet was reviewed for core accessibility requirements including:



\- Keyboard navigation

\- Visible keyboard focus

\- Logical focus order

\- Accessible labels

\- Button and link semantics

\- Form interaction

\- Navigation structure

\- Responsive interaction



Interactive controls were tested using keyboard navigation as part of the accessibility pass.



\## Security



\- Gemini API credentials are stored in environment variables.

\- API credentials are not exposed in client-side code.

\- AI requests are handled through the Next.js server route.

\- `.env.local` should never be committed.

\- Automated tests mock external AI requests where appropriate.



\## Design \& UX



LayerNet uses a dashboard-oriented interface designed around clear risk communication.



The interface includes:



\- Dashboard metrics

\- Transaction analysis

\- Risk badges

\- Transaction history

\- Analytics

\- System health information

\- Theme settings

\- AI analyst interaction



The design emphasizes readable structured information rather than presenting transaction analysis as raw AI text.



\## AI-Assisted Development



AI-assisted development was used throughout the project for implementation support, debugging, testing, accessibility review, and frontend workflow acceleration.



Human review and testing were used to validate generated changes before integration.



\## Project Milestones



The project evolved through multiple FlyRank frontend engineering milestones, including:



\- Frontend foundation and dashboard

\- Transaction risk analysis

\- Structured AI tool output

\- AI chat integration

\- UI refinement and micro-interactions

\- Automated testing

\- End-to-end testing

\- CI integration

\- Accessibility review

\- Production deployment

\- Final project documentation



\## Production



The application is designed for deployment on Vercel.



Before production deployment, verify:



1\. Production environment variables are configured.

2\. The application builds successfully.

3\. Automated tests pass.

4\. AI functionality can reach Gemini through the server-side API route.

5\. No secrets are committed to the repository.



\## Known Limitations



LayerNet is an internship capstone and is intended as a frontend/AI engineering demonstration rather than a production financial fraud prevention system.



Risk scores are application-level demonstrations and should not be treated as real financial-security decisions.



Additional production hardening would be required for a real financial system, including stronger authentication, authorization, rate limiting, monitoring, audit logging, and infrastructure-level security controls.



\## Future Improvements



Potential future improvements include:



\- Authentication and user accounts

\- Persistent server-side transaction storage

\- Stronger API abuse protection

\- More advanced risk models

\- Production monitoring and observability

\- Expanded accessibility testing

\- More comprehensive test coverage

\- Role-based access controls



\## Repository



GitHub:



https://github.com/ghannazubair21-debug/Layernet



\## License



This project was developed as an internship capstone project.

