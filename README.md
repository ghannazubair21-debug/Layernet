# LayerNet

LayerNet is the frontend capstone for the FlyRank Frontend AI Engineering internship. It is being developed toward an AI-powered fraud detection dashboard that combines modern frontend engineering with intelligent interfaces.

## Project Status

The initial repository setup and frontend scaffolding are complete.

Current foundation:

- React
- TypeScript
- Vite
- ESLint
- AI-assisted development workflows

The next milestones include designing the core interface, building reusable UI components, and preparing the frontend for future fraud detection functionality.

## Goals

- Build a modular and maintainable frontend
- Explore AI-assisted frontend development workflows
- Create accessible and responsive user interfaces
- Prepare the frontend for future fraud detection functionality

## Development

Install dependencies:

```bash
npm install

## FE-07 — Tool Results & Structured Output

LayerNet includes a server-side AI tool that analyzes transaction risk and returns structured data for the UI.

### Tool: scoreTransaction

**Purpose:** Analyze a financial transaction and calculate a fraud risk score.

**Input schema:**

```text
amount: number
country: string
transactionType: "purchase" | "transfer" | "withdrawal" | "payment"
unusualActivity: Boolean

### Return shape

```text
{
  riskScore: number,
  riskLevel: "low" | "medium" | "high",
  transaction: {
    amount: number,
    country: string,
    transactionType: string
  },
  reasons: string[],
  recommendation: string
}