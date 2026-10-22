# Money Plan engine: decisions

Append-only. Each entry records a call `docs/money-plan-spec.md` didn't settle, or a place this engine departs
from Steady's (`Desktop\Projects\steady\packages\plan-engine`). Lead with the decision; reasoning underneath.

---

## 2026-10-21: What was copied from Steady, and what wasn't

**Decision:** copied with logic unchanged: `arithmetic.ts` (cents math on decimal.js), `calendar.ts`,
`living-allowance.ts` (USDA Moderate-Cost food plan plus BLS household supplies), `debt-simulation.ts`
(interest accrual, minimums pass, avalanche/snowball ordering, extra payment rolling into the next debt) and the
expense-reduction analysis (`gap.ts`, from `reduction.ts`). Their Steady tests came across with them in
`primitives.test.ts`. Steady's types and `formatCentsRounded` are inlined in `types.ts` and `money.ts`, because
book-api has no workspace to share `@steady/shared-types` through.

Not copied: Steady's `simulate.ts` ladder. It's built around a 401(k) match step, an investing step, gross income,
investment growth and a financial-independence number, and none of that is in this tool. The six-bucket cascade
in `cascade.ts` is new, built on Steady's debt primitives. Check-ins, replanning, steps and phase spans are
member features and stay out.

## 2026-10-21: `stepDebtMonth` is split in two

**Decision:** `stepDebtMonth` now composes `accrueAndPayMinimums` and `payExtra`. It behaves exactly as Steady's
did, and Steady's tests for it still pass.

The cascade pays extra to high-interest debt (bucket 2) and low-interest debt (bucket 5) in the same month, with the
goal and the full fund in between. Calling Steady's single function twice would charge interest twice.

## 2026-10-21: High-interest means 8% APR or more

**Decision:** `PLAN_CONFIG.highInterestThresholdPercent = 8`, inclusive.

Steady has no threshold. Its ladder sends every extra dollar at all debts in one phase. The spec says to use 8% when
Steady has none.

## 2026-10-21: Starter fund is the smaller of $1,000 or one month of essentials, for everyone

**Decision:** follows the spec and Chapter 8 ("$1,000 or one month of essentials, whichever comes first"), not
Steady.

Steady uses a flat $1,000 for salaried households and one month of essentials for variable income. Confirmed with
Luke before building.

## 2026-10-21: Essentials include debt minimums; the full fund multiplies essentials

**Decision:** essentials = must-pays + minimums, and the full fund is essentials × 3 (two steady incomes) or × 6
(one income, or unsteady).

Same call as Steady's "emergency fund covers total outflow including debt minimums": minimums are still owed if
income stops. Steady's living allowance is a must-pay line here ("Groceries and household basics"), pre-filled
from the same estimate.

## 2026-10-21: A late goal catches up toward its date

**Decision:** the goal bucket takes the larger of the goal's monthly number and what's left ÷ months left to
their date (rounded up to the dollar). Past the date, it takes whatever's left of the goal.

The spec says the goal takes "up to its monthly number." Read strictly, a goal that waits behind the starter fund
and high-interest debt for a few months can never catch up, so the "about $X more a month" figure came out
absurd (about $6,300 a month for a $12,000 goal over 33 months, which is really "clear the debt in month one").
Recomputing the monthly number from where you stand is the book's own Chapter 2 rule (amount ÷ months until
your date), applied each month. The goal monthly shown to the user is still the spec's formula: amount ÷ months,
rounded up.

## 2026-10-21: "About $X more a month" runs the full cascade

**Decision:** `extraMonthlyNeeded` is the smallest whole-dollar increase to the push that makes their date, found
by bisection over real cascade runs.

Extra money enters at the top of the cascade, so the starter fund and expensive debt take it first. That's what
actually happens if they find the money, so it's the honest number. Confirmed with Luke before building.

## 2026-10-21: Goal months count the target month

**Decision:** months to save = months from this month to the target month, plus one. A goal "by June 2029" set in
October 2026 has 33 contributions, the last in June 2029.

## 2026-10-21: Fun money that wipes out the push gets its own result

**Decision:** when leftover is positive but fun money is the same or more, `buildPlan` returns `fun_too_high` with
a suggested amount (10% of leftover, rounded to $10), not the gap plan. No PDF is made in that case.

The gap plan's levers (cut an expense, raise income) don't fit when the fix is the user's own fun number.

## 2026-10-21: Runway rounds down

**Decision:** runway is cash ÷ essentials to one decimal place, rounded down. Under one month, copy shows days
(× 30, floored), as Chapter 8 does with "about four days."

A runway is the wrong number to round up.

## 2026-10-21: The response carries milestones and this month only

**Decision:** `PlanResult` holds the core numbers, this month's split, milestone months, each debt's payoff month
and the strategy comparison. The cascade's per-month state never leaves `runCascade`.

The month-by-month road map is a member feature. A test asserts no response has a `months`, `schedule`,
`projection` or `steps` key and no array longer than 15.

## 2026-10-21: Avalanche/snowball ordering applies within each bucket

**Decision:** the chosen order sorts high-interest debts among themselves and low-interest debts among themselves.

Under snowball, a 9% card is paid before a smaller 5% car loan, because the spec's buckets put all expensive debt
before the goal. Payoff order on the debt page is the order debts actually clear, which can differ from the target
order when a small debt clears on its minimums first.

## 2026-10-21: The book's Week 4 fund line is left out of the PDF checklist

**Decision:** the personalized checklist says "open a Roth IRA if you're eligible" without the book's "look up one
S&P 500 index fund."

The spec forbids naming a fund, ticker or index in generated copy, and the compliance test enforces it.
