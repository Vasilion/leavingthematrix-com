# Free Money Plan Tool: Spec

Oct 21, 2026 · Luke Vasilion · Source of truth: the "Free Money Plan Tool: Spec" doc in Claude. This file is a copy for building.

## Summary

**The Free Money Plan** is a free tool at `leavingthematrix.io/tools/money-plan`. A visitor answers about 15 questions in 3–4 minutes and gets a personalized money plan as a PDF, built on the book's rules. It's the LTM site's main lead magnet and, later, the free tier that leads into LTM membership.

**Who it's for:** the book's reader. Working, probably with a family, earning decent money, and feeling like none of it sticks.

**What the user walks away with:**

- A monthly budget where every dollar has a job
- Their runway: how many months they'd last with no income
- An emergency fund target, with a first milestone
- The monthly number to hit their own goal by their date
- Which debt to pay first, and roughly when they'd be debt-free
- A 30-day checklist from the book, filled in with their numbers

**What LTM gets:** an email address (with optional weekly-email opt-in), a reason to read the book, and a warm lead for membership.

**Built from:** the book's rules (Chapters 2, 6, 8, 16 and Your First 30 Days) and the tested plan engine in the Steady repo on Luke's PC (`Desktop\Projects\steady\packages\plan-engine`). Reuse that engine; don't rewrite the math.

## User flow

1. Open the tool at `/tools/money-plan`
2. Answer 4 short steps (saved as you go)
3. See the headline numbers: leftover, runway, dates. **No email asked until here.**
4. Enter email (weekly-email opt-in box unchecked)
5. Get the PDF: it downloads right away and a copy is emailed
6. Take the next step: the book, the weekly email, membership

If their numbers don't work, the cards are replaced by the gap and the same email step sends a "here's the gap" PDF.

## Inputs

Four short steps, one screen each, with a progress bar. All amounts are monthly unless marked. Everything saves to localStorage as they go, so a refresh doesn't lose their answers.

**Step 1: Money in**

| Field | Type | Notes |
| --- | --- | --- |
| Monthly take-home pay | $ | Required. Helper: "What actually hits your bank account, after taxes." |
| Household size | 1–8 | Required. Used to pre-fill groceries |
| How steady is your income? | Choice | Steady paycheck, two incomes / One income / Commission, self-employed or layoff-prone. Sets the emergency fund months (3 / 6 / 6) |

**Step 2: Must-pays**

| Field | Type | Notes |
| --- | --- | --- |
| Rent or mortgage | $ | Required |
| Utilities and phone | $ | |
| Groceries | $ | Pre-filled from Steady's USDA-based living allowance for the household size; editable |
| Transportation (gas, car insurance, transit) | $ | Car payments go in Step 3, not here |
| Other insurance (health, life) | $ | |
| Childcare | $ | |
| Other must-pays | $ | One free-form line |

**Step 3: Debts and savings**

| Field | Type | Notes |
| --- | --- | --- |
| Debts | Repeating rows, up to 15 | Each row: name (e.g. "Car loan"), balance, interest rate (%), minimum payment. "I don't have any debt" checkbox skips it |
| Cash savings | $ | Checking + savings you could use in an emergency. Not retirement accounts |
| Employer 401(k) match? | Yes / No / Not sure | Only used for a checklist item, never for the math |

**Step 4: Your goal**

| Field | Type | Notes |
| --- | --- | --- |
| What it's for | Text, 60 chars | Placeholder: "Truck with no payment" |
| How much | $ | |
| By when | Month + year | Must be in the future |
| Fun money each month | $ | Pre-filled with 10% of what's left over, rounded to $10. Helper: "A plan with zero fun is a plan you'll quit." |

The goal is optional. If they skip it, the plan works toward the emergency fund and debt only.

**Then, before the PDF:** email address (required for the PDF) and an unchecked box: "Also send me the free weekly email: one story, one money lesson."

## The math

The plan follows the book's order: a small safety net first, then the expensive debt, then the goal and the full safety net. Reuse Steady's plan engine for the ladder, the in-month cascade, avalanche/snowball, payoff dates and the non-viable case. Extend it only where this tool needs something Steady doesn't have (the goal bucket and fun money). Where Steady already makes a call (for example, what counts as high-interest debt), follow Steady and note it in `DECISIONS.md`.

### Core numbers

| Name | Formula | From the book |
| --- | --- | --- |
| Must-pays | Sum of Step 2 | Ch 8 |
| Minimums | Sum of debt minimum payments | Ch 6 |
| Monthly essentials | Must-pays + Minimums | Ch 8 |
| Leftover | Take-home − Monthly essentials | Ch 2 |
| Push | Leftover − Fun money | Ch 16 |
| Runway | Cash savings ÷ Monthly essentials, 1 decimal place | Ch 8 |
| Starter fund | The smaller of $1,000 or one month of essentials | Ch 8 |
| Full emergency fund | Essentials × 3 (steady, two incomes) or × 6 (one income, or unsteady) | Ch 8 |
| Goal monthly | Goal amount ÷ months until the goal date, rounded up to the dollar | Ch 2 |
| Weekly version of any monthly number | Monthly × 12 ÷ 52 | Ch 2 |

