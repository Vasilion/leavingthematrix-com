export const SITE = {
  name: 'Leaving The Matrix',
  domain: 'leavingthematrix.io',
  tagline: 'Investing education and smart-money signals.',
  description:
    'Investing education and smart-money signals — quality businesses, valuation discount, institutional flow. Educational only — never personalized financial advice.',
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
  { href: '/portfolios', label: 'Portfolios' },
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About' },
] as const;

export const BLOG_CATEGORIES = [
  { id: 'nova-dev', label: 'Nova Dev', description: 'Build notes from the trading copilot powering our research.' },
  { id: 'market-notes', label: 'Market Notes', description: 'Weekly reads on what the tape is doing and why.' },
  { id: 'education', label: 'Education', description: 'Frameworks, mental models, and trade structures.' },
  { id: 'trade-reviews', label: 'Trade Reviews', description: 'Post-mortems on real trades — wins, losses, lessons.' },
  { id: 'announcements', label: 'Announcements', description: 'Updates from the desk.' },
] as const;

// PRICING — collapsed to two tiers 2026-05-05.
// Blue Pill = Free (newsletter — "The Long Lens", weekly).
// Red Pill = $149/mo full access (Discord Pro + Nova Fund + portfolios).
//
// MIGRATION TODO: existing Mee6 Standard ($30) / Pro ($80) subscribers need a
// migration plan before public launch. Options under consideration:
//   - Grandfather forever (keep Mee6 billing for current subs)
//   - Sunset window (e.g. 6mo) then forced migration to Stripe
//   - One-time loyalty discount on Red Pill for existing subs
// Decision pending; do not surface old Standard/Pro pricing publicly.
export const PRICING_TIERS = [
  {
    name: 'Blue Pill',
    price: 'Free',
    period: '',
    tagline: "The Long Lens — our weekly read on quality investing.",
    features: [
      'Weekly newsletter delivered to your inbox',
      'One full ticker analysis per issue, applying the framework',
      'Lessons that compound — debt-aware investing, valuation, position sizing',
      'Macro snapshot + smart-money pulse for context',
      'Educational content only — never personalized advice',
    ],
    cta: 'Subscribe', // unused when newsletterSignup=true; kept for type compat
    popular: false,
    href: '/membership',
    newsletterSignup: true,
    newsletterSource: 'membership-blue-pill',
  },
  {
    name: 'Red Pill',
    price: '$149',
    period: '/mo',
    tagline: 'Full access. The framework, the signals, the community, the tools.',
    features: [
      'Full education library — DCA to options Greeks, debt frameworks, long-term planning',
      'Every signal lane — long-term picks, dip buys, swing trades, ETF momentum, crypto',
      'Pro role in the Discord community',
      'Higher-conviction options ideas with full thesis',
      'Deep-value research — names trading near 200-week support',
      'Nova Fund — live AI-managed portfolio with weekly memos',
      'Smart Money tab — insider buys, congressional trades, 13F flows',
      "Luke's ETF Momentum + Stock Picks portfolios — auto-tracked",
      'Sector exposure + market context dashboards',
      'vs SPY benchmark with dividend reinvestment',
      'Direct line for trade questions, 1-on-1 portfolio review',
    ],
    // Sandbox testing mode: button is live and routes to Nova sign-up, but
    // Vercel still has Stripe TEST keys so no real cards are charged. Beta
    // testers help us validate the full flow before flipping to live keys.
    // To go fully live: change CTA back to "Take the Red Pill" + swap
    // Vercel Stripe env to live keys.
    cta: 'Help Me Test For Free!',
    popular: true,
    href: 'https://nova.leavingthematrix.io/sign-up',
    comingSoon: false,
  },
] as const;
