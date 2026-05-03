export const SITE = {
  name: 'Leaving The Matrix',
  domain: 'leavingthematrix.io',
  tagline: 'Data-driven investing education and signals.',
  description:
    'Investing education, market signals, debt-management frameworks, and the long-term discipline that turns markets into a real wealth-building tool. Educational only — never personalized financial advice.',
  discord: {
    invite: 'https://mee6.xyz/en/m/1384673721599397948',
    subscribe: 'https://mee6.xyz/en/m/1384673721599397948?subscribe=1428981437381615616&bundle=1',
  },
  parentCompany: 'Unycross LLC',
  legalName: 'Unycross LLC',
  founder: 'Luke Vasilion',
} as const;

export const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/membership', label: 'Membership' },
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

export const PRICING_TIERS = [
  {
    name: 'Standard',
    price: '$30',
    period: '/mo',
    tagline: 'The full education and signals stack.',
    features: [
      'Education library — DCA, set-and-forget portfolios, market mechanics',
      'Debt-management and long-term planning frameworks',
      'Long-term high-conviction stock picks',
      'Buy-the-dip and swing-trade ideas',
      'ETF momentum and passive-income strategies',
      'Crypto coverage',
      'Market watch and weekly recap',
      'Active community chat',
    ],
    cta: 'Join Standard',
    popular: false,
  },
  {
    name: 'Pro',
    price: '$80',
    period: '/mo',
    tagline: 'Everything in Standard, plus higher-conviction research and direct access.',
    features: [
      'Everything in Standard',
      'Pro-chat access',
      'Deep-value research — names trading near 200-week support',
      'Higher-conviction options ideas with full thesis',
      '1-on-1 portfolio review with Luke',
      'Direct line for trade questions',
    ],
    cta: 'Join Pro',
    popular: true,
  },
] as const;