Existing cash savings count toward the emergency fund, never toward the goal. The goal starts from $0.

### Where the push goes each month

Each month, the push fills these buckets in order. A bucket takes only what it needs, and the rest flows down.

1. **Starter fund,** until it reaches its target.
2. **High-interest debt:** extra payments to the first debt in the chosen order (avalanche or snowball). Use Steady's high-interest threshold; if Steady has none, use 8% APR or higher.
3. **The goal,** up to its monthly number.
4. **Full emergency fund,** until it reaches its target.
5. **Lower-interest debt:** extra payments, in the chosen order.
6. **Future you:** whatever's left. Described generically as long-term investing (see Compliance).

When a debt is paid off, its minimum payment joins the push (the snowball effect, for both strategies).

### Simulation

Run the cascade month by month from the month the plan is made, to find milestone dates. Use the engine's existing rules: monthly interest = balance × APR ÷ 12, savings earn nothing (conservative), a 40-year cap, all money in integer cents or `decimal.js`, and no `Date.now()` or randomness inside the engine. The start month is passed in.

The simulation produces these dates only: starter fund done, each debt paid off, debt-free, goal reached, full emergency fund done. **Never output the month-by-month schedule.** That stays a member feature (see Free vs members).

### Avalanche vs snowball

Always compute both. For each: the payoff order, the debt-free date and total interest paid. State the difference plainly: *"Avalanche saves you $X in interest. Snowball pays off your first debt Y months sooner."* Default to avalanche, with a toggle on the results screen. The PDF uses whichever they picked. Copy: "The best method is the one you'll actually stick with."

### The goal date

If the simulation reaches the goal by their date, say so. If not, show the realistic date and the gap: *"At these numbers you'd hit this in [Month Year]. To make [their date], you'd need about $X more a month."* Never quietly change their date.

### When the numbers don't work

If the push is zero or negative, don't build a fake plan. Use Steady's expense-reduction analysis instead: show the shortfall, their must-pays ranked biggest first, and the two levers from the book: cut or shrink the biggest expense (Ch 11), or raise income (Ch 9). The PDF still generates, as a "Here's the gap" version with the 30-day checklist.

## Outputs

### On screen, no email needed

Show enough that the tool feels useful before asking for anything:

- Four headline cards: **Leftover each month**, **Runway** ("You could last X months"), **Debt-free by** [Month Year], **Goal reached by** [Month Year].
- The avalanche/snowball toggle, with the one-line difference.
- If the numbers don't work: the shortfall and the biggest must-pay, instead of the cards.
- Then the gate: **"Get your full plan as a PDF"**, with the email field and the unchecked weekly-email box.

### The PDF

US Letter, in the book's look: black, off-white `#E9E6DF` and red `#D7192F`, Archivo / Archivo Black. Eight pages at most. Each page has one job. Every page footer: *"Not financial advice. Built from the book Disqualified by Luke Vasilion. leavingthematrix.io"*

| Page | Title | What's on it |
| --- | --- | --- |
| 1 | Your Money Plan | Date made, the four headline numbers, and the line "You don't have to fix everything at once. You just have to do the next small thing." |
| 2 | Where you stand | Money in, must-pays (itemized), minimums, leftover. Runway as a sentence: "If your income stopped today, you'd last about X months." |
| 3 | Your monthly budget | This month's split as a table: must-pays, debt minimums, fun, then each push bucket with its amount, monthly and weekly. Header: "Every dollar has a job." |
| 4 | Your safety net | Starter fund target and the month they'll hit it. Full fund target, the number of months it covers, and the month they'll hit it. Where to keep it: a separate high-yield savings account, named "Plan B." |
| 5 | Your goal | What it's for, the monthly and weekly number, the date (or the realistic date and the gap). Tip: give it its own account with its name on it. Skipped if there's no goal. |
| 6 | Your debt | Both orders side by side with debt-free date and total interest. Their pick highlighted. The first target in big type: "Start here: [debt name]." Skipped if there's no debt. |
| 7 | Your rules | Three rules from Chapter 16, filled in: an everyday spending cap, the fun card ("the statement is the scoreboard"), surprise money split 80/20. |
| 8 | Your first 30 days | The book's four-week checklist, personalized: e.g. "Open a high-yield savings account named Plan B and move $X into it," "Send an extra $Y to [first debt]." Ends with the next step (see below). |

**The next step on page 8 and on screen after download:**

1. The book: "Read the first chapter of Disqualified free" (link to `/disqualified#free-chapter`).
2. The weekly email, if they didn't opt in.
3. Membership: "When your safety net is built and you're ready to invest, that's what Leaving the Matrix is for." Link to `/membership`. Don't promise member features that don't exist yet.

### The delivery email

Subject: *"Your Money Plan"*. Plain and personal, same style as the book delivery email: the PDF attached, one line on where to start ("Start with page 8"), and a link to the free chapter. From Luke.

## Free vs members

The free tool gives a complete, useful snapshot: where you are, this month's budget, and the milestone dates. Anything that keeps a plan alive over months is held back for LTM members later, when that side gets built.

