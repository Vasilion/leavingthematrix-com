export const SITE = {
  name: 'Leaving The Matrix',
  domain: 'leavingthematrix.io',
  tagline: 'A plan for your money. The investing basics, in order.',
  description:
    'Write a real plan for your money, learn investing one step at a time, and ask questions in a community doing the same. Educational only, never personalized financial advice.',
  // Discord links remain referenced for the existing Mee6 subscriber base
  // (Standard $30 / Pro $80) until the Stripe + role-bot migration ships.
  // Public-facing CTAs no longer point here — site flow is /membership.
  discord: {
    invite: 'https://mee6.xyz/en/m/1384673721599397948',
    subscribe: 'https://mee6.xyz/en/m/1384673721599397948?subscribe=1428981437381615616&bundle=1',
  },
  parentCompany: 'Unycross LLC',
  legalName: 'Unycross LLC',
  founder: 'Luke Vasilion',
} as const;

// TODO(nova-launch): when nova.leavingthematrix.io is deployed on Amplify,
// flip the Red Pill `comingSoon: true` to false in PRICING_TIERS below — its
// CTA points at the Stripe checkout flow on the Nova subdomain.
export const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/membership', label: 'Membership' },
  { href: '/thesis', label: 'Sunday Thesis' },
  { href: '/tools', label: 'Tools' },
  { href: '/disqualified', label: 'Book' },
  { href: '/about', label: 'About' },
] as const;

export const BLOG_CATEGORIES = [
  { id: 'education', label: 'Education', description: 'Frameworks, mental models, and trade structures.' },
  { id: 'nova-dev', label: 'Nova Dev', description: 'How the research tool works, in plain terms.' },
  { id: 'market-notes', label: 'Market Notes', description: 'Weekly reads on what the tape is doing and why.' },
  { id: 'trade-reviews', label: 'Trade Reviews', description: 'Post-mortems on real trades: wins, losses, lessons.' },
  { id: 'announcements', label: 'Announcements', description: 'Updates.' },
] as const;

// PRICING — collapsed to two tiers 2026-05-05.
// Blue Pill = Free (newsletter — "Free Your Mind", weekly).
// Red Pill = $79.99/mo (was $149 until 2026-10-26) full access (plan + path + weekly lesson + Discord Pro + research tools; members-area v1, 2026-10-28).
//
// MIGRATION TODO: existing Mee6 Standard ($30) / Pro ($80) subscribers need a
// migration plan before public launch. Options under consideration:
//   - Grandfather forever (keep Mee6 billing for current subs)
//   - Sunset window (e.g. 6mo) then forced migration to Stripe
//   - One-time loyalty discount on Red Pill for existing subs
// Decision pending; do not surface old Standard/Pro pricing publicly.
export const PRICING_TIERS = [
  {
    // Tier name renders as HTML — "Blue" gets the blue word color, "Pill"
    // stays in surrounding bone color. PricingTier.astro renders this with
    // set:html so the span survives.
    name: '<span class="text-sky-400">Blue</span> Pill',
    price: 'Free',
    period: '',
    tagline: 'One lesson a week, taught through one company.',
    features: [
      'The free weekly email, every Sunday at 7pm ET',
      'One lesson a week, taught through one company',
      'The numbers shown, the bear case stated, and what would change the view',
      'Plus the foundations that compound: debt, runway, safety net, DCA, ETF cores, sizing',
      'The free Money Plan and Own It Lower, no account needed',
      'Educational content only, never personalized advice',
    ],
    cta: 'Subscribe', // unused when newsletterSignup=true; kept for type compat
    popular: false,
    href: '/membership',
    newsletterSignup: true,
    newsletterSource: 'membership-blue-pill',
  },
  {
    name: '<span class="text-red-400">Red</span> Pill',
    price: '$79.99',
    period: '/mo',
    annualPrice: '$799',
    annualPeriod: '/yr',
    annualSavingsLabel: 'Save $160',
    tagline: 'The whole thing. Your plan, the path, the community.',
    features: [
      'My Plan: your budget, runway, safety net, debt order and goal, written down in one place',
      'A 12 week path: the plan first, then investing basics, then selling options basics on paper',
      'The Library: the basics explained once, from budgeting to the Greeks',
      'One lesson a week, taught through one company',
      'The Discord community: click "Pro Discord" in the members area to join',
      'Optional advanced research: Nova Lookup, the Screener, Smart Money',
      'Educational content only, never personalized advice',
    ],
    cta: 'Join',
    popular: true,
    href: 'https://nova.leavingthematrix.io/sign-up?plan=monthly',
    annualHref: 'https://nova.leavingthematrix.io/sign-up?plan=annual',
    membersHref: 'https://nova.leavingthematrix.io/home',
    upgradeHref: 'https://nova.leavingthematrix.io/checkout?plan=monthly',
    annualUpgradeHref: 'https://nova.leavingthematrix.io/checkout?plan=annual',
    comingSoon: false,
  },
] as const;
