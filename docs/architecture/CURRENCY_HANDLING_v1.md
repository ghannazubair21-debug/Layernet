# Currency handling v1 — strategy, scoring implications and test plan

Status: IMPLEMENTED (display, storage, form, feature aggregation). Scoring formula UNCHANGED.
Date: 2026-11-27
Related: `docs/architecture/DATA_CONTRACT_v1.md` (finding F4 "no currency", decision D10 "legacy currency null").

## 1. What the code did before this change

| Area | Behaviour | Problem |
|---|---|---|
| `TransactionRecord` (`lib/types.ts`) | `amount: number`, no currency | Amount meaning is undefined. |
| Display (`formatUsd` in `lib/utils.ts`) | Every amount rendered as `$X` (USD) | Asserted a currency that was never recorded. |
| Rules factor text (`lib/fraudAnalysis.ts`) | `Amount baseline: $X contributes N points` | Same USD assertion inside the explanation. |
| Feature aggregation (`lib/featureEngineering.ts`, `lib/behavioralBaseline.ts`) | Sums / means / std-dev over all prior account amounts | Would silently mix currencies once more than one exists. |
| Unused AI tool `lib/tools/score-transaction.ts` | Schema says "amount in USD" | Not wired to any route; left untouched and reported. |

## 2. How the rules score uses the amount

```
amountBaseline = min(50, floor(10 · log10(max(1, amount))))
```

The score uses the **nominal** number only. It is currency-blind. Consequences (pure arithmetic, no exchange
rates are used or implied):

* If the same economic value is expressed in a currency whose unit is worth *k* times less, the baseline rises
  by `10 · log10(k)` points (e.g. k = 100 → +20, k = 1000 → +30) until the 50-point cap.
* The cap is reached at a nominal amount of 100,000. In currencies with small unit values (PKR is the requested
  demo default) ordinary transactions can reach the cap, so the amount factor loses its ability to separate
  amounts above that value.
* Thresholds `Review ≥ 60`, `Block ≥ 85` and risk bands `Medium ≥ 40`, `High ≥ 80` were never calibrated for any
  currency (the score is an uncalibrated heuristic priority, see `RiskAssessment.scoreKind`).
  *Update 2026-11-28 (rules baseline v1.1):* the separate risk bands were removed; the risk level now follows the
  decision (Low < 60, Medium 60–84, High ≥ 85, `lib/riskBands.ts`). The score formula and the Review/Block
  thresholds are unchanged, and neither set of thresholds is calibrated.

## 3. Decision taken in this change

1. **No change to the scoring formula, thresholds or method name** ("LayerNet rules baseline v1"). Scores for the
   same nominal input are identical before and after this change (covered by a regression test).
2. **No exchange-rate conversion.** No FX source is authorized or documented, so amounts are stored and shown
   in their original currency only. Amounts in different currencies are never summed or compared.
3. **Disclosure instead of silent assumption.** The amount factor now states the original currency and that the
   baseline uses the nominal amount without currency adjustment; a matching limitation is listed in every result.

### Options for a future scoring change (requires authorization, not implemented)

| Option | What it needs | Risk |
|---|---|---|
| A. Per-currency reference amount (`baseline = f(amount / referenceAmount[currency])`) | A documented, owner-approved table of reference amounts per currency, versioned with the method (→ "rules baseline v2") | Table governance; scores change for every non-reference currency. |
| B. Convert to a reporting currency before scoring | An authorized FX source with timestamped rates stored alongside each assessment | Rate provenance, reproducibility of historical scores. |
| C. Keep currency-blind (current) | Nothing | Amount factor not comparable across currencies; disclosed. |

Any of A/B must ship as a new method version with a new `RiskAssessment` (assessments are append-only), plus a
validation set showing score distributions per currency before and after.

## 4. Data model

* `TransactionRecord.currency?: string` — ISO 4217 alphabetic code (`^[A-Z]{3}$`), stored with the original amount.
* New records from the Analysis form always carry a currency; the selector defaults to **PKR** and offers
  PKR, USD, EUR, GBP, AED, SAR.
* Legacy records (saved before this change) have no `currency`. They are **not** assumed to be PKR or USD:
  storage decoding leaves the field absent and the UI shows `UNKNOWN`.
* Storage decoding accepts any well-formed ISO code (so a later change to the selectable list does not turn
  existing records into unknown) and drops malformed values (they decode as unknown, the record is kept).
* Domain contract: `mapLegacyLocalRecord` passes a recorded, well-formed currency through and maps an absent one
  to `null`, which the `TransactionFactSchema` allows only for `legacy-local-import` provenance (D10).

## 5. Feature aggregation

* Amount aggregates (`amountLast24Hours`, `averageAmount`, `amountStandardDeviation`, `amountZScore`) only use
  prior records whose currency equals the current transaction's currency. Records with unknown currency are
  excluded from amount aggregates; counts and change flags (currency-independent) still use all prior records.
* An upstream `velocity.amountLast24Hours` snapshot is treated as being in the transaction's currency.
* These features are displayed as context and do **not** affect the score.

## 6. Test plan

| Test | Location |
|---|---|
| Score for identical nominal input is unchanged; factor text names the currency and states "not currency-adjusted" | `lib/__tests__/fraudAnalysis.currency.test.ts` |
| `formatAmount` renders the original currency and `UNKNOWN` for missing currency; never `$` for unknown | same |
| Storage: currency round-trips; legacy record without currency decodes with `currency` absent; malformed currency dropped, record kept | same |
| Aggregates exclude other-currency and unknown-currency history | same |
| Legacy import passes a recorded currency through and maps missing to `null` | `lib/domain/__tests__/contracts.test.ts` |
| Analysis form: currency select is labelled, defaults to PKR, selection is saved with the record | `app/analysis/__tests__/page.test.tsx` |
| Browser: History/Dashboard show `PKR …` for new records and `UNKNOWN` for legacy ones | Phase 3 browser QA |