| Free (this tool) | Members, later |
| --- | --- |
| This month's budget | The month-by-month road map to debt-free |
| Milestone dates | Monthly check-ins and progress tracking |
| Both debt strategies compared | Replanning when life changes |
| The 30-day checklist | Achievements and streaks |
| A one-time PDF | Partner sharing |

The engine already computes the full schedule internally. The free tool's API must only return milestone dates and this month's split, so the schedule can't be pulled out of a response.

## Technical design

Build it inside the existing `leavingthematrix-com` repo: the Astro site for the page, and the existing `book-api` Lambda for the server side. No new infrastructure.

### Where the code goes

| Piece | Location | Notes |
| --- | --- | --- |
| Plan engine | `book-api/src/plan/` | Copied from `Desktop\Projects\steady\packages\plan-engine` with its tests, then extended with the goal bucket and fun money. Keep it pure: no I/O, no `Date.now()`, no floats for money |
| Page | `src/pages/tools/money-plan.astro` | Linked from `/tools`, the homepage and `/disqualified` |
| Form and results | A Svelte island in `src/components/` | Step form, localStorage, headline cards, toggle, email gate |
| Live preview math | Calls the API | The headline cards come from `POST /plan/preview`, so the engine lives in one place |
| PDF and email | `book-api` | `POST /plan/pdf` renders the PDF, emails it, and returns it for download |

### API routes (in `book-api/src/handler.ts`)

- **`POST /plan/preview`**: inputs in, headline numbers and both debt strategies out. No email needed. Rate-limited by IP.
- **`POST /plan/pdf`**: inputs, email, opt-in and chosen strategy in. Validates, rate-limits by email and IP, records the lead, subscribes to the weekly email only if opted in, renders the PDF, emails it as an attachment through SES, and returns the PDF so the browser downloads it right away. If the email fails, the download still works and the error is logged.

Validate every input on the server: required fields, positive amounts with sane caps (e.g. take-home under $1,000,000 a month), at most 15 debts, a goal date in the future, APR between 0 and 100.

### PDF rendering

Render on the server with a library that works in Lambda without a browser (for example `pdf-lib` or `pdfkit`), with Archivo and Archivo Black embedded. Keep the Lambda bundle reasonable. Check that SESv2's simple content supports attachments; if not, send a raw MIME message.

### Data and privacy

- **Store the lead only:** `lead#<email>` in the existing table, with `source: "money-plan"`, the opt-in flag and a timestamp. Reuse `recordLead` from the free-chapter work.
- **Never store or log financial inputs.** Not in DynamoDB, not in CloudWatch. Redact them from error logs.
- **Update the privacy page** to say the tool's inputs are used to build the plan and aren't saved.

### Code rules

Luke's rules apply everywhere: no code comments, explicit types (no implicit `any`, no `var`), and no `async`/`await` (use `.then()` chains). Match the repo's existing patterns in `book-api` and the Astro components.

## Compliance and copy

Budgeting and debt-payoff guidance is fine. Specific investment advice is not. These are Steady's rules, carried over:

- **Never name a stock, fund or ticker. Never recommend an allocation percentage.** The "Future you" bucket says only: *"Long-term investing, like a low-cost diversified fund inside your employer plan or an IRA."*
- **No promises.** Never "guaranteed," "you will," or "risk-free." Dates are estimates: "at these numbers, about [Month Year]."
- **The not-financial-advice line** sits on the results screen, in the email, and in every PDF footer.
- **Carry over Steady's compliance test** that scans generated copy for tickers, allocation splits and "guaranteed," and run it against every PDF string.

**Voice:** the book's. Plain English, short sentences, a little blunt, never preachy. Talk about disorganization, not poverty or crisis. No shaming copy when the numbers don't work: *"Your numbers don't work yet. Here's the gap, and the two ways to close it."*

## Done means

- [ ] `/tools/money-plan` is live, works at 390px wide with no sideways scrolling, and is linked from `/tools` (replacing the unnamed placeholder there), the homepage and `/disqualified`
- [ ] The headline cards appear without an email, from `POST /plan/preview`
- [ ] Entering an email downloads the PDF immediately and emails a copy, which lands in the inbox (not spam) at an unverified address
- [ ] The PDF is 8 pages or fewer, in the book's look, and skips the goal or debt page when there's no goal or debt
- [ ] Engine tests cover: no debt, no goal, a goal that's reachable, a goal that isn't, avalanche vs snowball giving different orders, the non-viable case, and a debt that never clears on minimums
- [ ] Neither API response contains a month-by-month schedule
- [ ] No financial input appears in DynamoDB or CloudWatch (check the logs after a test run)
- [ ] The compliance test passes against every PDF string
- [ ] The privacy page is updated
- [ ] Typecheck and build pass for both the site and `book-api`

**Deploy order:** `book-api` to test, try it end to end, then live; merge the site PR last. Same as the free chapter.

## Out of scope

- Accounts, saved plans, check-ins, achievements, partner sharing (members, later)
- Bank connections (Plaid)
- Renaming or launching Steady
- Any investment recommendation beyond the generic line above
